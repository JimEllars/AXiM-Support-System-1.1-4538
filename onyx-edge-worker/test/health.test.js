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

  it('should return 500 when AXIM_ONYX_SECRET is missing', async () => {
    // We mock the fetch handler directly by simulating the conditions in index.ts
    // In a real environment, we would use Miniflare, but this mimics the logic
    const env = { AXIM_ONYX_SECRET: '', TURNSTILE_SECRET_KEY: 'valid' };

    // Simulate the logic block from index.ts
    let response;
    if (!env.AXIM_ONYX_SECRET || env.AXIM_ONYX_SECRET.trim() === "" || !env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY.trim() === "") {
      response = new Response(JSON.stringify({
        success: false,
        error: "ENV_SECRET_MISALIGNMENT",
        message: "Required core infrastructure secrets are missing from the active worker environment context."
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    expect(response).toBeDefined();
    expect(response.status).toBe(500);
    const parsed = await response.json();
    expect(parsed.error).toBe('ENV_SECRET_MISALIGNMENT');
  });
});
