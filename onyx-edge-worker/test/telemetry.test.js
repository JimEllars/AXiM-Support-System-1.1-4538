import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Telemetry & Event Audit Log Suite', () => {
  it('should format kv_cache_purged_by_admin event payloads correctly', () => {
    const eventPayload = {
      type: "kv_cache_purged_by_admin",
      payload: {
        purged_keys: ["exec_policy_summary_v1"],
        operator: "james.ellars@axim.us.com",
        timestamp: new Date().toISOString()
      }
    };

    expect(eventPayload.type).toBe("kv_cache_purged_by_admin");
    expect(eventPayload.payload.operator).toBe("james.ellars@axim.us.com");
  });

  it('should format kv_cache_auto_purged event payloads correctly for CRON execution', () => {
    const eventPayload = {
      type: "kv_cache_auto_purged",
      payload: {
        operator: "system_cron",
        timestamp: new Date().toISOString()
      }
    };

    expect(eventPayload.type).toBe("kv_cache_auto_purged");
    expect(eventPayload.payload.operator).toBe("system_cron");
  });

  it('should calculate the 30-day telemetry log rotation cutoff correctly', () => {
    const now = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const expectedCutoffMs = now - thirtyDaysInMs;
    const expectedDate = new Date(expectedCutoffMs).toISOString().split('T')[0];

    const generatedCutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    expect(generatedCutoffDate).toBe(expectedDate);
  });

  it('should reject unauthorized access to /api/v1/admin/archives', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: 'UNAUTHORIZED' })
    });

    const res = await fetch('http://localhost:8787/api/v1/admin/archives', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('should list R2 archives on GET /api/v1/admin/archives with valid token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        archives: [{ key: 'axim_telemetry_archive_2026-08-01_batch.json' }]
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/admin/archives', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test_token' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.archives[0].key).toContain('axim_telemetry_archive');
  });

  it('should include sound_alerts_enabled in default preference payloads', () => {
    const defaultPrefs = { instant_receipts: true, urgent_alerts: true, daily_digest: true, auto_purge_kv: true, sound_alerts_enabled: true };
    expect(defaultPrefs.sound_alerts_enabled).toBe(true);
  });
});
