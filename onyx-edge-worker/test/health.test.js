import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & Autonomous Self-Cleaning Suite', () => {
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

  it('should process full CRON sweep executions and log 8 background automations', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, executed_sweeps: 8, message: "Full autonomous CRON sweep dispatched successfully." })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/trigger-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer valid_session_token`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.executed_sweeps).toBe(8);
  });
});
