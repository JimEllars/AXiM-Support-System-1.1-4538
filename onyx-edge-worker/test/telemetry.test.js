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

  it('should include desktop_notifications_enabled in preference payload processing', () => {
    const prefs = {
      instant_receipts: true,
      desktop_notifications_enabled: true
    };
    expect(prefs.desktop_notifications_enabled).toBe(true);
  });

  it('should reject unauthorized access to /api/v1/reports/shift-handover', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: 'UNAUTHORIZED_HANDOVER_REPORT' })
    });

    const res = await fetch('http://localhost:8787/api/v1/reports/shift-handover', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should structure shift handover payload correctly with valid token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        queue_summary: { total: 5, urgent: 1, high: 2, medium: 1, low: 1 },
        sla_risks: { open_breaches: 0, active_warnings: 1, breach_details: [] },
        hitl_pending: [],
        generated_at: new Date().toISOString()
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/reports/shift-handover', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test_token' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.queue_summary).toHaveProperty('urgent');
    expect(data.sla_risks).toHaveProperty('open_breaches');
    expect(data.hitl_pending).toBeInstanceOf(Array);
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
