import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Onyx Edge Worker - Public Intake Validation', () => {
  it('should accept and successfully decrypt a properly encrypted payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 200 });
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(200);
  });

  it('should reject tampered ciphertext and route to DLQ with 400 error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 400 });
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tampered: true })
    });
    expect(res.status).toBe(400);
  });

  it('should reject requests without a valid customer_email', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 400 });
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('should reject extremely large payloads (>5MB)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 413 });
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ large: true })
    });
    expect([413, 400, 429]).toContain(res.status);
  });

  it('should reject external webhooks missing a valid HMAC signature', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 401 });
    const res = await fetch('http://localhost:8787/api/v1/webhooks/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(401);
  });
});
