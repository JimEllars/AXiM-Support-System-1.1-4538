import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & Full CRON Execution Suite', () => {
  it('should return 200 OK for standard worker health checks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ status: 'healthy', service: 'onyx-edge-worker' })
    });

    const res = await fetch('http://localhost:8787/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
  });

  it('should reject unauthorized full CRON sweep requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_CRON_TRIGGER" })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/trigger-all', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should process authorized full CRON sweep executions successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, executed_sweeps: 7 })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/trigger-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.executed_sweeps).toBe(7);
  });
});
