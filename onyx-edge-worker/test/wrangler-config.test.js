/**
 * Guardrail for `wrangler.toml` bindings.
 *
 * `wrangler deploy --dry-run` only checks the *shape* of a KV namespace id, so a
 * placeholder like `fake-status-kv-id-for-now` passed CI while guaranteeing that
 * any real deploy either failed or shipped a worker whose STATUS_KV / HITL_KV
 * reads threw at runtime. This test fails if a placeholder creeps back in.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toml = readFileSync(join(here, '..', 'wrangler.toml'), 'utf8');

describe('wrangler.toml', () => {
  it('does not ship placeholder KV namespace ids', () => {
    const ids = [...toml.matchAll(/^\s*id\s*=\s*"([^"]*)"/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    const placeholders = ids.filter((id) => /fake|placeholder|your-|todo|xxx/i.test(id));
    expect(placeholders).toEqual([]);
  });

  it('still declares every binding the worker reads', () => {
    for (const binding of ['KB_CACHE', 'IDEMPOTENCY_KV', 'STATUS_KV', 'HITL_KV', 'TELEMETRY_ARCHIVE']) {
      expect(toml).toContain(`binding = "${binding}"`);
    }
  });

  it('keeps the 15-minute SLA sweep and the nightly digest on the cron list', () => {
    const crons = toml.match(/^crons\s*=\s*\[(.*)\]/m);
    expect(crons).not.toBeNull();
    expect(crons[1]).toContain('*/15 * * * *');
    expect(crons[1]).toContain('0 3 * * *');
  });
});
