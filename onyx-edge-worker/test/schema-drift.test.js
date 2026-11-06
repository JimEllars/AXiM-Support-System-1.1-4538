/**
 * Schema-drift guard for `src/index.ts` against `../supabase/migrations`.
 *
 * Every defect in phase 162 was the same shape: the worker wrote or read a
 * column (or a whole table) that no migration creates. Nothing in CI could see
 * it — the worker suites mock Supabase, and `wrangler deploy --dry-run` only
 * checks binding shape — so it was found by reading 8,700 lines and noticing
 * that `events_ax2024` has `created_at` and not `timestamp`.
 *
 * The durable fix the phase-162 notes asked for is a migration replay against a
 * real Postgres. That needs a database in CI (and `pg_cron`, `pgvector` and
 * `uuid-ossp` on top), so this test is the offline subset that runs anywhere:
 * parse the DDL in `supabase/migrations/*.sql` into a table -> column map, then
 * assert that every table and column `src/index.ts` touches exists in it.
 *
 * It is a static check, so it is deliberately conservative: it only reasons
 * about shapes it can read unambiguously. Anything it cannot parse is skipped
 * rather than guessed at, and the skip counter below pins how much of the file
 * it actually covers so the guard cannot silently stop guarding.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(join(here, '..', 'src', 'index.ts'), 'utf8');
const migrationsDir = join(here, '..', '..', 'supabase', 'migrations');

/**
 * Blank out comments while preserving every byte offset, so a code sample
 * inside an explanatory comment (`.gte('timestamp', ...)` in a note about the
 * `created_at` fix) is not itself reported as drift. Quotes are tracked so
 * `https://` inside a string literal is not mistaken for a line comment.
 */
function maskComments(src) {
  const out = src.split('');
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < src.length) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 1;
      }
    }
  }
  return out.join('');
}

/**
 * Platform tables that the Core schemas own and the Support migrations only
 * reference (FKs, RLS, ALTER TABLE). `20260101000000_platform_baseline.sql`
 * creates them so the chain can replay on a fresh project; they are listed here
 * so a rename in the worker is caught even if the baseline migration changes.
 */
const PLATFORM_TABLES = ['contacts_ax2024', 'organizations'];

/** Storage buckets are created by migration, not by DDL on a table. */
const STORAGE_BUCKETS = new Set(['ticket_attachments']);

/**
 * Parse `create table` / `alter table ... add column` / `alter table ... drop
 * column` out of the migration chain, in version order, into
 * `Map<table, Set<column>>`.
 */
function loadSchema() {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const tables = new Map();

  const ensure = (name) => {
    if (!tables.has(name)) tables.set(name, new Set());
    return tables.get(name);
  };

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
      // strip line comments so `-- ... ADD COLUMN` in prose is not parsed
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    // CREATE TABLE [IF NOT EXISTS] [schema.]name ( <body> )
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:public|auth)\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    let m;
    while ((m = createRe.exec(sql))) {
      const table = m[1];
      const cols = ensure(table);
      // Walk to the matching close paren so nested CHECK(...) / REFERENCES do
      // not truncate the body.
      let depth = 1;
      let i = createRe.lastIndex;
      const start = i;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') depth -= 1;
        i += 1;
      }
      const body = sql.slice(start, i - 1);
      for (const raw of splitTopLevel(body)) {
        const line = raw.trim();
        if (!line) continue;
        const head = line.split(/\s+/)[0].toLowerCase();
        // Table-level constraints are not columns.
        if (['constraint', 'primary', 'foreign', 'unique', 'check', 'exclude', 'like'].includes(head)) continue;
        const name = line.match(/^"?([a-z0-9_]+)"?/i);
        if (name) cols.add(name[1]);
      }
    }

    // ALTER TABLE [IF EXISTS] [schema.]name <clauses> — a single statement may
    // carry several ADD/DROP COLUMN clauses separated by commas, which is how
    // the reconciliation migrations are written.
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:(?:public|auth)\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql))) {
      const cols = ensure(m[1]);
      const clauses = m[2];
      const addRe = /add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi;
      let c;
      while ((c = addRe.exec(clauses))) cols.add(c[1]);
      const dropRe = /drop\s+(?:column\s+)?(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi;
      while ((c = dropRe.exec(clauses))) cols.delete(c[1]);
    }
  }

  for (const t of PLATFORM_TABLES) ensure(t);
  return tables;
}

/** Split a fragment on commas that are not nested inside (), [] or {}. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

const schema = loadSchema();

/** Method names whose first string argument is a column on the chained table. */
const COLUMN_METHODS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'containedBy', 'overlaps', 'textSearch', 'order', 'not',
];

/**
 * Walk every `<client>.from("table")` chain in the worker and collect the table
 * plus the column names used in that chain. The chain ends at the next
 * `.from(`; anything after that belongs to a different query.
 */
function collectReferences(src) {
  const refs = new Map();
  const fromRe = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/gi;
  const matches = [...src.matchAll(fromRe)];

  matches.forEach((m, idx) => {
    const table = m[1];
    // `.storage.from("bucket")` is a bucket, not a table.
    const prefix = src.slice(Math.max(0, m.index - 20), m.index);
    if (/\.storage$/.test(prefix)) return;

    const chainStart = m.index + m[0].length;
    const chainEnd = idx + 1 < matches.length ? matches[idx + 1].index : src.length;
    const chain = src.slice(chainStart, chainEnd);
    const lineOf = src.slice(0, m.index).split('\n').length;

    if (!refs.has(table)) refs.set(table, { line: lineOf, columns: new Map() });
    const entry = refs.get(table);

    const note = (col, offset) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(col)) return;
      const line = src.slice(0, chainStart + offset).split('\n').length;
      if (!entry.columns.has(col)) entry.columns.set(col, line);
    };

    // .select("a, b, c") — plain column lists only. Embedded resources
    // ("table(col)"), casts, aliases and `*` are skipped.
    const selectRe = /\.select\(\s*["'`]([^"'`]*)["'`]/gi;
    let s;
    while ((s = selectRe.exec(chain))) {
      const list = s[1];
      if (/[()*!:{}=]/.test(list)) continue;
      for (const part of list.split(',')) {
        const col = part.trim().split(/\s+/)[0];
        if (col) note(col, s.index);
      }
    }

    // .insert({ a: 1, b: 2 }) / .update({ ... }) / .upsert({ ... }) — top-level
    // object keys only.
    const objectRe = /\.(?:insert|update|upsert)\(\s*\{/gi;
    let o;
    while ((o = objectRe.exec(chain))) {
      let depth = 0;
      let i = o.index + o[0].length - 1;
      const start = i + 1;
      while (i < chain.length) {
        if (chain[i] === '{') depth += 1;
        else if (chain[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        i += 1;
      }
      for (const raw of splitTopLevel(chain.slice(start, i))) {
        const key = raw.trim().match(/^["']?([a-z_][a-z0-9_]*)["']?\s*:/i);
        if (key) note(key[1], o.index);
      }
    }

    // Filter / sort / predicate helpers.
    const methodRe = new RegExp(`\\.(?:${COLUMN_METHODS.join('|')})\\(\\s*["'\`]([a-z_][a-z0-9_]*)["'\`]`, 'gi');
    let f;
    while ((f = methodRe.exec(chain))) note(f[1], f.index);
  });

  return refs;
}

const references = collectReferences(maskComments(workerSrc));

describe('schema drift: worker vs supabase/migrations', () => {
  it('parses a schema from the migration chain', () => {
    expect(schema.size).toBeGreaterThan(10);
    expect(schema.get('support_tickets')).toContain('subject');
    expect(schema.get('support_tickets')).toContain('metadata');
  });

  it('finds the worker queries it expects to check', () => {
    // If this drops, the guard has stopped guarding — the regexes stopped
    // matching the worker rather than the worker getting cleaner.
    expect(references.size).toBeGreaterThan(8);
    expect(references.has('support_tickets')).toBe(true);
    expect(references.has('events_ax2024')).toBe(true);
    // Comment masking must not swallow real code. 88 distinct (table, column)
    // pairs is the measured coverage of this conservative scanner across the
    // ~8.8k-line worker; the floor is deliberately below that so ordinary code
    // churn does not fail the gate, but a scanner regression will.
    const columnCount = [...references.values()]
      .reduce((sum, entry) => sum + entry.columns.size, 0);
    expect(columnCount).toBeGreaterThan(70);
  });

  it('only queries tables that a migration creates', () => {
    const missing = [];
    for (const [table, { line }] of references) {
      if (STORAGE_BUCKETS.has(table)) continue;
      if (!schema.has(table)) missing.push(`${table} (src/index.ts:${line})`);
    }
    expect(missing).toEqual([]);
  });

  it('only reads and writes columns that a migration creates', () => {
    const drift = [];
    for (const [table, { columns }] of references) {
      if (STORAGE_BUCKETS.has(table)) continue;
      const known = schema.get(table);
      if (!known) continue; // reported by the table test above
      for (const [col, line] of columns) {
        if (!known.has(col)) drift.push(`${table}.${col} (src/index.ts:${line})`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('keeps every worker-written table in the chain', () => {
    // The 20261601000000 migration exists because four columns the worker wrote
    // were created by no migration. Pin the tables that matter most.
    for (const t of ['support_tickets', 'ticket_messages', 'hitl_audit_logs', 'events_ax2024']) {
      expect(schema.has(t)).toBe(true);
    }
  });
});
