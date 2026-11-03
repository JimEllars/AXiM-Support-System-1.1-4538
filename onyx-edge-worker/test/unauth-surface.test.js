/**
 * Phase 160 — unauthenticated mutation surface.
 *
 * Every case here drives the real `worker.fetch()` with a real `Request`, so a
 * regression in the guards fails the suite. Each case was written against the
 * pre-Phase-160 code first and observed red; the assertions record what the
 * route did before the fix in the test name where it matters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  userResult: { data: { user: { id: 'operator-1', email: 'operator@axim.us.com' } }, error: null },
  insertResult: { data: { id: 'ticket-1' }, error: null },
  updateResult: { data: null, error: null },
  singleResult: { data: null, error: null },
  calls: [],
}));

vi.mock('@supabase/supabase-js', () => {
  let currentTable = 'unknown';
  const chain = () => {
    const query = {
      select: () => query,
      insert: (...args) => {
        hoisted.calls.push({ op: 'insert', table: currentTable, args });
        return query;
      },
      update: (...args) => {
        hoisted.calls.push({ op: 'update', table: currentTable, args });
        return query;
      },
      upsert: () => query,
      delete: () => query,
      eq: (...args) => {
        hoisted.calls.push({ op: 'eq', table: currentTable, args });
        return query;
      },
      neq: () => query,
      lt: (...args) => {
        hoisted.calls.push({ op: 'lt', table: currentTable, args });
        return query;
      },
      gt: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      ilike: () => query,
      like: () => query,
      or: () => query,
      is: () => query,
      not: () => query,
      match: () => query,
      contains: () => query,
      filter: () => query,
      range: () => query,
      single: () => Promise.resolve(hoisted.singleResult),
      maybeSingle: () => Promise.resolve(hoisted.singleResult),
      then: (resolve) => resolve(hoisted.insertResult),
    };
    return query;
  };

  const client = {
    from: (table) => {
      currentTable = table;
      return chain();
    },
    rpc: () => chain(),
    auth: {
      getUser: async () => hoisted.userResult,
      admin: { deleteUser: async () => ({ error: null }) },
    },
  };

  return { createClient: () => client };
});

import worker, { validateAttachment, bytesToBase64, handleStaleTicketSweep } from '../src/index.ts';

const INTERNAL_KEY = 'internal-test-key';
const SERVICE_KEY = 'service-test-key';

function makeEnv(overrides = {}) {
  return {
    AXIM_INTERNAL_KEY: INTERNAL_KEY,
    AXIM_SERVICE_KEY: SERVICE_KEY,
    AXIM_ONYX_SECRET: 'onyx-test-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ...overrides,
  };
}

function ctx() {
  return { waitUntil: () => {}, passThroughOnException: () => {} };
}


async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function post(path, body, headers = {}) {
  return new Request(`https://edge.axim.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  hoisted.userResult = { data: { user: { id: 'operator-1', email: 'operator@axim.us.com' } }, error: null };
  hoisted.insertResult = { data: { id: 'ticket-1' }, error: null };
  hoisted.singleResult = { data: null, error: null };
  hoisted.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/v1/actions/rca/finalize', () => {
  it('rejects an unauthenticated caller (was 200 + { success: true })', async () => {
    const res = await worker.fetch(
      await post('/api/v1/actions/rca/finalize', { rcaLogId: 'log-1', notes: 'root cause confirmed' }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/session/i);
    expect(hoisted.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('rejects a bearer token that is not a real session', async () => {
    hoisted.userResult = { data: { user: null }, error: { message: 'invalid JWT' } };
    const res = await worker.fetch(
      await post('/api/v1/actions/rca/finalize', { rcaLogId: 'log-1', notes: 'x' }, {
        Authorization: 'Bearer forged-token',
      }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(403);
    expect(hoisted.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('reuses the rcaLogId/notes contract the UI actually sends', async () => {
    hoisted.singleResult = {
      data: { id: 'log-1', support_ticket_id: 'ticket-9', payload: { existing: true }, status: 'draft' },
      error: null,
    };

    const res = await worker.fetch(
      await post('/api/v1/actions/rca/finalize', { rcaLogId: 'log-1', notes: 'motor driver overheated' }, {
        Authorization: 'Bearer good-token',
      }),
      makeEnv(),
      ctx()
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.finalized).toBe(true);
    expect(json.rcaLogId).toBe('log-1');

    const update = hoisted.calls.find((c) => c.op === 'update' && c.table === 'hitl_audit_logs');
    expect(update).toBeDefined();
    const patch = update.args[0];
    expect(patch.status).toBe('finalized');
    expect(patch.payload.notes).toBe('motor driver overheated');
    expect(patch.payload.existing).toBe(true);
    expect(patch.payload.finalized_by).toBe('operator-1');

    const note = hoisted.calls.find((c) => c.op === 'insert' && c.table === 'ticket_messages');
    expect(note).toBeDefined();
    expect(note.args[0].ticket_id).toBe('ticket-9');
    expect(note.args[0].is_internal_note).toBe(true);
  });

  it('refuses to finalize without investigation notes', async () => {
    const res = await worker.fetch(
      await post('/api/v1/actions/rca/finalize', { rcaLogId: 'log-1', notes: '   ' }, {
        Authorization: 'Bearer good-token',
      }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/email/webhook', () => {
  it('rejects an unsigned delivery event (previously mutated message metadata)', async () => {
    const res = await worker.fetch(
      await post('/api/v1/email/webhook', { message_id: 'msg-1', event: 'bounced' }),
      makeEnv({ EMAILIT_WEBHOOK_SECRET: 'whsec_test' }),
      ctx()
    );
    expect(res.status).toBe(401);
    expect(hoisted.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('returns 503 rather than allow-listing when the webhook secret is unbound', async () => {
    const res = await worker.fetch(
      await post('/api/v1/email/webhook', { message_id: 'msg-1', event: 'bounced' }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(503);
    expect(hoisted.calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('POST /api/v1/email/inbound', () => {
  it('rejects an inbound mail with no signature header (guard used to fail open)', async () => {
    const res = await worker.fetch(
      await post('/api/v1/email/inbound', { subject: '[Ticket #ticket-1] hi', text: 'hello' }),
      makeEnv({ EMAILIT_WEBHOOK_SECRET: 'whsec_test' }),
      ctx()
    );
    expect(res.status).toBe(401);
    expect(hoisted.calls.some((c) => c.op === 'insert' && c.table === 'ticket_messages')).toBe(false);
  });

  it('rejects an inbound mail whose signature does not verify', async () => {
    const res = await worker.fetch(
      await post('/api/v1/email/inbound', { subject: '[Ticket #ticket-1] hi', text: 'hello' }, {
        'X-Emailit-Signature': 't=1,v1=deadbeef',
      }),
      makeEnv({ EMAILIT_WEBHOOK_SECRET: 'whsec_test' }),
      ctx()
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /email/daily-summary', () => {
  it('rejects an unauthenticated digest trigger (previously mailed the executive digest)', async () => {
    const res = await worker.fetch(
      await post('/email/daily-summary', {}),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('UNAUTHORIZED_DIGEST_TRIGGER');
  });
});

describe('validateAttachment', () => {
  it('accepts an allowed image inside the size budget', () => {
    expect(validateAttachment({ size: 1024, type: 'image/png' })).toEqual({ valid: true, error: '' });
  });

  it('rejects a file larger than 5 MB', () => {
    const result = validateAttachment({ size: 5 * 1024 * 1024 + 1, type: 'image/png' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds/);
  });

  it('rejects an executable disguised as an attachment', () => {
    const result = validateAttachment({ size: 512, type: 'application/x-msdownload' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unsupported/);
  });

  it('rejects a file with no readable size', () => {
    expect(validateAttachment({ type: 'image/png' }).valid).toBe(false);
    expect(validateAttachment(null).valid).toBe(false);
  });
});

describe('bytesToBase64', () => {
  it('round-trips a small payload', () => {
    const bytes = new TextEncoder().encode('axim');
    expect(bytesToBase64(bytes)).toBe(btoa('axim'));
  });

  it('encodes past the argument-spread limit without throwing', () => {
    // 1 MB is well past the ~120k-argument ceiling of
    // `String.fromCharCode(...new Uint8Array(buffer))`, which previously threw
    // RangeError and surfaced as a 500 on a legal 5 MB attachment.
    const bytes = new Uint8Array(1024 * 1024).fill(65);
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBe(Math.ceil(bytes.length / 3) * 4);
    expect(() => atob(encoded)).not.toThrow();
  });
});

describe('handleStaleTicketSweep', () => {
  it('writes one sweep event per stale ticket', async () => {
    hoisted.insertResult = {
      data: [
        { id: 'ticket-1', subject: 'printer down', priority: 'high', updated_at: '2026-11-03T06:00:00Z' },
        { id: 'ticket-2', subject: 'vpn drops', priority: 'urgent', updated_at: '2026-11-03T05:00:00Z' },
      ],
      error: null,
    };

    const flagged = await handleStaleTicketSweep(makeEnv());
    expect(flagged).toBe(2);

    const events = hoisted.calls.filter((c) => c.op === 'insert' && c.table === 'events_ax2024');
    expect(events).toHaveLength(2);
    expect(events[0].args[0].type).toBe('ticket_stale_sweep');
    expect(events[0].args[0].payload.ticket_id).toBe('ticket-1');
    expect(events[1].args[0].payload.ticket_id).toBe('ticket-2');
  });

  it('flags nothing when the queue is empty', async () => {
    hoisted.insertResult = { data: [], error: null };
    expect(await handleStaleTicketSweep(makeEnv())).toBe(0);
    expect(hoisted.calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('honours stale_sweep_minutes from STATUS_KV preferences', async () => {
    hoisted.insertResult = { data: [], error: null };
    const kv = {
      get: async () => JSON.stringify({ stale_sweep_minutes: 15 }),
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [] }),
    };

    const before = Date.now();
    await handleStaleTicketSweep(makeEnv({ STATUS_KV: kv }));

    const cutoffCall = hoisted.calls.find((c) => c.op === 'lt');
    expect(cutoffCall).toBeDefined();
    expect(cutoffCall.args[0]).toBe('updated_at');
    const cutoffMs = Date.parse(cutoffCall.args[1]);
    // 15 minutes back, not the 60-minute default.
    const expected = before - 15 * 60 * 1000;
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(5000);
  });
});

describe('signed internal relay on the mail webhooks', () => {
  // Regression guard: an earlier revision of this fix read the body with
  // `request.text()` and *then* called `authorizeInternalRelay`, which clones the
  // request to hash its bytes. A consumed body cannot be cloned, so a correctly
  // signed relay call threw. These cases go through the real v2 signature path.
  it('accepts a v2-signed delivery event on /api/v1/email/webhook', async () => {
    hoisted.singleResult = { data: { id: 'msg-1', metadata: {} }, error: null };
    const body = JSON.stringify({ message_id: 'msg-1', event: 'delivered' });
    const ts = String(nowSeconds());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/email/webhook', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Signature-Version': '2',
        'X-Axim-Timestamp': ts,
      }),
      makeEnv(),
      ctx()
    );

    expect(res.status).toBe(200);
    const patch = hoisted.calls.find((c) => c.op === 'update' && c.table === 'ticket_messages');
    expect(patch).toBeDefined();
    expect(patch.args[0].metadata.delivery_status).toBe('delivered');
  });

  it('accepts a v2-signed inbound mail on /api/v1/email/inbound', async () => {
    hoisted.singleResult = { data: { id: 'ticket-1' }, error: null };
    const body = JSON.stringify({ subject: '[Ticket #ticket-1] hi', text: 'hello' });
    const ts = String(nowSeconds());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/email/inbound', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Signature-Version': '2',
        'X-Axim-Timestamp': ts,
      }),
      makeEnv(),
      ctx()
    );

    // The point of this case is the body-clone ordering: a correctly signed relay
    // call must not throw. 200 (message recorded) or 200 (ticket not found ack)
    // are both fine; a 500 or 401 is not.
    expect(res.status).toBe(200);
  });
});
