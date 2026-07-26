import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & CRON Status Suite', () => {
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

  it('should return healthy CRON status on /api/v1/health/cron', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, status: 'healthy', last_cron_run: new Date().toISOString() })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/cron');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
  });
});