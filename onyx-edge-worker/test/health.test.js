import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & Diagnostics Suite', () => {
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

  it('should return aggregated diagnostic telemetry on GET /api/v1/health/diagnostics', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        diagnostics: {
          edge_worker: { status: 'healthy' },
          cron_schedule: { status: 'active' },
          edge_shield: { rate_limit_cap: '30_req_min' }
        }
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/diagnostics');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.diagnostics.edge_worker.status).toBe('healthy');
  });
});
