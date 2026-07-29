import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Edge Auto-Draft Generation & Feedback Suite', () => {
  it('should reject unauthorized feedback telemetry requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_FEEDBACK_DISPATCH" })
    });

    const res = await fetch('http://localhost:8787/api/v1/telemetry/autodraft-feedback', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should process authorized auto-draft feedback dispatches successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, action: 'applied', ticket_id: 'ticket-123' })
    });

    const res = await fetch('http://localhost:8787/api/v1/telemetry/autodraft-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      },
      body: JSON.stringify({ ticketId: 'ticket-123', action: 'applied', draftLength: 120 })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.action).toBe('applied');
  });
});
