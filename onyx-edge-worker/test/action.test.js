import { describe, it, expect } from 'vitest';

describe('Onyx Edge Worker - Action Resolver Validation', () => {
  const WORKER_URL = 'http://localhost:8787/api/v1/actions/resolve';
  const MOCK_SECRET = 'test-secret'; // Replaced by CI env vars

  it('should reject execution requests without a valid Bearer token', async () => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Missing Auth
      body: JSON.stringify({ hitlLogId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    expect(res.status).toBe(401);
  });

  it('should reject execution requests with invalid UUID payloads', async () => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MOCK_SECRET}`
      },
      body: JSON.stringify({ hitlLogId: 'invalid-uuid-string' })
    });
    expect(res.status).toBe(400); // Zod Schema should catch this
  });
});
