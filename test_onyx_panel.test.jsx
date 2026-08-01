import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onyxService } from './src/services/onyxService';

// Mock fetch
global.fetch = vi.fn();

describe('Onyx Service Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse synthetic state as degraded', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', synthetic: true }),
    });

    const result = await onyxService.checkOnyxHealth();
    expect(result.isHealthy).toBe(true);
    expect(result.isDegraded).toBe(true);
    expect(result.source).toBe('edge-cache');
  });

  it('should abort automated escalation when degraded', async () => {
    // 1. Mock the health check to return degraded
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', synthetic: true }),
    });

    const result = await onyxService.executeBatchTriage(['123', '456']);

    expect(result.success).toBe(false);
    expect(result.flaggedForHITL).toBe(true);
    expect(result.error).toContain('Automated resolution aborted due to degraded state');
  });
});
