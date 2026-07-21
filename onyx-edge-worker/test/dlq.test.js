import { describe, it, expect, vi, beforeEach } from 'vitest';
import fetch from '../src/index'; // Adjust path if necessary

// Mock environment
const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

// Mock createClient
vi.mock('@supabase/supabase-js', () => {
  const insertMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const updateMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  const eqMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
  const fromMock = vi.fn(() => ({ insert: insertMock, select: selectMock, update: updateMock, eq: eqMock }));
  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'operator-123' } }, error: null });

  return {
    createClient: vi.fn(() => ({
      from: fromMock,
      auth: { getUser: getUserMock }
    })),
  };
});

describe('DLQ Retry Router (/api/v1/dlq/retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    const req = new Request('http://localhost/api/v1/dlq/retry', {
      method: 'POST',
      body: JSON.stringify({ dlqId: 'test-dlq-123' })
    });

    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });
    expect(res.status).toBe(401);
  });

  it('rejects missing dlqId', async () => {
    const req = new Request('http://localhost/api/v1/dlq/retry', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({ ticketId: 'ticket-123' })
    });

    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });
    expect(res.status).toBe(400);
  });

  it('processes valid dlq retry request successfully', async () => {
    const req = new Request('http://localhost/api/v1/dlq/retry', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({
        dlqId: 'dlq-event-123',
        ticketId: 'ticket-789'
      })
    });

    const res = await fetch.fetch(req, env, { waitUntil: vi.fn() });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recovered).toBe(true);
    expect(data.dlq_id).toBe('dlq-event-123');
  });
});
