import sys

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

new_block = """    const outcome: any = await turnstileVerify.json();
    if (!outcome.success) {
      // CRITICAL FIX: Hardened Asynchronous Edge Threat Telemetry Logging
      const logThreat = async () => {
        try {
          const clientIP = request.headers.get("CF-Connecting-IP") || "unknown_ip";
          const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

          // Form a strictly formatted metadata object to safely match Postgres JSONB fields
          const threatEnvelope = {
            reason: "turnstile_validation_failed",
            ip: clientIP,
            cf_ray: request.headers.get("cf-ray") || "unknown",
            timestamp: new Date().toISOString(),
            error_codes: outcome['error-codes'] || []
          };

          await supabaseAdmin.from("events_ax2024").insert({
            type: "threat_blocked",
            payload: threatVerifyPayloadSanitizer(threatEnvelope)
          });
        } catch (e) { /* background thread failsafe pass */ }
      };
      ctx.waitUntil(logThreat()); // Non-blocking edge execution

      return new Response(JSON.stringify({ error: "Bot verification failed.", details: outcome['error-codes'] }), { status: 403, headers: getCorsHeaders(env, request) });
    }"""

# Find the block to replace
start_str = "    const outcome: any = await turnstileVerify.json();"
end_str = "      return new Response(JSON.stringify({ error: \"Bot verification failed.\" }), { status: 403, headers: getCorsHeaders(env, request) });\n    }"

# Note: Let's first verify exactly what is currently in the file for this block.
