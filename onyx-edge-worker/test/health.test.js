import { describe, it, expect, vi, beforeEach } from 'vitest';
import fetch from '../src/index';

// Mock environment
const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

// Mock createClient
const insertMock = vi.fn().mockResolvedValue({ data: {}, error: null });
let selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
const updateMock = vi.fn().mockResolvedValue({ data: {}, error: null });
const eqMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
const fromMock = vi.fn(() => ({ insert: insertMock, select: selectMock, update: updateMock, eq: eqMock }));

vi.mock('@supabase/supabase-js', () => {
  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'operator-123' } }, error: null });
  return {
    createClient: vi.fn(() => ({
      from: fromMock,
      auth: { getUser: getUserMock }
    })),
  };
});

describe('Health & Telemetry Endpoint (/api/v1/health)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
  });

  it('returns healthy status when DB is connected', async () => {
    selectMock.mockResolvedValue({ data: [{ id: '123' }], error: null });

    const req = new Request('http://localhost/api/v1/health', { method: 'GET' });
    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.db_status).toBe('connected');
    expect(data).toHaveProperty('latency_ms');
    expect(data).toHaveProperty('timestamp');
  });

  it('returns degraded status when DB query fails', async () => {
    selectMock.mockResolvedValue({ data: null, error: new Error('DB Error') });

    const req = new Request('http://localhost/api/v1/health', { method: 'GET' });
    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.db_status).toBe('degraded');
  });

  it('returns disconnected status when createClient or DB query throws', async () => {
    selectMock.mockRejectedValue(new Error('Network Error'));

    const req = new Request('http://localhost/api/v1/health', { method: 'GET' });
    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.db_status).toBe('disconnected');
  });
});
