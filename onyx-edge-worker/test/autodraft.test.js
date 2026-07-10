import { describe, it, expect } from 'vitest';

const WORKER_URL = 'http://localhost:8787';

describe('Auto-Draft Endpoint Hardening', () => {
  it('should reject requests without an authorization header', async () => {
    const res = await fetch(`${WORKER_URL}/api/v1/onyx-bridge/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ticketData: { subject: 'test' }, articles: [] })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED_DRAFT_GENERATION");
  });

  it('should reject requests with invalid authorization tokens', async () => {
    const res = await fetch(`${WORKER_URL}/api/v1/onyx-bridge/draft`, {
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
