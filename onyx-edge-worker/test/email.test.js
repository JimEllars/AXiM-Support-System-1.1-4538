import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch & Inbound Webhook Suite', () => {
  it('should process inbound email replies and extract matched ticket IDs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, matched_ticket_id: '12345678-aaaa-bbbb-cccc-123456789012' })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'james.ellars@axim.us.com',
        subject: 'Re: [Ticket #12345678-aaaa-bbbb-cccc-123456789012] Issue Report',
        text: 'Proceed with the system restart.'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.matched_ticket_id).toBe('12345678-aaaa-bbbb-cccc-123456789012');
  });
});
