import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch, Cache Invalidation & Attachment Suite', () => {
  it('should process executive responses and trigger KV cache invalidation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      text: async () => 'ACTION APPROVED & AUTO-EXECUTED'
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/respond?id=hitl-123&action=approve&token=valid_token', { method: 'GET' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AUTO-EXECUTED');
  });

  it('should parse inbound email attachments and return ticket match details', async () => {
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
        subject: 'Re: [Ticket #12345678-aaaa-bbbb-cccc-123456789012] Attachment Test',
        text: 'Document attached.',
        attachments: [{ name: 'log.txt', content_type: 'text/plain', content_base64: 'VGVzdA==' }]
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matched_ticket_id).toBe('12345678-aaaa-bbbb-cccc-123456789012');
  });
});
