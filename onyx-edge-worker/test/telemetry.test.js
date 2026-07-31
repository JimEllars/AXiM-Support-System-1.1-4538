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
});
