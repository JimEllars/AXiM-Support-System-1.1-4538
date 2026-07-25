import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Dispatch, Export & Attachment Suite', () => {
  it('should reject unauthorized thread briefing export requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_EXPORT_REQUEST" })
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/export-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: 'ticket-123' })
    });

    expect(res.status).toBe(401);
  });

  it('should process authorized thread export requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, recipient: 'james.ellars@axim.us.com' })
    });

    const res = await fetch('http://localhost:8787/api/v1/executive/export-thread', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      },
      body: JSON.stringify({ ticketId: 'ticket-123' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recipient).toBe('james.ellars@axim.us.com');
  });
});
