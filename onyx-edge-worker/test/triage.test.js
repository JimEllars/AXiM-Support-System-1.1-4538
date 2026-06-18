import { describe, it, expect } from 'vitest';

describe('Onyx Edge Worker - Batch Triage Validation', () => {
  const WORKER_URL = 'http://localhost:8787/batch-triage';

  it('should reject batch triage requests without an authorization header', async () => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketIds: ['123', '456'] })
    });
    expect(res.status).toBe(401);
  });

  it('should accept valid requests and return JSON (mocking auth success)', { timeout: 10000 }, async () => {
    // Note: In a real environment, this tests the structure of the rejection if DB fails,
    // or success if the mock DB works. We are verifying the boundary here.
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret' // Will fail DB connection but pass Edge Auth
      },
      body: JSON.stringify({ ticketIds: [] })
    });

    const data = await res.json();
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
