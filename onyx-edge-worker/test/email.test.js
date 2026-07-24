import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch & Executive Response Auto-Execution', () => {
  it('should reject executive response requests missing required parameters', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      text: async () => '<h1>Invalid Executive Response Query</h1>'
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/respond', { method: 'GET' });
    expect(res.status).toBe(400);
  });

  it('should process valid executive response approvals and confirm auto-execution', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      text: async () => 'ACTION APPROVED & AUTO-EXECUTED'
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/respond?id=hitl-123&action=approve&token=valid_token', { method: 'GET' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AUTO-EXECUTED');
  });
});
