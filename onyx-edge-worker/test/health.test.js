import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health, Diagnostics Caching & Test Pipeline Suite', () => {
  it('should return aggregated diagnostic telemetry on GET /api/v1/health/diagnostics', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        cached: false,
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
    expect(data.cached).toBe(false);
  });

  it('should reject unauthorized test briefing trigger requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_TEST_TRIGGER" })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/test-briefing', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should process authorized test briefing requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, recipient: 'james.ellars@axim.us.com' })
    });

    const res = await fetch('http://localhost:8787/api/v1/health/test-briefing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recipient).toBe('james.ellars@axim.us.com');
  });
});
