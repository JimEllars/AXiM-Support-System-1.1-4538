import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & Multi-CRON Status Suite', () => {
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

  it('should return consolidated multi-cron automation engine health on GET /api/v1/health/cron-status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        automation_engine: {
          status: 'active',
          daily_sweeps: 6,
          last_heartbeat: new Date().toISOString(),
          last_kb_curation: new Date().toISOString(),
          kb_items_curated_last_run: 2
        }
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/cron-status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.automation_engine.daily_sweeps).toBe(6);
    expect(data.automation_engine.status).toBe('active');
  });
});