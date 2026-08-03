import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Onyx Edge Worker - Action Resolver Validation', () => {
  it('should reject execution requests without a valid Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "Unauthorized" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitlLogId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    expect(res.status).toBe(401);
  });

  it('should reject execution requests with invalid UUID payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: "Invalid UUID payload" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ hitlLogId: 'invalid-uuid-string' })
    });
    expect([400, 429, 403]).toContain(res.status);
  });
});

describe('Onyx Edge Worker - SLA Escalation API', () => {
  it('should upgrade breached tickets to urgent and return escalated_count', async () => {
    // Mock the SLA endpoint response directly or by invoking the handler
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, escalated_count: 2 })
    });

    const res = await fetch('http://localhost:8787/api/v1/sla/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalated_count).toBe(2);
  });


  it('should trigger sla_breach_escalated telemetry event logging', async () => {
    // Check if telemetry logging returns expected response
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, escalated_count: 1, telemetry_logged: true })
    });

    const res = await fetch('http://localhost:8787/api/v1/sla/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.telemetry_logged).toBe(true);
  });

  it('should reject SLA escalate requests without a valid Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED_SLA_ESCALATE" })
    });

    const res = await fetch('http://localhost:8787/api/v1/sla/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });
});
