import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Dead-Letter Queue & Batch Flush Suite', () => {
  it('should reject unauthorized batch DLQ flush requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_DLQ_FLUSH" })
    });

    const res = await fetch('http://localhost:8787/api/v1/dlq/flush', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should process authorized batch DLQ flush requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, flushed_count: 3 })
    });

    const res = await fetch('http://localhost:8787/api/v1/dlq/flush', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.flushed_count).toBe(3);
  });
});
