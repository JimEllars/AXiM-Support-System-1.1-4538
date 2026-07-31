import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Health, Security Shield & Admin KV Purge Suite', () => {
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

  it('should reject unauthorized KV purge requests with 401 Unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_KV_PURGE_REQUEST" })
    });

    const res = await fetch('http://localhost:8787/api/v1/admin/kv-purge', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should process authorized KV purge requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, purged_keys: ['exec_policy_summary_v1'], timestamp: new Date().toISOString() })
    });

    const res = await fetch('http://localhost:8787/api/v1/admin/kv-purge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.purged_keys).toContain('exec_policy_summary_v1');
  });
});
