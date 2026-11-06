import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onyxService } from './src/services/onyxService';

/**
 * Phase 163: this suite used to run `global.fetch = vi.fn()` at module scope and
 * never restore it. That was harmless while every test file got its own fork,
 * but the frontend gate now runs with `isolate: false` (one reused fork for the
 * whole suite — see the `isolate` comment in `vite.config.js`), so a
 * module-scope assignment leaks a mock `fetch` into whichever file runs next.
 * Scope the stub to this suite and put the real one back afterwards.
 */
const originalFetch = globalThis.fetch;

describe('Onyx Service Layer', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should parse synthetic state as degraded', async () => {
    globalThis.fetch.mockResolvedValue({
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
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', synthetic: true }),
    });

    const result = await onyxService.executeBatchTriage(['123', '456']);

    expect(result.success).toBe(false);
    expect(result.flaggedForHITL).toBe(true);
    expect(result.requires_hitl).toBe(true);
    expect(result.auto_executable).toBe(false);
    expect(result.error).toContain('Automated resolution aborted due to degraded state');
  });

  it('should enforce HITL fallback guard for synthetic Onyx responses in generateAutoDraft', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ synthetic: true, data: { draft: 'test' } }),
    });

    const result = await onyxService.generateAutoDraft('123', { subject: 's', description: 'd' });

    expect(result.requires_hitl).toBe(true);
    expect(result.auto_executable).toBe(false);
  });

  it('should enforce HITL fallback guard for synthetic Onyx responses in parseCommand', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ synthetic: true, action_proposed: true }),
    });

    const result = await onyxService.parseCommand('refund', '123');

    expect(result.success).toBe(true);
    expect(result.requires_hitl).toBe(true);
    expect(result.auto_executable).toBe(false);
  });
});
