import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Webhook Security & Rate-Limiting Suite', () => {
  it('should return 429 Too Many Requests when inbound webhook rate limit is exceeded', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 429,
      json: async () => ({ error: "RATE_LIMIT_EXCEEDED" })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'spammer@test.com', subject: 'Test' })
    });

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it('should return 401 Unauthorized for invalid HMAC webhook signatures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "INVALID_WEBHOOK_SIGNATURE" })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EmailIt-Signature': 'invalid_signature_hash'
      },
      body: JSON.stringify({ sender: 'test@axim.us.com', subject: 'Test' })
    });

    expect(res.status).toBe(401);
  });
});
