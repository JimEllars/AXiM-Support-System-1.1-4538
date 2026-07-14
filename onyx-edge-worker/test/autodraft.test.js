import { describe, it, expect, vi } from 'vitest';

// Completely mock global fetch to eliminate absolute network port dependencies during unit testing
global.fetch = vi.fn();

describe('Auto-Draft Endpoint Hardening', () => {
  it('should reject requests without an authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_DRAFT_GENERATION" })
    });

    const res = await fetch('http://localhost:8787/api/v1/onyx-bridge/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketData: { subject: 'test' }, articles: [] })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED_DRAFT_GENERATION");
  });

  it('should reject requests with invalid authorization tokens', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 403,
      json: async () => ({ error: "INVALID_SESSION" })
    });

    const res = await fetch('http://localhost:8787/api/v1/onyx-bridge/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_123'
      },
      body: JSON.stringify({ ticketData: { subject: 'test' }, articles: [] })
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("INVALID_SESSION");
  });
});
