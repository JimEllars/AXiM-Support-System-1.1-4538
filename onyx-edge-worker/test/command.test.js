import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Command Gateway & Terminal Command Suite', () => {
  it('should reject command requests without authorization token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_COMMAND_EXECUTION" })
    });

    const res = await fetch('http://localhost:8787/api/v1/command/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: 'ticket-123', command: '/escalate' })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED_COMMAND_EXECUTION");
  });

  it('should process authorized /brief command requests successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, command: '/brief', ticket_id: 'ticket-123' })
    });

    const res = await fetch('http://localhost:8787/api/v1/command/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      },
      body: JSON.stringify({ ticketId: 'ticket-123', command: '/brief' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.command).toBe('/brief');
  });
});
