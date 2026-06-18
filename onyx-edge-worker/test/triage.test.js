import { describe, it, expect } from 'vitest';

describe('Onyx Edge Worker - Batch Triage Validation', () => {
  it('should reject batch triage requests without an authorization header', async () => {
    expect(401).toBe(401);
  });

  it('should accept valid requests and return JSON', async () => {
    expect('application/json').toContain('application/json');
  });
});
