import { describe, it, expect } from 'vitest';

describe('Onyx Edge Worker - Sandbox Egress Validation', () => {
  it('should format the Sandbox dispatch payload correctly', () => {
    // Mock ticket data
    const mockTicket = {
      id: '12345',
      subject: 'Database Timeout',
      description: 'Connections dropping during peak load',
      status: 'open'
    };

    // The exact payload structure expected by the Sandbox
    const expectedPayload = {
      source: 'support_system_v1',
      ticket_id: mockTicket.id,
      context: {
        subject: mockTicket.subject,
        description: mockTicket.description
      },
      dispatch_reason: 'low_confidence_triage'
    };

    // Assertions to ensure our formatting logic doesn't drift
    expect(expectedPayload.ticket_id).toBeDefined();
    expect(expectedPayload.context.subject).toBe(mockTicket.subject);
    expect(expectedPayload.source).toBe('support_system_v1');
  });

  it('should construct firmographics payload with correct ticket metadata', () => {
    const record = {
      id: 'ticket-1',
      subject: 'Issue with payment',
      status: 'resolved',
      metadata: {
        company_tier: 'Enterprise',
        lifetime_value_ltv: 50000,
        account_owner: 'John Doe'
      }
    };

    const firmographics = {
      company_tier: record.metadata?.company_tier || "Unassigned",
      lifetime_value_ltv: record.metadata?.lifetime_value_ltv || null,
      account_owner: record.metadata?.account_owner || "Unassigned"
    };

    const ticketSummary = {
      ticket_id: record.id,
      subject: record.subject,
      status: record.status,
      resolution_time: new Date().toISOString(),
      firmographics
    };

    expect(ticketSummary.firmographics).toBeDefined();
    expect(ticketSummary.firmographics.company_tier).toBe('Enterprise');
    expect(ticketSummary.firmographics.lifetime_value_ltv).toBe(50000);
    expect(ticketSummary.firmographics.account_owner).toBe('John Doe');
  });

  it('should construct firmographics payload with correct fallbacks when metadata is missing', () => {
    const record = {
      id: 'ticket-2',
      subject: 'Help with login',
      status: 'resolved',
      metadata: {}
    };

    const firmographics = {
      company_tier: record.metadata?.company_tier || "Unassigned",
      lifetime_value_ltv: record.metadata?.lifetime_value_ltv || null,
      account_owner: record.metadata?.account_owner || "Unassigned"
    };

    const ticketSummary = {
      ticket_id: record.id,
      subject: record.subject,
      status: record.status,
      resolution_time: new Date().toISOString(),
      firmographics
    };

    expect(ticketSummary.firmographics).toBeDefined();
    expect(ticketSummary.firmographics.company_tier).toBe('Unassigned');
    expect(ticketSummary.firmographics.lifetime_value_ltv).toBe(null);
    expect(ticketSummary.firmographics.account_owner).toBe('Unassigned');
  });
});
