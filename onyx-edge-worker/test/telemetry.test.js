import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Telemetry Ingress & HMAC Safeguards', () => {
  it('should reject telemetry posts missing the signature header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_TELEMETRY_INGRESS" })
    });

    const res = await fetch('http://localhost:8787/api/v1/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_app: 'CRM_BRIDGE', error_code: 'ERR_500' })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED_TELEMETRY_INGRESS");
  });

  it('should reject telemetry requests with invalid HMAC signatures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 403,
      json: async () => ({ error: "CRYPTOGRAPHIC_SIGNATURE_MISMATCH" })
    });

    const res = await fetch('http://localhost:8787/api/v1/telemetry/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Axim-Signature': 'invalid_signature_hex'
      },
      body: JSON.stringify({ source_app: 'CRM_BRIDGE', error_code: 'ERR_500' })
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("CRYPTOGRAPHIC_SIGNATURE_MISMATCH");
  });
});
