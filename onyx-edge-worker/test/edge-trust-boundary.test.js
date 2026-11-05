/**
 * Real edge trust-boundary tests.
 *
 * These import the actual worker module and drive `worker.fetch()` with real
 * Request objects, so a regression in the signature gate, the replay window or
 * the PHP2Shell shield fails here. The older suites in this folder stub
 * `global.fetch` and then assert on the stubbed response, which passes whether
 * or not the worker does anything at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  // Mutable behaviour for the mocked Supabase client.
  userResult: { data: { user: { id: 'operator-1', email: 'operator@axim.us.com' } }, error: null },
  insertResult: { data: { id: 'ticket-1' }, error: null },
  updateResult: { data: null, error: null },
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
        hoisted.calls.push({ op: 'update', args });
        return query;
      },
      upsert: () => query,
      delete: () => query,
      eq: () => query,
      neq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      single: () => query,
      maybeSingle: () => query,
      // Thenable so both `await query` and `.single()` chains resolve.
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

import worker from '../src/index.ts';

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

const now = () => Math.floor(Date.now() / 1000);

async function post(path, body, headers = {}) {
  return new Request(`https://edge.axim.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('internal signature trust boundary', () => {
  beforeEach(() => {
    hoisted.userResult = { data: { user: { id: 'operator-1', email: 'operator@axim.us.com' } }, error: null };
    hoisted.insertResult = { data: { id: 'ticket-1' }, error: null };
    vi.restoreAllMocks();
  });

  it('rejects a coder resolution callback with no signature', async () => {
    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', { resolutionNotes: 'done' }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
  });

  it('rejects a signature that is not 32 bytes of hex', async () => {
    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', { resolutionNotes: 'done' }, {
        'X-Axim-Signature': 'not-a-signature',
        'X-Axim-Timestamp': String(now()),
      }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
  });

  it('accepts a fresh v2 signature over "<timestamp>.<body>"', async () => {
    const body = JSON.stringify({ resolutionNotes: 'patched', completedAt: '2026-11-02T10:00:00Z' });
    const ts = String(now());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Signature-Version': '2',
        'X-Axim-Timestamp': ts,
      }),
      makeEnv(),
      ctx()
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('rejects a correctly signed body whose timestamp is outside the replay window', async () => {
    const body = JSON.stringify({ resolutionNotes: 'replayed capture' });
    const staleTs = String(now() - 3600);
    const signature = await hmacHex(INTERNAL_KEY, `${staleTs}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Timestamp': staleTs,
      }),
      makeEnv(),
      ctx()
    );

    expect(res.status).toBe(401);
  });

  it('accepts a legacy body-only signature before the sunset and rejects it after', async () => {
    hoisted.insertResult = { data: { id: 'ticket-1' }, error: null };
    const body = JSON.stringify({ resolutionNotes: 'legacy signer' });
    const signature = await hmacHex(INTERNAL_KEY, body);

    const beforeSunset = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, { 'X-Axim-Signature': signature }),
      makeEnv({ AXIM_SIG_LEGACY_UNTIL: '2099-01-01' }),
      ctx()
    );
    expect(beforeSunset.status).toBe(200);

    const afterSunset = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, { 'X-Axim-Signature': signature }),
      makeEnv({ AXIM_SIG_LEGACY_UNTIL: '2020-01-01' }),
      ctx()
    );
    expect(afterSunset.status).toBe(401);
  });

  it('honours the terminal status the Coding Lab reports instead of forcing resolved', async () => {
    // Phase 162: `status` was destructured from the callback and then ignored,
    // so a Coding Lab run that closed the ticket left it in the open queue.
    hoisted.calls.length = 0;
    const body = JSON.stringify({ status: 'closed', resolutionNotes: 'merged upstream', completedAt: '2026-11-05T10:00:00Z' });
    const ts = String(now());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Timestamp': ts,
      }),
      makeEnv(),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, status: 'closed' });
    const ticketUpdate = hoisted.calls.find((c) => c.op === 'update' && c.args[0]?.resolved_at);
    expect(ticketUpdate.args[0].status).toBe('closed');
  });

  it('falls back to resolved when the callback reports a status the enum cannot store', async () => {
    hoisted.calls.length = 0;
    const body = JSON.stringify({ status: 'shipped-to-prod', resolutionNotes: 'free text' });
    const ts = String(now());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/resolve-from-coder', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Timestamp': ts,
      }),
      makeEnv(),
      ctx()
    );

    expect(await res.json()).toMatchObject({ success: true, status: 'resolved' });
    const ticketUpdate = hoisted.calls.find((c) => c.op === 'update' && c.args[0]?.resolved_at);
    expect(ticketUpdate.args[0].status).toBe('resolved');
  });
});

describe('public intake cannot be unlocked by a spoofed source header', () => {
  const validIntake = {
    subject: 'Spoofed intake',
    description: 'unsigned body',
    customer_email: 'attacker@example.com',
    customer_name: 'Attacker',
    priority: 'high',
  };

  it('rejects unsigned JSON intake that claims to be the internal website proxy', async () => {
    hoisted.calls = [];
    const res = await worker.fetch(
      await post('/api/v1/webhooks/intake', validIntake, {
        'X-Axim-Default-Source': 'website_authenticated_internal',
      }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
    expect(hoisted.calls.filter((c) => c.op === 'insert' && c.table === 'support_tickets')).toHaveLength(0);
  });

  it('rejects unsigned JSON intake that claims to be the public website form', async () => {
    hoisted.calls = [];
    const res = await worker.fetch(
      await post('/api/v1/webhooks/intake', validIntake, {
        'X-Axim-Default-Source': 'website',
      }),
      makeEnv(),
      ctx()
    );
    expect(res.status).toBe(401);
    expect(hoisted.calls.filter((c) => c.op === 'insert' && c.table === 'support_tickets')).toHaveLength(0);
  });
});

describe('PHP2Shell and traversal shielding', () => {
  const probes = [
    '/api/v1/tickets?x=1&-d allow_url_include=1',
    '/api/v1/tickets?x=auto_prepend_file=/etc/passwd',
    '/api/v1/tickets?x=auto_append_file=/tmp/x.php',
    '/api/v1/tickets?%3f-d%20allow_url_include=1',
    // Phase 162: the CGI patterns were only matched against the query string,
    // so the same payloads placed in the path went through untouched.
    '/api/v1/auto_prepend_file=/etc/passwd',
    '/api/v1/tickets/disable_functions=exec',
    '/api/v1/-d%20allow_url_include=1',
    '/api/v1/../../etc/passwd',
    '/api/v1/%2e%2e/%2e%2e/etc/passwd',
    '/wp-admin/setup-config.php',
    '/api/v1/tickets/xmlrpc.php',
  ];

  for (const probe of probes) {
    it(`blocks ${probe} with 403`, async () => {
      const res = await worker.fetch(new Request(`https://edge.axim.test${probe}`), makeEnv(), ctx());
      expect(res.status).toBe(403);
    });
  }

  it('still serves a clean route past the shield', async () => {
    const res = await worker.fetch(
      new Request('https://edge.axim.test/api/v1/status', { method: 'GET' }),
      makeEnv(),
      ctx()
    );
    expect(res.status).not.toBe(403);
  });
});

describe('coding lab dispatch is signed with a replay-proof header set', () => {
  it('sends X-Axim-Timestamp and a v2 signature the receiver can verify', async () => {
    const captured = [];
    vi.stubGlobal('fetch', async (url, init) => {
      captured.push({ url, init });
      return new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const env = makeEnv({ CODER_WORKER_URL: 'https://coder-labs.test' });
    const res = await worker.fetch(
      await post('/api/v1/tasks/dispatch', { operation: 'DEPLOY_ACTION', target: 'axim-core' }, {
        Authorization: 'Bearer operator-session-token',
      }),
      env,
      ctx()
    );

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);

    const { url, init } = captured[0];
    expect(url).toBe('https://coder-labs.test/api/v1/deploy-action');

    const timestamp = init.headers['X-Axim-Timestamp'];
    expect(timestamp).toBeTruthy();
    expect(Math.abs(Number(timestamp) - now())).toBeLessThan(60);
    expect(init.headers['X-Axim-Signature-Version']).toBe('2');

    const expected = await hmacHex(INTERNAL_KEY, `${timestamp}.${init.body}`);
    expect(init.headers['X-Axim-Signature']).toBe(expected);
  });

  it('refuses to dispatch without an operator session', async () => {
    hoisted.userResult = { data: { user: null }, error: { message: 'invalid jwt' } };
    const env = makeEnv({ CODER_WORKER_URL: 'https://coder-labs.test' });
    const res = await worker.fetch(
      await post('/api/v1/tasks/dispatch', { operation: 'DEPLOY_ACTION' }, { Authorization: 'Bearer forged' }),
      env,
      ctx()
    );
    expect(res.status).toBe(401);
  });
});

describe('robotics fault ingest authentication', () => {
  beforeEach(() => {
    hoisted.insertResult = { data: { id: 'robot-ticket-1' }, error: null };
  });

  it('rejects an unrelated bearer token', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: '' });
    const res = await worker.fetch(
      await post('/api/v1/robotics/fault-ingest', { node_id: 'nx-1', sensor_data: { pitch: 12 } }, {
        Authorization: 'Bearer wrong-key',
      }),
      env,
      ctx()
    );
    expect(res.status).toBe(401);
  });

  it('accepts the legacy internal bearer key while the fleet gateway migrates', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: '' });
    const res = await worker.fetch(
      await post('/api/v1/robotics/fault-ingest', { node_id: 'nx-1', sensor_data: { pitch: 12 } }, {
        Authorization: `Bearer ${INTERNAL_KEY}`,
      }),
      env,
      ctx()
    );
    expect(res.status).toBe(200);
  });

  it('accepts a v2 HMAC signature', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: '' });
    const body = JSON.stringify({ node_id: 'nx-2', sensor_data: { current: 41.2 } });
    const ts = String(now());
    const signature = await hmacHex(INTERNAL_KEY, `${ts}.${body}`);

    const res = await worker.fetch(
      await post('/api/v1/robotics/fault-ingest', body, {
        'X-Axim-Signature': signature,
        'X-Axim-Timestamp': ts,
      }),
      env,
      ctx()
    );
    expect(res.status).toBe(200);
  });
});

describe('RCA generation requires a real operator session', () => {
  it('rejects a presence-only bearer token', async () => {
    hoisted.userResult = { data: { user: null }, error: { message: 'invalid claim' } };
    const res = await worker.fetch(
      await post('/api/v1/tickets/ticket-1/generate-rca', {}, { Authorization: 'Bearer not-a-real-jwt' }),
      makeEnv({ DEEPSEEK_API_KEY: '' }),
      ctx()
    );
    expect(res.status).toBe(403);
  });
});
