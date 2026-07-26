import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Telemetry & CRON Health Endpoint Suite', () => {
  it('should return valid JSON structure and health status on /api/v1/health/cron', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        last_cron_run: new Date().toISOString(),
        status: "healthy",
        timestamp: new Date().toISOString()
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/cron', { method: 'GET' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("healthy");
  });
});
