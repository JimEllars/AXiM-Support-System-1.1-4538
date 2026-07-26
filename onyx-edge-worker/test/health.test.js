import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health & Security Shield Suite', () => {
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

  it('should return active status and rate limiting specs on GET /api/v1/health/security', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        status: 'shield_active',
        hmac_verification: 'enforced',
        rate_limiting: '30_req_per_min',
        timestamp: new Date().toISOString()
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/security');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('shield_active');
    expect(data.rate_limiting).toBe('30_req_per_min');
  });
});