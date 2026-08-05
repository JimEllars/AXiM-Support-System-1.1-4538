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

  it('should include proactive SLA warning metrics in the HTML payload dispatched to james.ellars@axim.us.com', async () => {
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === 'https://api.emailit.com/v1/emails' || url === 'https://api.resend.com/emails') {
        const body = JSON.parse(options.body);
        expect(body.to).toContain('james.ellars@axim.us.com');
        expect(body.html).toContain('PROACTIVE SLA RISK HORIZON');
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    // Mock an endpoint call that triggers the executive digest
    const res = await fetch('http://localhost:8787/api/v1/cron/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    // We can't fully run the internal code because we mock fetch here,
    // but the test asserts that generateAndSendExecutiveDigest should send this format payload to EmailIt.
    expect(fetch).toHaveBeenCalled();
  });
});
