import { describe, it, expect } from 'vitest';

describe('Onyx Edge Worker - HMAC Signature Validation', () => {
  // Note: This tests the functional expectation of the route
  const WORKER_URL = 'http://localhost:8787/api/v1/webhooks/public-intake';

  it('should reject external payloads missing the x-axim-signature header', async () => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
        // Intentionally omitting x-axim-signature and internal proxy source tags
      },
      body: JSON.stringify({ subject: 'Malicious Ticket', customer_email: 'hacker@bad.com' })
    });

    // Should fall through to the signature rejection block
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Forbidden: Invalid Origin');
  });
});
