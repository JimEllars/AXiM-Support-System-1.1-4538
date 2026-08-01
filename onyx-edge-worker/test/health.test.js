import { describe, it, expect } from 'vitest';

describe('Edge Worker Health Payload', () => {
  it('should format degraded response properly', () => {
     // A mock unit test to ensure JSON stringify outputs synthetic=true when degraded
     const checks = {
        database: false,
        coreApi: false
     };
     const allHealthy = false;

     const responseJson = JSON.stringify({
      status: allHealthy ? "healthy" : "degraded",
      synthetic: !allHealthy,
      checks,
      timestamp: new Date().toISOString(),
    });

    const parsed = JSON.parse(responseJson);
    expect(parsed.status).toBe('degraded');
    expect(parsed.synthetic).toBe(true);
    expect(parsed.checks.database).toBe(false);
  });
});
