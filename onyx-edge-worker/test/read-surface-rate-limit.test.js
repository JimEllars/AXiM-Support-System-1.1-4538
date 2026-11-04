/**
 * Phase 161 — budgets for the unauthenticated read surfaces, and the bucket
 * keys that keep them independent.
 *
 * Before this pass `GET /metrics`, `POST /api/v1/kb/search` and
 * `POST /api/v1/dlq/validate` answered anyone who had the worker URL.
 * `kb/search` is the expensive one: it embeds the caller's text through Workers
 * AI and then runs a database fallback, so an anonymous caller could spend the
 * account's AI budget by looping.
 *
 * The counter key was also shared across callers (`ratelimit:${ip}`), so two
 * routes with different thresholds trampled each other's window. These cases
 * fail if the bucket is dropped from the key again.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import worker from '../src/index.ts';

const IP = '203.0.113.7';

function makeKv(seed = {}) {
  const store = new Map(Object.entries(seed));
  const writes = [];
  return {
    store,
    writes,
    kv: {
      get: async (key) => (store.has(key) ? store.get(key) : null),
      put: async (key, value) => {
        writes.push({ key, value });
        store.set(key, value);
      },
    },
  };
}

function makeEnv(kv) {
  return {
    AXIM_INTERNAL_KEY: 'internal-test-key',
    AXIM_SERVICE_KEY: 'service-test-key',
    AXIM_ONYX_SECRET: 'onyx-test-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    IDEMPOTENCY_KV: kv,
  };
}

function ctx() {
  return { waitUntil: () => {}, passThroughOnException: () => {} };
}

function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://edge.axim.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

const BUDGETS = { metrics: 60, kbSearch: 20, dlqValidate: 20 };

describe('read surface rate limits', () => {
  let harness;

  beforeEach(() => {
    harness = makeKv();
  });

  it('counts GET /metrics against its own bucket and returns 429 once spent', async () => {
    harness.store.set(`ratelimit:metrics:${IP}`, String(BUDGETS.metrics - 1));

    const allowed = await worker.fetch(req('/metrics'), makeEnv(harness.kv), ctx());
    expect(allowed.status).toBe(200);
    expect(harness.writes.some((w) => w.key === `ratelimit:metrics:${IP}`)).toBe(true);

    const blocked = await worker.fetch(req('/metrics'), makeEnv(harness.kv), ctx());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');
    const body = await blocked.json();
    expect(body.bucket).toBe('metrics');
  });

  it('buckets by route, so a spent metrics budget cannot throttle kb search', async () => {
    harness.store.set(`ratelimit:metrics:${IP}`, String(BUDGETS.metrics));

    const metrics = await worker.fetch(req('/metrics'), makeEnv(harness.kv), ctx());
    expect(metrics.status).toBe(429);

    // kb/search budget untouched -> the request is allowed past the limiter and
    // fails later on the un-mocked Supabase client, which is enough to prove the
    // limiter did not fire.
    const kb = await worker.fetch(
      req('/api/v1/kb/search', { method: 'POST', body: { query: 'thermal cutoff' } }),
      makeEnv(harness.kv),
      ctx()
    );
    expect(kb.status).not.toBe(429);
    expect(harness.writes.some((w) => w.key === `ratelimit:kbSearch:${IP}`)).toBe(true);
  });

  it('throttles POST /api/v1/kb/search once its 20/min budget is spent', async () => {
    harness.store.set(`ratelimit:kbSearch:${IP}`, String(BUDGETS.kbSearch));

    const res = await worker.fetch(
      req('/api/v1/kb/search', { method: 'POST', body: { query: 'servo stall' } }),
      makeEnv(harness.kv),
      ctx()
    );

    expect(res.status).toBe(429);
    expect((await res.json()).bucket).toBe('kbSearch');
  });

  it('throttles POST /api/v1/dlq/validate once its budget is spent', async () => {
    harness.store.set(`ratelimit:dlqValidate:${IP}`, String(BUDGETS.dlqValidate));

    const res = await worker.fetch(
      req('/api/v1/dlq/validate', { method: 'POST', body: { meta: {}, telemetry: {} } }),
      makeEnv(harness.kv),
      ctx()
    );

    expect(res.status).toBe(429);
    expect((await res.json()).bucket).toBe('dlqValidate');
  });

  it('still validates a payload while under budget', async () => {
    const res = await worker.fetch(
      req('/api/v1/dlq/validate', { method: 'POST', body: { meta: {}, telemetry: {} } }),
      makeEnv(harness.kv),
      ctx()
    );

    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(true);
  });

  it('fails open only when the KV binding is missing', async () => {
    const env = makeEnv(undefined);
    const res = await worker.fetch(req('/metrics'), env, ctx());
    expect(res.status).toBe(200);
  });
});
