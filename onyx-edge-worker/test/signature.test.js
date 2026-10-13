import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Onyx Edge Worker - HMAC Signature Validation', () => {
  it('should reject external payloads missing the x-axim-signature header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Missing x-axim-signature" }), { status: 401 }));
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(401);
  });
});
