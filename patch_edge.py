import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

# 1. Add new global helpers
helper_str = """// Lightweight JSONB stringifier mapper guard helper placement (place at global helper region)
function sanitizePayload(obj: any): any {
"""

new_helpers = """function threatVerifyPayloadSanitizer(payload: any): any {
  return serializeTelemetryPayload(sanitizePayload(payload));
}

function serializeTelemetryPayload(payload: any): any {
  return JSON.parse(JSON.stringify(payload));
}

// AST Payload Sanitization
function sanitizePayload(obj: any): any {"""

content = content.replace("// AST Payload Sanitization\nfunction sanitizePayload(obj: any): any {", new_helpers)

# 2. Replace the outcome.success block
search_block = """    const outcome: any = await turnstileVerify.json();
    if (!outcome.success) {
      // CRITICAL FIX: Asynchronous Edge Threat Logging
      const logThreat = async () => {
        try {
          const clientIP = request.headers.get("CF-Connecting-IP") || "unknown_ip";
          const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
          await supabaseAdmin.from("events_ax2024").insert({
            type: "threat_blocked",
            payload: {
              reason: "turnstile_validation_failed",
              ip: clientIP,
              cf_ray: request.headers.get("cf-ray") || "unknown",
              timestamp: new Date().toISOString()
            }
          });
        } catch (e) { /* silent catch for background thread */ }
      };
      ctx.waitUntil(logThreat()); // Non-blocking edge execution

      return new Response(JSON.stringify({ error: "Bot verification failed." }), { status: 403, headers: getCorsHeaders(env, request) });
    }"""

replace_block = """    const outcome: any = await turnstileVerify.json();
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

content = content.replace(search_block, replace_block)

with open('onyx-edge-worker/src/index.ts', 'w') as f:
    f.write(content)
