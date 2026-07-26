import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EmailIt Edge Preferences & Notification Control Suite', () => {
  it('should return email notification preference settings on GET /api/v1/email/preferences', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        preferences: { instant_receipts: true, urgent_alerts: true, daily_digest: true }
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/preferences', { method: 'GET' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.preferences.instant_receipts).toBe(true);
  });

  it('should process authorized preference updates on POST /api/v1/email/preferences', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        preferences: { instant_receipts: false, urgent_alerts: true, daily_digest: true }
      })
    });

    const res = await fetch('http://localhost:8787/api/v1/email/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_session_token'
      },
      body: JSON.stringify({ instant_receipts: false })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.preferences.instant_receipts).toBe(false);
  });
});
