import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch Endpoint', () => {
  it('should reject email dispatch requests missing authorization token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_EMAIL_DISPATCH" })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'test@axim.us.com', subject: 'Test', html: '<p>Test</p>' })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED_EMAIL_DISPATCH");
  });

  it('should process authorized email dispatch requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, recipient: 'james.ellars@axim.us.com' })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      },
      body: JSON.stringify({
        to: 'james.ellars@axim.us.com',
        subject: 'Realtime Approval Alert',
        html: '<p>Approval required</p>'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recipient).toBe('james.ellars@axim.us.com');
  });
});
