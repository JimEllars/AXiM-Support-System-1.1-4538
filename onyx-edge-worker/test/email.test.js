import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch, Reminders & Inbound Attachment Suite', () => {
  it('should process stale reminder trigger requests on /api/v1/executive/remind-stale', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, reminders_dispatched: 0 })
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/remind-stale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should parse inbound email payloads containing base64 document attachments', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        matched_ticket_id: '12345678-aaaa-bbbb-cccc-123456789012',
        executive_directive_parsed: false
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'customer@client.com',
        subject: 'Re: [Ticket #12345678-aaaa-bbbb-cccc-123456789012] Diagnostic Report',
        text: 'Please see attached logs.',
        attachments: [
          { name: 'diagnostic.txt', content_type: 'text/plain', content_base64: 'U3lzdGVtIExvZyBEYXRh' }
        ]
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matched_ticket_id).toBe('12345678-aaaa-bbbb-cccc-123456789012');
  });
});
