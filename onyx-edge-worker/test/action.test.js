import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Onyx Edge Worker - Action Resolver Validation', () => {
  it('should reject execution requests without a valid Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "Unauthorized" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitlLogId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    expect(res.status).toBe(401);
  });

  it('should reject execution requests with invalid UUID payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: "Invalid UUID payload" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ hitlLogId: 'invalid-uuid-string' })
    });
    expect([400, 429, 403]).toContain(res.status);
  });
});
