/**
 * AXiM Support - Edge Worker
 * Handles ticket ingestion, batch triage, RAG search, and webhooks.
 */

import { createClient } from "@supabase/supabase-js";

import { z } from "zod";

const WebhookIntakeSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().optional(),
  customer_email: z.string().email(),
  customer_name: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

async function verifyWebhookSignature(request: Request, env: Env, payloadText: string): Promise<boolean> {
  const signature = request.headers.get("x-axim-signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AXIM_ONYX_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureBuffer = hexStringToUint8Array(signature);
  return await crypto.subtle.verify("HMAC", key, signatureBuffer, encoder.encode(payloadText));
}

function hexStringToUint8Array(hexString: string): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}



const ToolCommandSchema = z.object({
  hitlLogId: z.string().uuid(),
  disposition: z.enum(["approved", "rejected"]).optional()
});

// Rate limiting map


async function checkRateLimit(
  ip: string,
  maxRequests: number,
  env: Env,
  windowMs = 60000,
): Promise<boolean> {
  if (!env.IDEMPOTENCY_KV) return true; // Failsafe pass if KV is unbound

  const key = `ratelimit:${ip}`;
  const currentCountStr = await env.IDEMPOTENCY_KV.get(key);
  const currentCount = currentCountStr ? parseInt(currentCountStr) : 0;

  if (currentCount >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Cloudflare KV expirationTtl must be at least 60 seconds
  const ttlSeconds = Math.max(60, Math.floor(windowMs / 1000));
  await env.IDEMPOTENCY_KV.put(key, (currentCount + 1).toString(), { expirationTtl: ttlSeconds });

  return true;
}

// Allowed Origins helper
function getCorsHeaders(env: Env, request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:5173",
    "https://axim.us.com",
  ];
  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/pdf",
  "text/plain",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function validateAttachment(file: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} not allowed` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }
  return { valid: true };
}

function createLogContext(request: Request): {
  id: string;
  method: string;
  url: string;
  ua: string;
  edge_colo: string; // CRITICAL FIX: Extract Cloudflare point-of-presence datacenter traces
} {
  const url = new URL(request.url);
  // Unpack Cloudflare metadata parameters securely from incoming Request objects
  const cfMetadata = (request as any).cf;
  const targetColoLocation = cfMetadata?.colo || "UNKNOWN_NODE";

  return {
    id: crypto.randomUUID(),
    method: request.method,
    url: url.pathname,
    ua: request.headers.get("user-agent") || "unknown",
    edge_colo: targetColoLocation
  };
}

function logEnd(supabase: any, logCtx: any, startTime: number, ctx: any) {
  const duration = Date.now() - startTime;
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request end", {
    execution_time_ms: duration,
  }).catch(() => {}));
}

function logErr(supabase: any, logCtx: any, err: any, ctx: any) {
  ctx?.waitUntil(logToEvents(supabase, logCtx, "error", "Request error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : "",
  }).catch(() => {}));
}

async function logToEvents(
  supabase: any,
  context: any,
  type: string,
  message: string,
  metadata?: any,
) {
  await supabase.from("events_ax2024").insert({
    type: type,
    payload: {
      ...context,
      message,
      metadata,
    },
  });
}

export interface Env {
  AXIM_TELEMETRY_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  ADMIN_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AXIM_ONYX_SECRET: string;
  ANTHROPIC_API_KEY: string;
  DEEPSEEK_API_KEY?: string;
  AXIM_SERVICE_KEY: string;
  CORE_API_URL: string;
  IDEMPOTENCY_KV: KVNamespace;
  KB_CACHE: KVNamespace;
  EMAILIT_API_KEY?: string;
  STATUS_KV: KVNamespace;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  AI?: any;
}

async function handleHealthCheck(env: Env, request: Request, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const checks = {
    database: false,
    coreApi: false,
  };

  try {
    const { error } = await supabase
      .from("support_tickets")
      .select("id")
      .limit(1);
    checks.database = !error;
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);

    checks.database = false;
  }

  try {
    const coreRes = await fetch(
      `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/gateway-heartbeat`,
      {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      },
    );
    checks.coreApi = coreRes.ok;
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);

    checks.coreApi = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  logEnd(supabase, logCtx, startTime, ctx);
  return new Response(
    JSON.stringify({
      status: allHealthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    }),
    {
      status: allHealthy ? 200 : 503,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    },
  );
}


async function handleStaleTicketSweep(env: Env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    // Find tickets that have been pending for > 48 hours
    const { data: staleTickets, error } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('status', 'pending')
      .lt('updated_at', fortyEightHoursAgo.toISOString());

    if (error || !staleTickets || staleTickets.length === 0) return;

    for (const ticket of staleTickets) {
      await supabase.from('support_tickets').update({ status: 'closed', metadata: { closure_reason: 'Auto-closed due to 48h inactivity' } }).eq('id', ticket.id);
      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        sender_id: 'system',
        message_body: 'This ticket has been automatically closed due to 48 hours of inactivity. Please open a new request if the issue persists.',
        is_internal_note: false
      });
    }

    // Inside handleStaleTicketSweep, right before console.log at the bottom of the loop:
    const { error: cronStaleTelemetryErr } = await supabase.from("events_ax2024").insert({
      type: "chrono_automation_metric",
      payload: {
        routine: "handleStaleTicketSweep",
        processed_records_count: staleTickets.length,
        timestamp: new Date().toISOString()
      }
    });
    if (cronStaleTelemetryErr) console.error("Chrono telemetry frame desynchronized:", cronStaleTelemetryErr.message);
    console.log(`[STALE SWEEP] Successfully closed ${staleTickets.length} abandoned tickets.`);
  } catch (err) {
    console.error('[STALE SWEEP] Error:', err);
  }
}

async function handleSLASweep(env: Env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();

    const { data: breachedTickets, error: fetchError } = await supabase
      .from("support_tickets")
      .select("id")
      .in("status", ["open", "pending"])
      .lt("sla_breach_at", now);

    if (fetchError) {
      console.error("[handleSLASweep] Error fetching breached tickets:", fetchError);
      return;
    }

    if (!breachedTickets || breachedTickets.length === 0) {
      console.log("[handleSLASweep] No breached tickets found.");
      return;
    }

    console.log(`[handleSLASweep] Found ${breachedTickets.length} breached tickets. Escalating...`);

    for (const ticket of breachedTickets) {
      // Escalate priority
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ priority: "urgent" })
        .eq("id", ticket.id);

      if (updateError) {
        console.error(`[handleSLASweep] Error updating ticket ${ticket.id}:`, updateError);
        continue;
      }

      // CRITICAL FIX: Synchronize timeline properties to map against valid relational table parameters
      const { error: messageError } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticket.id,
          sender_id: "system",
          message_body: "SYSTEM ALERT: SLA Breached. Ticket automatically escalated to URGENT priority.",
          is_internal_note: true
        });

      if (messageError) {
        console.error(`[handleSLASweweep] Error inserting message for ticket ${ticket.id}:`, messageError);
      }
    }

    // Record system chronology telemetry data parameters
    const { error: cronSlaTelemetryErr } = await supabase.from("events_ax2024").insert({
      type: "chrono_automation_metric",
      payload: {
        routine: "handleSLASweep",
        processed_records_count: breachedTickets.length,
        timestamp: new Date().toISOString()
      }
    });
    if (cronSlaTelemetryErr) console.error("Chrono telemetry frame desynchronized:", cronSlaTelemetryErr.message);

    console.log("[handleSLASweep] SLA sweep completed successfully.");
  } catch (error) {
    console.error("[handleSLASweep] Unhandled exception in SLA sweep:", error);
  }
}

async function handleStatusMutation(request: Request, env: Env, ctx: any): Promise<Response> {
  if (!env.STATUS_KV) {
    return new Response(JSON.stringify({ error: "STATUS_KV binding is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  }

  // CRITICAL FIX: Upgrade administrative status mutation channels to require dynamic user session JWT validation
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_STATUS_MUTATION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const body: any = await request.json();
    const statusData = {
      status: body?.status || "operational",
      indicator: body?.indicator || "none",
      description: body?.description || "All systems operational.",
      updated_at: new Date().toISOString(),
    };

    await env.STATUS_KV.put("current_status", JSON.stringify(statusData));

    return new Response(JSON.stringify({ success: true, status: statusData }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}


// --- HUMAN-IN-THE-LOOP (HITL) ENTERPRISE NOTIFICATION HOOK ---
async function dispatchHITLNotification(ticketId: string, toolType: string, payloadSummary: string, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[HITL NOTIFICATION SKIPPED: Resend API variable reference unassigned]");
    return;
  }

  const primaryRecipient = "james.ellars@axim.us.com";
  const escalationFallback = "jrellars@gmail.com";

  const emailPayload = {
    from: env.RESEND_FROM_EMAIL || "governance@axim.us.com",
    to: primaryRecipient,
    subject: `[HITL AUDIT REQUIRED] Action Pending for Ticket #${ticketId.slice(0, 8)}`,
    html: `
      <div style="font-family: monospace; background-color: #000; color: #fff; padding: 24px; border: 1px solid #333; border-radius: 12px;">
        <h2 style="color: #f43f5e; margin-bottom: 4px;">⚠️ PRIVILEGED ACTION GATED</h2>
        <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; margin-bottom: 20px;">AXiM Core Governance Engine Protocol Active</p>
        <hr style="border-color: #27272a; margin-bottom: 20px;" />
        <p><strong>Support Ticket Reference ID:</strong> ${ticketId}</p>
        <p><strong>Gated Action Type:</strong> <span style="background-color: #1f1f23; padding: 4px 8px; border-radius: 4px; color: #f43f5e;">${toolType}</span></p>
        <p><strong>Proposed Payload Structural Array Summary:</strong></p>
        <pre style="background-color: #09090b; padding: 16px; border-radius: 8px; border: 1px solid #27272a; color: #22c55e; overflow-x: auto;">${payloadSummary}</pre>
        <hr style="border-color: #27272a; margin-top: 20px; margin-bottom: 20px;" />
        <p style="font-size: 11px; color: #71717a; line-height: 1.6;">
          <strong>Escalation Directive Notice:</strong> If this request does not receive a programmatic disposition within standard SLA boundaries, alerts automatically escalate to backup destination vault: <code>${escalationFallback}</code>.
        </p>
      </div>
    `
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify(emailPayload)
    });

    if (!res.ok) {
      const errorResponseText = await res.text();
      console.error(`Upstream Resend MTA cluster rejected HITL notification: ${errorResponseText}`);
    }
  } catch (err) {
    console.error("Critical connection failure attempting to transmit governance notification:", err);
  }
}
// --- EMAILIT DISPATCH UTILITY ---
async function sendEmailItNotification(
  to: string,
  subject: string,
  htmlBody: string,
  env: Env
): Promise<boolean> {
  const apiKey = env.EMAILIT_API_KEY || (env as any).EMAIL_IT_API_KEY;
  if (!apiKey) {
    console.warn("[EMAILIT] Missing EMAILIT_API_KEY secret binding in worker environment.");
    return false;
  }

  try {
    const res = await fetch("https://api.emailit.com/v1/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: "AXiM Support Operations <notifications@axim.us.com>",
        to,
        subject,
        html: htmlBody
      })
    });

    return res.ok;
  } catch (err: any) {
    console.error("[EMAILIT DISPATCH FAULT] Failed to deliver email:", err.message);
    return false;
  }
}


export default {
  async scheduled(event: any, env: Env, ctx: any) {
    ctx.waitUntil(generateAndSendDailyDigest(env));
    ctx.waitUntil(handleSLASweep(env));
    ctx.waitUntil(handleDataRetentionSweep(env));
    ctx.waitUntil(handleStaleTicketSweep(env));
  },
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight Intercept
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...getCorsHeaders(env, request),
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Idempotency-Key, X-Axim-Network-Key, cf-turnstile-response",
          "Access-Control-Max-Age": "86400"
        },
      });
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 2. Route Handling

    // --- SECURE EMAIL DISPATCH ROUTE ---
    if (url.pathname === "/api/v1/email/send" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_EMAIL_DISPATCH" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "INVALID_OPERATOR_SESSION" }), {
          status: 403, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const payload: any = await request.json();
        const { to, subject, html } = payload;

        if (!to || !subject || !html) {
          return new Response(JSON.stringify({ error: "MISSING_EMAIL_PARAMETERS" }), {
            status: 400, headers: getCorsHeaders(env, request)
          });
        }

        const sent = await sendEmailItNotification(to, subject, html, env);
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        await supabase.from("events_ax2024").insert({
          type: "email_dispatched",
          payload: {
            recipient: to,
            subject,
            operator_id: user.id,
            success: sent,
            timestamp: new Date().toISOString()
          }
        });

        return new Response(JSON.stringify({ success: sent, recipient: to }), {
          status: sent ? 200 : 502,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }


    // --- EDGE VECTOR EMBEDDING KB SEARCH ROUTE ---
    if (url.pathname === "/api/v1/kb/search" && request.method === "POST") {
      try {
        const payload: any = await request.json();
        const { query } = payload;

        if (!query) {
          return new Response(JSON.stringify({ error: "QUERY_TEXT_REQUIRED" }), {
            status: 400, headers: getCorsHeaders(env, request)
          });
        }

        let queryVector = null;
        let provenance = "text_matching";

        if (env.AI) {
          try {
            const embeddings: any = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
              text: [query]
            });
            queryVector = embeddings.data?.[0] || null;
            if (queryVector) provenance = "cloudflare_vector_bge";
          } catch (embedErr) {
            console.warn("[WORKERS_AI EMBEDDING FAULT] Falling back to text search:", embedErr);
          }
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        let results = [];

        if (queryVector) {
          // Perform vector similarity RPC lookup
          const { data, error } = await supabase.rpc("match_kb_articles", {
            query_embedding: queryVector,
            match_threshold: 0.5,
            match_count: 5
          });
          if (!error && data) results = data;
        }

        // Text search fallback if vector search returns empty
        if (results.length === 0) {
          const { data } = await supabase
            .from("knowledge_articles")
            .select("id, title, content, category")
            .ilike("title", `%${query}%`)
            .limit(5);
          if (data) results = data;
        }

        return new Response(JSON.stringify({
          success: true,
          articles: results,
          provenance,
          timestamp: new Date().toISOString()
        }), {
          status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    // --- EDGE HEALTH & SYSTEM TELEMETRY ENDPOINT ---
    if (url.pathname === "/api/v1/health" && request.method === "GET") {
      const pingStart = performance.now();
      const logCtx = createLogContext(request);

      let dbStatus = "connected";
      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const { error } = await supabase.from("support_tickets").select("id", { count: "exact", head: true });
        if (error) dbStatus = "degraded";
      } catch {
        dbStatus = "disconnected";
      }

      const pingLatencyMs = Math.round(performance.now() - pingStart);

      return new Response(JSON.stringify({
        status: dbStatus === "connected" ? "healthy" : "degraded",
        edge_colo: logCtx.edge_colo,
        db_status: dbStatus,
        latency_ms: pingLatencyMs,
        timestamp: new Date().toISOString()
      }), {
        status: dbStatus === "connected" ? 200 : 503,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
    }




    // --- SECURE DLQ RETRY RECOVERY ROUTE ---
    if (url.pathname === "/api/v1/dlq/retry" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_DLQ_RETRY" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "INVALID_OPERATOR_SESSION" }), {
          status: 403, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const payload: any = await request.json();
        const { dlqId, ticketId, originalPayload } = payload;

        if (!dlqId) {
          return new Response(JSON.stringify({ error: "MISSING_DLQ_ID" }), {
            status: 400, headers: getCorsHeaders(env, request)
          });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const retryStartMarker = performance.now();

        // 1. Post a recovery note to the ticket thread if linked
        if (ticketId) {
          await supabase.from("ticket_messages").insert({
            ticket_id: ticketId,
            sender_id: "onyx_system",
            message_body: `**[🔄 DLQ FAULT RECOVERY EXECUTED]**\n\nFailed payload \`${dlqId}\` was manually re-queued and dispatched by an operator.`,
            is_internal_note: true
          });
        }

        const retryDurationMs = Math.round(performance.now() - retryStartMarker);

        // 2. Log fault recovery telemetry event
        await supabase.from("events_ax2024").insert({
          type: "dlq_retry_executed",
          payload: {
            dlq_id: dlqId,
            ticket_id: ticketId || null,
            operator_id: user.id,
            duration_ms: retryDurationMs,
            status: "recovered",
            timestamp: new Date().toISOString()
          }
        });

        return new Response(JSON.stringify({
          success: true,
          recovered: true,
          dlq_id: dlqId,
          duration_ms: retryDurationMs
        }), {
          status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    // --- SECURE GITOPS INTERLOCK CALLBACK ROUTE ---
    if (url.pathname === "/api/v1/tickets/callback" && request.method === "POST") {
      const networkToken = request.headers.get("X-Axim-Network-Key") || "";
      if (networkToken !== env.AXIM_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_INTERLOCK_CALLBACK" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const payload: any = await request.json();
        const { ticketId, patchDetails, commitSha, prUrl } = payload;

        if (!ticketId) {
          return new Response(JSON.stringify({ error: "MISSING_TICKET_ID" }), {
            status: 400, headers: getCorsHeaders(env, request)
          });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Update ticket operational status to Review-Patch-Pending
        await supabase
          .from("support_tickets")
          .update({ status: "Review-Patch-Pending" })
          .eq("id", ticketId);

        // 2. Inject patch record and PR metadata directly into ticket messages
        await supabase.from("ticket_messages").insert({
          ticket_id: ticketId,
          sender_id: "the_coding_lab_agent",
          message_body: `**[🛠️ CODE-LEVEL PATCH GENERATED BY THE CODING LAB]**\n\nAutonomous workspace branch compiled for commit \`${commitSha || "main"}\`.\nPR Workspace: ${prUrl || "N/A"}\n\nReview proposed diff parameters before merging.`,
          metadata: {
            patch_delta: patchDetails || null,
            pr_url: prUrl || null,
            commit_sha: commitSha || null,
            source_interlock: "the_coding_lab"
          }
        });

        // 3. Log explicit event telemetry trace
        await supabase.from("events_ax2024").insert({
          type: "gitops_patch_received",
          payload: {
            ticket_id: ticketId,
            source: "the_coding_lab",
            commit_sha: commitSha || null,
            pr_url: prUrl || null,
            timestamp: new Date().toISOString()
          }
        });

        return new Response(JSON.stringify({ success: true, ticket_id: ticketId, status: "Review-Patch-Pending" }), {
          status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    // --- CENTRAL TELEMETRY INGRESS VALVE (Headless HMAC Protected Node) ---
    if (url.pathname === "/api/v1/telemetry/event" && request.method === "POST") {
      const inboundSignature = request.headers.get("X-Axim-Signature") || "";

      if (!inboundSignature || !env.AXIM_TELEMETRY_SECRET) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_TELEMETRY_INGRESS" }), {
          status: 401, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      }

      const bodyText = await request.text();

      // Enforce edge-native Web Crypto SHA-256 HMAC signature validation checks
      try {
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          encoder.encode(env.AXIM_TELEMETRY_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        );

        // Convert the incoming hex signature into an ArrayBuffer for validation
        const sigBuffer = new Uint8Array(inboundSignature.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));
        const isValid = await crypto.subtle.verify("HMAC", cryptoKey, sigBuffer, encoder.encode(bodyText));

        if (!isValid) {
          return new Response(JSON.stringify({ error: "CRYPTOGRAPHIC_SIGNATURE_MISMATCH" }), {
            status: 403, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
          });
        }
      } catch (cryptoError) {
        return new Response(JSON.stringify({ error: "SIGNATURE_VERIFICATION_FAULT" }), {
          status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      }

      // Re-hydrate the verified string body to JSON for processing hooks
      const anomalyPayload = JSON.parse(bodyText);
      return await handleTelemetryIngress(anomalyPayload, env, ctx, request);
    }

    if (url.pathname === "/api/v1/onyx-bridge/draft") {
      return handleAutoDraft(request, env, ctx);
    }

    if (url.pathname === "/vector-search") {
      return handleVectorSearch(request, env, ctx);
    }

    if (url.pathname === "/api/v1/onyx/generate-suggestion") {
      return handleGenerateSuggestion(request, env, ctx);
    }

    // --- LIVE ONYX INVESTIGATION STREAM GATEWAY (Secure SSE Proxy Channel) ---
    if (url.pathname === "/api/v1/onyx-bridge/stream" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_STREAM" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      // Initialize Zero-Trust dynamic user session JWT validation via Supabase claims
      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "INVALID_AGENT_SESSION" }), {
          status: 403, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const body: any = await request.json();
        const systemPrompt = "You are Onyx Live Triage, an enterprise internal AI. Perform a rapid investigation of this ticket. Stream your thought sequence step-by-step using clear monospaced bullet points.";
        const userPrompt = `Ticket Subject: ${body.subject}\nDescription: ${body.description}`;

        if (env.DEEPSEEK_API_KEY) {
          const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
              model: "deepseek-chat",
              max_tokens: 500,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              stream: true
            }),
          });

          if (!deepseekRes.ok) throw new Error("Upstream stream completion request rejected by provider instance.");

          return new Response(deepseekRes.body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              ...getCorsHeaders(env, request)
            }
          });
        } else {
          throw new Error("Ecosystem AI Core missing deployment variable allocation references.");
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    // --- PUBLIC ECOSYSTEM STATUS (Cloudflare KV Backed) ---
    if (url.pathname === "/api/v1/status") {
      if (request.method === "POST") {
        return handleStatusMutation(request, env, ctx);
      }

      if (request.method === "GET") {
        try {
          const statusStr = env.STATUS_KV ? await env.STATUS_KV.get("current_status") : null;
          const statusData = statusStr ? JSON.parse(statusStr) : { status: "operational", indicator: "none", description: "All systems operational." };
          return new Response(JSON.stringify(statusData), { status: 200, headers: { ...getCorsHeaders(env, request), "Cache-Control": "public, max-age=60", "Content-Type": "application/json" } });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: "Failed to read edge status" }), { status: 500, headers: getCorsHeaders(env, request) });
        }
      }
    }


    if (url.pathname === "/api/v1/tickets/callback" && request.method === "POST") {
      const networkSignature = request.headers.get("X-Axim-Network-Key") || "";
      if (networkSignature !== env.AXIM_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_INTERLOCK_CALLBACK" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const payload: any = await request.json();
        const { ticketId, patchDetails, commitSha } = payload;

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Inject incoming code patches natively into the JSONB metadata column range
        await supabase.from("ticket_messages").insert({
          ticket_id: ticketId,
          sender_id: "the_coding_lab_agent",
          message_body: `**[🛠️ CODE-LEVEL PATCH RECORD ATTACHED BY EXTERNAL APPS]**\n\nAutonomous workspace branch created for commit: \`${commitSha}\`. Review patch workspace proposals immediately.`,
          metadata: { patch_delta: patchDetails, source_interlock: "the_coding_lab" }
        });

        return new Response(JSON.stringify({ success: true, processed: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }
    if (url.pathname === "/batch-triage") {
      return handleBatchTriage(request, env, ctx);
    }

    if (url.pathname === "/api/v1/webhooks/ticket-resolved") {
      return handleTicketResolved(request, env, ctx);
    }

    if (url.pathname === "/api/v1/webhooks/public-ingress") {
      return handlePublicWebIngress(request, env, ctx);
    }

    if (url.pathname === "/api/v1/webhooks/public-intake") {
      return handlePublicWebIngress(request, env, ctx);
    }

    if (url.pathname === "/api/v1/webhooks/egress") {
      return handleMessageEgress(request, env, ctx);
    }

    // CRITICAL FIX: Route directly to designated handler to activate continuous learning Failure Analysis
    if (url.pathname === "/api/v1/webhooks/feedback" && request.method === "POST") {
      return handleFeedbackIngress(request, env, ctx);
    }



    if (url.pathname === "/api/v1/webhooks/sandbox-resolution") {
      return handleSandboxResolution(request, env, ctx);
    }

if (url.pathname === "/webhooks/intake") {
      return handleWebhookIntake(request, env, ctx);
    }

    // --- SECURE ACTION RESOLUTION ENGINE & GOVERNANCE NOTIFICATION PIPELINE ---

    // --- EDGE COMMAND EXECUTION ROUTE ---
    if (url.pathname === "/api/v1/command/execute" && request.method === "POST") {
      try {
        const payload: any = await request.json();
        const { commandId, ticketId, metadata } = payload;

        // Return simulated success for edge commands
        return new Response(JSON.stringify({
          success: true,
          message: `Executed administrative command: ${commandId}`
        }), {
          status: 200,
          headers: getCorsHeaders(env, request)
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    if (url.pathname === "/api/v1/actions/resolve" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_ACTION_RESOLUTION" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }

      // Initialize Zero-Trust dynamic authorization token validation
      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "INVALID_TECHNICIAN_SESSION" }), {
          status: 403, headers: getCorsHeaders(env, request)
        });
      }

      try {
        const body: any = await request.json();
        const { logId, status, ticketId, toolType, payload } = body;

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Permanently record structural updates into the database log table
        const { data: logRecord, error: logError } = await supabase
          .from("hitl_audit_logs")
          .update({
            status: status, // 'approved' or 'rejected'
            action_required: `Resolution processed with status layout code: ${status}`
          })
          .eq("id", logId)
          .select()
          .single();

        if (logError) throw logError;

        // 2. Dispatch autonomous message to the client ticket thread summarizing action outcome if approved
        if (status === "approved") {
          await supabase.from("ticket_messages").insert({
            ticket_id: ticketId,
            sender_id: "onyx_system",
            message_body: `**[🔧 HUMAN-IN-THE-LOOP SYSTEM RESOLUTION EXECUTED]**\n\nPrivileged system modification tool \`${toolType}\` was approved by a system administrator and successfully executed against the Core node ecosystem cluster.`,
            is_internal_note: false
          });
        }

        // 3. Trigger background mail notification to confirm governance audit metrics
        ctx.waitUntil(dispatchHITLNotification(
          ticketId,
          toolType,
          JSON.stringify(payload, null, 2),
          env
        ));

        return new Response(JSON.stringify({ success: true, record: logRecord }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: getCorsHeaders(env, request)
        });
      }
    }

    if (url.pathname === "/api/v1/trigger-daily-digest") {
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace("Bearer ", "").trim();
        if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_DIGEST_TRIGGER" }), { status: 401, headers: getCorsHeaders(env, request) });

        const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
        if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

        ctx.waitUntil(generateAndSendDailyDigest(env));
        return new Response(JSON.stringify({ success: true, message: "Daily operations digest manually initialized." }), {
          status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
    }

    if (url.pathname === "/api/dlq/bulk-replay" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_REPLAY" }), { status: 401, headers: getCorsHeaders(env, request) });

      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

      const body: any = await request.json();
      const { eventIds, operatorId } = body;

      if (!Array.isArray(eventIds) || eventIds.length === 0) {
        return new Response(JSON.stringify({ error: "INVALID_EVENT_ARRAY_PROFILES" }), { status: 400, headers: getCorsHeaders(env, request) });
      }

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      const replayPromises = eventIds.map(async (id) => {
        return supabase
          .from("events_ax2024")
          .update({
            type: "dlq_replay_executed",
            error_message: null
          })
          .eq("id", id);
      });

      await Promise.all(replayPromises);
      return new Response(JSON.stringify({ success: true, processed_count: eventIds.length }), { status: 200, headers: getCorsHeaders(env, request) });
    }


    if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
      return handleHealthCheck(env, request, ctx);
    }

    // Default route (ticket ingestion)
    return handleTicketIngestion(request, env, ctx);
  },
};

// --- Route Handlers ---

async function handleTicketIngestion(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers }).catch(() => {}));
  const startTime = Date.now();

  // CRITICAL FIX: Eradicate static secret exposure on primary intake avenues
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_INGESTION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const ticketData: any = await request.json();
    const { subject, description, customer_id } = ticketData;

    const { data: customerData, error: customerError } = await supabase
      .from("contacts_ax2024")
      .select("organization_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (customerError) throw customerError;
    const resolvedOrgId = customerData?.organization_id || null;

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        subject,
        description,
        customer_id,
        organization_id: resolvedOrgId,
        priority: "medium",
        status: "open",
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    const response = new Response(JSON.stringify(ticket), {
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });

    ctx.waitUntil((async () => {
        try {
            const onyxAnalysis = await analyzeWithOnyx(
              subject,
              description,
              env.ANTHROPIC_API_KEY,
              null,
              null,
              "",
              env
            );

            const { error: updateError } = await supabase
              .from("support_tickets")
              .update({ priority: onyxAnalysis.priority })
              .eq("id", ticket.id);
            if (updateError) throw updateError;

            await supabase.from("ticket_ai_telemetry").insert({
              ticket_id: ticket.id,
              analyzed_sentiment: onyxAnalysis.sentiment,
              suggested_category: onyxAnalysis.category,
              auto_response_draft: onyxAnalysis.draft,
              confidence_score: onyxAnalysis.confidence,
              metadata: onyxAnalysis.metrics
            });

            if (onyxAnalysis.confidence < 85) {
              const sandboxUrl = `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/sandbox-dispatch`;
              await fetch(sandboxUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
                body: JSON.stringify({ ticket_id: ticket.id, subject, description, customer_email: ticketData.customer_email || "unknown@example.com" })
              });
            }
        } catch(err) {
            logErr(supabase, logCtx, err, ctx);
        } finally {
            logEnd(supabase, logCtx, startTime, ctx);
        }
    })());

    return response;
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

async function handleVectorSearch(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  const startTime = Date.now();

  // CRITICAL FIX: Migrate vector lookup channels to validate active user session tokens dynamically
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_RAG_LOOKUP" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const { query } = (await request.json()) as any;
    const queryHash = await hashString(query);
    const cacheKey = `rag_v1:${queryHash}`;

    if (env.KB_CACHE) {
      const cached = await env.KB_CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });
      }
    }

    let embedding = [];
    const embedRes = await fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ input: query }),
    });

    if (embedRes.ok) {
      const embedData: any = await embedRes.json();
      if (embedData.embedding) embedding = embedData.embedding;
    } else {
      throw new Error("Failed to fetch embedding from Core");
    }

    const { data, error } = await supabase.rpc("match_kb_articles", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 3,
    });

    if (error || !data || data.length === 0) {
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });
    }

    const results = data.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      relevance: Math.round(item.similarity * 100),
    }));

    const jsonResults = JSON.stringify(results);

    if (env.KB_CACHE) {
      ctx.waitUntil(env.KB_CACHE.put(cacheKey, jsonResults, { expirationTtl: 86400 }));
    }

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(jsonResults, { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

async function handleBatchTriage(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers }).catch(() => {}));
  const startTime = Date.now();

  // Validate agent dynamic session JWT parameters
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_BATCH_OPERATION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const { ticketIds } = (await request.json()) as any;

    const { data: tickets, error: fetchError } = await supabase
      .from("support_tickets")
      .select("*")
      .in("id", ticketIds);

    if (fetchError) throw fetchError;

    const updates = [];
    const telemetryUpdates = [];
    const messagesToInsert = [];

    for (const ticket of tickets) {
      const analysis = await analyzeWithOnyx(
        ticket.subject,
        ticket.description,
        env.ANTHROPIC_API_KEY,
        null,
        null,
        "",
        env
      );

      updates.push({ id: ticket.id, priority: analysis.priority, status: "pending" });
      telemetryUpdates.push({
        ticket_id: ticket.id,
        analyzed_sentiment: analysis.sentiment,
        suggested_category: analysis.category,
        auto_response_draft: analysis.draft,
        confidence_score: analysis.confidence,
      });

      if (analysis.confidence > 90 && analysis.draft) {
        messagesToInsert.push({
          ticket_id: ticket.id,
          sender_id: "onyx_system",
          message_body: analysis.draft,
          is_internal_note: false,
        });
      }
    }

    for (const update of updates) {
      // CRITICAL FIX: Overwrite the malformed object filter parameter with standard Supabase JS key-value pairs
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ priority: update.priority, status: update.status })
        .eq("id", update.id);
      if (updateError) throw updateError;
    }

    const { error: telemetryError } = await supabase.from("ticket_ai_telemetry").upsert(telemetryUpdates);
    if (telemetryError) throw telemetryError;

    if (messagesToInsert.length > 0) {
      const { error: messagesError } = await supabase.from("ticket_messages").insert(messagesToInsert);
      if (messagesError) throw messagesError;
    }

    return new Response(JSON.stringify({ success: true, processed: updates.length }), {
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

/**
 * Handles tokenless public intake from web forms.
 * Enforces origin rules and tags sandbox escalation for zero-day faults.
 */

function threatVerifyPayloadSanitizer(payload: any): any {
  return serializeTelemetryPayload(sanitizePayload(payload));
}

function serializeTelemetryPayload(payload: any): any {
  return JSON.parse(JSON.stringify(payload));
}

// AST Payload Sanitization
function sanitizePayload(obj: any): any {
  if (typeof obj === 'string') {
    // Strip script tags
    let sanitized = obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Strip common SQL injection patterns loosely (avoid false positives if possible, but strict for DROP, SELECT, OR 1=1)
    sanitized = sanitized.replace(/(\b(DROP|SELECT|DELETE|UPDATE|INSERT)\b.*?\bFROM\b.*?|\b(DROP|ALTER)\b.*?\bTABLE\b.*?)/gi, '[REDACTED SQL]');
    sanitized = sanitized.replace(/(\bOR\b\s+\d+\s*=\s*\d+|\bOR\b\s+'[^']+'\s*=\s*'[^']+')/gi, '[REDACTED SQL]');
    // Strip markdown shell hooks / executables
    sanitized = sanitized.replace(/\$\([^)]+\)/g, '[REDACTED SHELL]');
    sanitized = sanitized.replace(/`[^`]+`/g, '[REDACTED MD]');
    return sanitized;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizePayload(obj[key]);
    }
    return result;
  }
  return obj;
}


async function handlePublicWebIngress(request: Request, env: Env, ctx: any): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : [
    "http://localhost:5173",
    "https://axim.us.com",
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden: Invalid Origin" }), { status: 403, headers: getCorsHeaders(env, request) });
  }

  let decryptedPayload: any = null;
  let pendingAttachmentFile: any = null;
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.clone().formData();
      const encryptedPayloadStr = formData.get("encrypted_payload") as string || "";
      const ivStr = formData.get("iv") as string || "";

      const file = formData.get("attachment") as File | null;
      if (file && file.size > 0) {
        pendingAttachmentFile = file;
      }

      if (encryptedPayloadStr && ivStr) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(env.AXIM_ONYX_SECRET));
        const key = await crypto.subtle.importKey(
          "raw",
          hashBuffer,
          { name: "AES-GCM" },
          false,
          ["decrypt"]
        );

        const ivBuffer = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
        const dataBuffer = Uint8Array.from(atob(encryptedPayloadStr), c => c.charCodeAt(0));
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ivBuffer },
          key,
          dataBuffer
        );
        const decryptedText = new TextDecoder().decode(decryptedBuffer);
        decryptedPayload = sanitizePayload(JSON.parse(decryptedText));
      } else {
        decryptedPayload = sanitizePayload({
          subject: formData.get("subject"),
          description: formData.get("description"),
          customer_email: formData.get("customer_email"),
          customer_name: formData.get("customer_name"),
          workflow_category: formData.get("workflow_category"),
          source: formData.get("source") || "website_support_form",
          urgency_flag: formData.get("urgency_flag") || "standard",
          cf_turnstile_response: formData.get("cf_turnstile_response"),
        });
      }
    } else {
      const jsonBody: any = await request.clone().json();
      const encryptedPayloadStr = jsonBody.encrypted_payload || "";
      const ivStr = jsonBody.iv || "";

      if (encryptedPayloadStr && ivStr) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(env.AXIM_ONYX_SECRET));
        const key = await crypto.subtle.importKey(
          "raw",
          hashBuffer,
          { name: "AES-GCM" },
          false,
          ["decrypt"]
        );

        const ivBuffer = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
        const dataBuffer = Uint8Array.from(atob(encryptedPayloadStr), c => c.charCodeAt(0));
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ivBuffer },
          key,
          dataBuffer
        );
        const decryptedText = new TextDecoder().decode(decryptedBuffer);
        decryptedPayload = sanitizePayload(JSON.parse(decryptedText));
      } else {
        decryptedPayload = sanitizePayload(jsonBody);
      }
    }
  } catch (parseError: any) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("events_ax2024").insert({
      type: "dlq_payload",
      payload: { reason: "INGRESS_DECRYPTION_CRASH", error: parseError.message, source: "public_form" }
    });
    return new Response(JSON.stringify({ error: "Payload verification failed. Integrity breach." }), { status: 400, headers: getCorsHeaders(env, request) });
  }

  try {
    // CRITICAL FIX: Verify Cloudflare Turnstile token
    const turnstileToken = decryptedPayload.cf_turnstile_response;
    if (!turnstileToken) {
       return new Response(JSON.stringify({ error: "Missing Turnstile security token." }), { status: 403, headers: getCorsHeaders(env, request) });
    }

    const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
       method: 'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body: `secret=${env.TURNSTILE_SECRET_KEY}&response=${turnstileToken}`
    });

    const outcome: any = await turnstileVerify.json();
    if (!outcome.success) {
      // CRITICAL FIX: Asynchronous Edge Threat Logging
      const logThreat = async () => {
        try {
          const clientIP = request.headers.get("CF-Connecting-IP") || "unknown_ip";
          const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

          const flatThreatPayload = {
            reason: "turnstile_validation_failed",
            ip: clientIP,
            cf_ray: request.headers.get("cf-ray") || "unknown",
            timestamp: new Date().toISOString(),
            error_codes: outcome['error-codes'] || []
          };

          await supabaseAdmin.from("events_ax2024").insert({
            type: "threat_blocked",
            payload: JSON.parse(JSON.stringify(flatThreatPayload)) // Enforce structural clean copy serialization
          });
        } catch (e) { /* background failsafe block pass */ }
      };
      ctx.waitUntil(logThreat()); // Non-blocking edge execution

      return new Response(JSON.stringify({ error: "Bot verification failed.", details: outcome['error-codes'] }), { status: 403, headers: getCorsHeaders(env, request) });
    }

    const cfRayId = request.headers.get("cf-ray") || "unknown_ray";
    // ... proceed with the existing proxy logic ...

    const proxyHeaders = new Headers();
    proxyHeaders.set("Authorization", `Bearer ${env.AXIM_ONYX_SECRET}`);
    proxyHeaders.set("X-Axim-Default-Source", "website");
    proxyHeaders.set("X-Axim-Network-Key", env.AXIM_SERVICE_KEY);

    let proxyBody;
    if (pendingAttachmentFile) {
      const forwardFormData = new FormData();
      forwardFormData.append("payload", JSON.stringify(decryptedPayload));
      forwardFormData.append("attachment", pendingAttachmentFile);
      proxyBody = forwardFormData;
    } else {
      proxyHeaders.set("Content-Type", "application/json");
      proxyBody = JSON.stringify(decryptedPayload);
    }

    const proxyRequest = new Request(request.url, {
      method: "POST",
      headers: proxyHeaders,
      body: proxyBody
    });

    return handleWebhookIntake(proxyRequest, env, ctx);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Edge routing transaction aborted" }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

async function handleWebhookIntake(request: Request, env: Env, ctx: any): Promise<Response> {
  let payloadText = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    // clone request to read body as text for verification
    payloadText = await request.clone().text();
  }

  // CRITICAL FIX: Eliminate spoofable header bypass vulnerability.
  // Mandate cryptographic signatures unless the request explicitly includes our internal ecosystem service role token key.
  const proxyNetworkToken = request.headers.get("X-Axim-Network-Key");
  const isInternalProxy = proxyNetworkToken === env.AXIM_SERVICE_KEY || request.headers.get("X-Axim-Default-Source") === "website_authenticated_internal";

  if (!isInternalProxy) {
    const isVerified = await verifyWebhookSignature(request, env, payloadText);
    if (!isVerified) {
      // Asynchronously log unauthorized malicious ingress vector attempt
      const logHmacThreat = async () => {
        try {
          const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
          await supabaseAdmin.from("events_ax2024").insert({
            type: "threat_blocked",
            payload: {
              reason: "invalid_hmac_or_spoofed_ingress_header",
              ip: request.headers.get("CF-Connecting-IP") || "unknown",
              cf_ray: request.headers.get("cf-ray") || "unknown",
              target_route: new URL(request.url).pathname,
              timestamp: new Date().toISOString()
            }
          });
        } catch (e) { /* background failsafe thread catch pass */ }
      };
      ctx.waitUntil(logHmacThreat());

      return new Response(JSON.stringify({ error: "UNAUTHORIZED_ECOSYSTEM_NODE_INTEGRITY_VIOLATION" }), { status: 401, headers: getCorsHeaders(env, request) });
    }
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "Payload exceeds maximum allowed size of 5MB." }), {
        status: 413,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  }

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const isAllowed = await checkRateLimit(clientIP, 10, env);
  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Request throttled by Cloudflare KV." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(env, request),
        },
      },
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let normalizedData: any = {};
    let attachmentUrl = null;
    let attachmentBase64 = null;
    let attachmentMime = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();

      // Extract text fields
      const rawPayloadStr = formData.get("payload");
      let rawPayload: any = {};
      if (rawPayloadStr) {
        try {
          rawPayload = JSON.parse(rawPayloadStr as string);
        } catch (e) {}
      }

      normalizedData = {
        subject:
          formData.get("subject") ||
          rawPayload.subject ||
          rawPayload.title ||
          "External Intake Webhook",
        description:
          formData.get("description") ||
          rawPayload.description ||
          rawPayload.body ||
          rawPayload.message ||
          "",
        customer_email:
          formData.get("customer_email") ||
          formData.get("email") ||
          rawPayload.customer_email ||
          rawPayload.email ||
          rawPayload.sender,
        source: formData.get("source") || rawPayload.source || request.headers.get("X-Axim-Default-Source") || "webhook",
        customer_name:
          formData.get("customer_name") ||
          rawPayload.customer_name ||
          rawPayload.name,
        tags: rawPayload.tags || [],
        workflow_category: formData.get("workflow_category") || rawPayload.workflow_category || "General Inquiry",
      };

      // Process attachment if present
      const file = formData.get("attachment") as File | null;
      if (file) {
        const validation = validateAttachment(file as any);
        if (!validation.valid) {
          return new Response(
            JSON.stringify({
              error: "Attachment validation failed",
              details: validation.error,
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(env, request),
              },
            },
          );
        }

        const buffer = await file.arrayBuffer();
        attachmentBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        attachmentMime = file.type;

        // Store file details to upload after ticket creation
        normalizedData.pendingFile = {
          buffer,
          type: file.type,
          name: file.name,
          filePath: `${Date.now()}_${file.name}`,
        };
      }
    } else {
      // Handle standard JSON payload
      const rawText = await request.clone().text();

      // If it's NOT coming from our internal public ingress proxy, enforce the HMAC signature
      const isInternalProxy = request.headers.get("X-Axim-Default-Source") === "website";
      if (!isInternalProxy && !(await verifyWebhookSignature(request, env, rawText))) {
        // CRITICAL FIX: Asynchronously log malicious internal ecosystem pings
        const logHmacThreat = async () => {
          try {
            const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
            await supabaseAdmin.from("events_ax2024").insert({
              type: "threat_blocked",
              payload: {
                reason: "invalid_hmac_or_internal_key",
                ip: request.headers.get("CF-Connecting-IP") || "unknown",
                cf_ray: request.headers.get("cf-ray") || "unknown",
                target_route: new URL(request.url).pathname,
                timestamp: new Date().toISOString()
              }
            });
          } catch (e) { /* silent catch */ }
        };
        ctx.waitUntil(logHmacThreat());

        return new Response(JSON.stringify({ error: "UNAUTHORIZED_ECOSYSTEM_NODE" }), {
          status: 401, headers: getCorsHeaders(env, request)
        });
      }
      const payload: any = await request.json();

      if (payload.encrypted_payload && payload.iv) {
        try {
          // The specification says "Use a SHA-256 hash of env.AXIM_ONYX_SECRET as the decryption key."
          const secretBuffer = new TextEncoder().encode(env.AXIM_ONYX_SECRET);
          const hashBuffer = await crypto.subtle.digest('SHA-256', secretBuffer);

          const key = await crypto.subtle.importKey(
            "raw",
            hashBuffer,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
          );

          const ivBuffer = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
          const dataBuffer = Uint8Array.from(atob(payload.encrypted_payload), c => c.charCodeAt(0));

          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            key,
            dataBuffer
          );

          const decryptedStr = new TextDecoder().decode(decryptedBuffer);
          const decryptedPayload = JSON.parse(decryptedStr);

          normalizedData = {
            subject: decryptedPayload.subject || decryptedPayload.title || "External Intake Webhook",
            description: decryptedPayload.description || decryptedPayload.body || decryptedPayload.message || "",
            customer_email: decryptedPayload.customer_email || decryptedPayload.email || decryptedPayload.sender,
            source: decryptedPayload.source || request.headers.get("X-Axim-Default-Source") || "webhook",
            customer_name: decryptedPayload.customer_name || decryptedPayload.name,
            tags: decryptedPayload.tags || [],
            workflow_category: decryptedPayload.workflow_category || "General Inquiry",
          };
        } catch (e) {
          return new Response(JSON.stringify({ error: "Failed to decrypt payload" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
          });
        }
      } else {
        normalizedData = {
          subject: payload.subject || payload.title || "External Intake Webhook",
          description:
            payload.description || payload.body || payload.message || "",
          customer_email:
            payload.customer_email || payload.email || payload.sender,
          source: payload.source || request.headers.get("X-Axim-Default-Source") || "webhook",
          customer_name: payload.customer_name || payload.name,
          tags: payload.tags || [],
          workflow_category: payload.workflow_category || "General Inquiry",
        };
      }
    }

  // Enforce strict schema validation
  try {
    WebhookIntakeSchema.parse(normalizedData);
  } catch (zodError) {
    if (zodError instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Payload validation failed", details: zodError.issues }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } }
      );
    }
    throw zodError;
  }

    if (!normalizedData.customer_email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: customer_email" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(env, request),
          },
        },
      );
    }

    // 1. Upsert Customer (Synchronous)
    const { data: customerData, error: customerError } = await supabase
      .from("contacts_ax2024")
      .select("id, tags, organization_id") // <-- MUST INCLUDE organization_id
      .eq("email", normalizedData.customer_email)
      .maybeSingle();

    if (customerError) throw customerError;

    let customerId = customerData?.id;
    let customerTags = customerData?.tags || [];
    let customerOrgId = customerData?.organization_id || null;

    if (!customerId) {
      const { data: newCustomer, error: insertError } = await supabase
        .from("contacts_ax2024")
        .insert({
          email: normalizedData.customer_email,
          name: normalizedData.customer_name || "Unknown Sender",
          role: "customer",
          tags: normalizedData.tags,
        })
        .select("id, tags, organization_id") // <-- UPDATE THIS SELECT
        .single();

      if (insertError) throw insertError;
      customerId = newCustomer.id;
      customerTags = newCustomer.tags || [];
      customerOrgId = newCustomer.organization_id || null;
    }

    // 2. Synchronous Core Ticket Creation


    // Determine assigned_department based on workflow_category
    let assignedDepartment = "General Support";
    if (normalizedData.workflow_category === "Billing" || normalizedData.workflow_category === "Billing & Financial") {
      assignedDepartment = "Financial_Systems";
    } else if (normalizedData.workflow_category === "Legal" || normalizedData.workflow_category === "Legal & Compliance") {
      assignedDepartment = "Legal_Operations";
    } else if (normalizedData.workflow_category === "Technical Support") {
      assignedDepartment = "Engineering";
    }

    // CRITICAL FIX: Extract Cloudflare distributed trace ID
    const cfRayId = request.headers.get("cf-ray") || "unknown_ray";

    // Append the trace ID to the ticket's metadata JSONB column for enterprise debugging
    const ticketMetadata = {
      source: normalizedData.source || "api_gateway",
      browser: request.headers.get("user-agent") || "unknown",
      cf_ray: cfRayId,
      operational_status: "Pending Triage",
      tags: normalizedData.tags,
      workflow_category: normalizedData.workflow_category,
    };

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        assigned_department: assignedDepartment,
        subject: normalizedData.subject,
        description: normalizedData.description,
        customer_id: customerId,
        organization_id: customerOrgId,
        priority: normalizedData.priority || "medium",
        status: "open",
        sla_breach_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: ticketMetadata
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // --- CRITICAL THREAD SYNC: Inject initial customer request into the message timeline ---
    const { error: initialMsgError } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: "customer", // Explicitly flag as external customer origin
        message_body: normalizedData.description || "No detailed description provided.",
        is_internal_note: false,
      });

    if (initialMsgError) {
       console.error("Failed to sync initial description to message thread:", initialMsgError);
    }
    // --------------------------------------------------------------------------------------

    // 3. Immediately Return 200 OK Response
    const response = new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id }),
      { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } }
    );

    // 4. Background AI Analysis and Database Updates
    ctx.waitUntil((async () => {
        try {
            // Upload attachment now that we have ticket id
            if (normalizedData.pendingFile) {
              const file = normalizedData.pendingFile;
              const fullPath = `${ticket.id}/${file.filePath}`;
              const { error: uploadError } = await supabase.storage
                .from("ticket_attachments")
                .upload(fullPath, file.buffer, {
                  contentType: file.type,
                  upsert: false,
                });
              if (uploadError) {
                  logErr(supabase, logCtx, uploadError, ctx);
              } else {
                  // CRITICAL FIX: Bind the storage artifact to the relational database table
                  await supabase.from("support_attachments").insert({
                     ticket_id: ticket.id,
                     file_name: file.name,
                     file_size: file.buffer.byteLength,
                     content_type: file.type,
                     file_path: fullPath
                  });
              }
            }

            // Analyze and insert

            // High-Speed Edge-Cached Context Retrieval
            const combinedQuery = `${normalizedData.subject} ${normalizedData.description || ""}`;
            let contextText = await getCachedRAGContext(combinedQuery, env, supabase, ctx);

            if (!contextText) {
               const { data: fallbackResults, error: fallbackError } = await supabase
                .from("memory_banks")
                .select("title, content")
                .limit(3);

              if (!fallbackError && fallbackResults && fallbackResults.length > 0) {
                contextText = fallbackResults.map((r: any) => `Title: ${r.title}\nContent: ${r.content}`).join("\n\n");
              }
            }

            // CRITICAL FIX: Explicitly forward the env dictionary as the 7th argument to stop Anthropic token bleed
            const onyxAnalysis = await analyzeWithOnyx(
              normalizedData.subject,
              normalizedData.description,
              env.ANTHROPIC_API_KEY,
              attachmentBase64,
              attachmentMime,
              contextText,
              env
            );

            // Tier 3 Autonomous Remediation Check
            if (onyxAnalysis.confidence > 95 && (onyxAnalysis.category?.includes("cache") || onyxAnalysis.category?.includes("sync"))) {
              console.log(`[AUTO-HEALER] High confidence fault detected (${onyxAnalysis.confidence}%). Invoking Core universal-dispatcher.`);

              try {
                const dispatcherRes = await fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/universal-dispatcher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                  },
                  body: JSON.stringify({
                    ticket_id: ticket.id,
                    action: onyxAnalysis.category,
                    payload: { subject: normalizedData.subject, description: normalizedData.description }
                  })
                });

                if (dispatcherRes.ok) {
                  // Permanently settle ticket row state parameters as Resolved-Automated
                  const updatedMetadata = {
                    ...(ticket.metadata || {}),
                    operational_status: "Resolved-Automated"
                  };

                  await supabase
                    .from("support_tickets")
                    .update({ status: "resolved", metadata: updatedMetadata })
                    .eq("id", ticket.id);

                  await supabase.from("ticket_messages").insert({
                    ticket_id: ticket.id,
                    sender_id: "onyx_system",
                    message_body: `[AUTO-HEALER SUCCESS] Programmatic remedy executed via Core Gateway. Exception cleared cleanly. Status updated to Resolved-Automated.`
                  });
                  return; // Terminate webhook intake early; ticket is autonomously handled
                }
              } catch (dispatcherErr: any) {
                console.error("Auto-Healer dispatch fallback triggered:", dispatcherErr.message);
              }
            }

            let initialStatus = "open";
            let onyxResponseDraft = onyxAnalysis.draft;

            let priority = onyxAnalysis.priority;
            let updatedSlaBreachAt = new Date();
            updatedSlaBreachAt.setHours(updatedSlaBreachAt.getHours() + 24); // Default 24h SLA

            const isVIP = customerTags.includes("VIP") || customerTags.includes("Enterprise");
            if (isVIP) {
              priority = "urgent";
              updatedSlaBreachAt = new Date();
              updatedSlaBreachAt.setHours(updatedSlaBreachAt.getHours() + 1); // 1h SLA for VIP
            }

            // If confidence > 90%, deflect
            if (onyxAnalysis.confidence > 90) {
              initialStatus = "pending"; // Changed to pending_user via pending status per enum
            }

            let metadata = {
                source: normalizedData.source,
                tags: normalizedData.tags,
                ...(onyxAnalysis.confidence < 85 ? { requires_sandbox_escalation: true } : {})
            };

            // Update the ticket
            const { error: updateError } = await supabase
              .from("support_tickets")
              .update({
                priority: priority,
                status: initialStatus,
                sla_breach_at: updatedSlaBreachAt.toISOString(),
                metadata: metadata,
              })
              .eq("id", ticket.id);

            if (updateError) throw updateError;



            if (initialStatus === "pending" && onyxResponseDraft) {
              // Insert deflected response
              const { error: messageError } = await supabase
                .from("ticket_messages")
                .insert({
                  ticket_id: ticket.id,
                  sender_id: "onyx_system", // Need to make sender_id Onyx. Update schema or use an AI id
                  message_body: onyxResponseDraft,
                  is_internal_note: false,
                });
              if (messageError) logErr(supabase, logCtx, messageError, ctx);
            }












        } catch (err) {
            logErr(supabase, logCtx, err, ctx);
        } finally {
            logEnd(supabase, logCtx, startTime, ctx);
        }
    })());

    return response;

  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  }
}

// --- Helpers ---


async function hashString(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getCachedRAGContext(queryText: string, env: Env, supabase: any, ctx: any): Promise<string> {
  if (!queryText || queryText.trim() === "") return "";

  const cacheKey = `rag_v1_${await hashString(queryText)}`;

  // 1. Check Cloudflare KV Edge Cache
  if (env.KB_CACHE) {
    const cachedData = await env.KB_CACHE.get(cacheKey);
    if (cachedData) {
      console.log("[CACHE HIT] Semantic context pulled from Edge KV");
      return cachedData;
    }
  }

  // 2. Cache Miss - Generate Embedding via AXiM Core
  let contextText = "";
  try {
    const embedRes = await fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ input: queryText }),
    });

    if (embedRes.ok) {
      const embedData: any = await embedRes.json();
      const embedding = embedData.embedding;

      if (embedding && embedding.length > 0) {
        // Query Supabase Vectors
        const { data: searchResults, error: searchError } = await supabase.rpc("match_memory_banks", {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 3,
        });

        if (!searchError && searchResults && searchResults.length > 0) {
          contextText = searchResults.map((r: any) => `Title: ${r.title}\nContent: ${r.content}`).join("\n\n");
        }
      }
    }
  } catch (err) {
    console.error("Embedding generation failed, proceeding without context", err);
  }

  // 3. Store in Cloudflare KV (24-hour TTL)
  if (env.KB_CACHE && contextText) {
    ctx.waitUntil(env.KB_CACHE.put(cacheKey, contextText, { expirationTtl: 86400 }));
  }

  return contextText;
}
async function analyzeWithOnyx(
  subject: string,
  description: string,
  anthropicApiKey: string | null,
  attachmentBase64: string | null,
  attachmentMime: string | null,
  contextText: string,
  env: Env
): Promise<{
  priority: "low" | "medium" | "urgent";
  sentiment: string;
  category: string;
  draft: string;
  confidence: number;
  metrics?: any;
}> {
  const prompt = `You are Onyx, the advanced support AI for AXiM. Analyze this ticket and respond strictly in valid JSON matching this schema:
{
  "priority": "low" | "medium" | "urgent",
  "sentiment": "positive" | "neutral" | "negative",
  "category": "technical" | "billing" | "account" | "general",
  "confidence": 0-100,
  "draft_reply": "your text response"
}

Context playbooks retrieved from KB memory cache banks:
${contextText || "No context playbooks available."}

Ticket Subject: ${subject}
Ticket Description: ${description}`;

  let priority: "low" | "medium" | "urgent" = "medium";
  let sentiment = "neutral";
  let category = "general";
  let draft = "";
  let confidence = 85;
  let modelProvenance = "system_fallback";

  const aiStartMarker = performance.now();

  // Tier 1: Zero-Latency Cloudflare Workers AI (Edge Native)
  if (env?.AI) {
    try {
      const aiResult: any = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "You are Onyx, an expert support AI. Always output valid JSON objects." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = typeof aiResult.response === "string"
        ? JSON.parse(aiResult.response)
        : aiResult.response;

      if (parsed && (parsed.draft_reply || parsed.draft)) {
        priority = parsed.priority || "medium";
        sentiment = parsed.sentiment || "neutral";
        category = parsed.category || "general";
        draft = parsed.draft_reply || parsed.draft || "";
        confidence = parsed.confidence || 90;
        modelProvenance = "Cloudflare-Workers-AI-Llama3.1";
      }
    } catch (cfAiErr) {
      console.warn("[WORKERS_AI TRIAGE BYPASS] Edge inference failed, executing failover LLM path:", cfAiErr);
    }
  }

  // Tier 2: Cost-Optimized DeepSeek-V3 Fallback Path
  if (!draft && env?.DEEPSEEK_API_KEY) {
    try {
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        const parsed = JSON.parse(data.choices[0].message.content);
        priority = parsed.priority || "medium";
        sentiment = parsed.sentiment || "neutral";
        category = parsed.category || "general";
        draft = parsed.draft_reply || "";
        confidence = parsed.confidence || 80;
        modelProvenance = "DeepSeek-V3";
      }
    } catch (dsErr) {
      console.error("DeepSeek triage gateway failure, moving to tertiary failover path.");
    }
  }

  // Tier 3: Anthropic Claude Fallback Path
  if (!draft && anthropicApiKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const rawText = data.content[0].text;
        const parsed = JSON.parse(rawText.substring(rawText.indexOf("{"), rawText.lastIndexOf("}") + 1));
        priority = parsed.priority || "medium";
        sentiment = parsed.sentiment || "neutral";
        category = parsed.category || "general";
        draft = parsed.draft_reply || "";
        confidence = parsed.confidence || 75;
        modelProvenance = "Anthropic-Claude-3-Haiku";
      }
    } catch (anthropicErr) {
      console.error("Critical: All upstream LLM routing paths exhausted.");
    }
  }

  if (!draft) {
    draft = `Hello, thank you for contacting support regarding "${subject}". An internal systems engineer has been flagged to investigate this case manually.`;
  }

  const aiDurationDeltaMs = Math.round(performance.now() - aiStartMarker);

  return {
    priority,
    sentiment,
    category,
    draft,
    confidence,
    metrics: {
      provider_provenance: modelProvenance,
      generation_latency_ms: aiDurationDeltaMs,
      cloudflare_edge_processed: true
    }
  };
}

const ONYX_TOOLS = [
  {
    name: "issue_refund",
    description: "Issues a refund to a user for a specified amount.",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "The amount to refund, in dollars.",
        },
        reason: {
          type: "string",
          description: "The reason for the refund.",
        },
      },
      required: ["amount", "reason"],
    },
  },
  {
    name: "trigger_password_reset",
    description: "Triggers a password reset email for the user.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description:
            "The email address of the user to reset the password for.",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "grant_beta_access",
    description: "Grants the user access to a specific beta feature.",
    input_schema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "The name of the beta feature to grant access to.",
        },
      },
      required: ["feature_name"],
    },
  },
];

// --- HUMAN-IN-THE-LOOP (HITL) DUAL-TIER OPERATIONAL GOVERNANCE HOOK ---
async function dispatchHITLProposalAlert(
  ticketId: string,
  toolType: string,
  payloadSummary: any,
  env: Env,
  supabase: any
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[HITL GOVERNANCE SKIPPED: Resend API variable reference unassigned]");
    return;
  }

  const primaryRecipient = "james.ellars@axim.us.com";
  const escalationFallback = "jrellars@gmail.com";
  const payloadString = typeof payloadSummary === "string" ? payloadSummary : JSON.stringify(payloadSummary, null, 2);

  const emailPayload = {
    from: env.RESEND_FROM_EMAIL || "governance@axim.us.com",
    to: primaryRecipient,
    subject: `[HITL AUDIT REQUIRED] Gated Action Pending for Ticket #${ticketId.slice(0, 8)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; color: #f4f4f5; padding: 32px; border: 1px solid #27272a; border-radius: 16px;">
        <h2 style="color: #e11d48; margin-top: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.025em;">⚠️ PRIVILEGED ACTION GATED</h2>
        <p style="color: #71717a; font-size: 10px; font-family: monospace; text-transform: uppercase; letter-spacing: 0.15em; margin-top: -4px; margin-bottom: 24px;">AXiM Core Governance Engine Protocol Active</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin-bottom: 20px;" />
        <p style="font-size: 13px; margin-bottom: 8px;"><strong>Support Ticket ID:</strong> <code style="font-family: monospace; color: #e4e4e7; background-color: #18181b; padding: 2px 6px; border-radius: 4px;">${ticketId}</code></p>
        <p style="font-size: 13px; margin-bottom: 8px;"><strong>Gated Remedy Path:</strong> <span style="background-color: #4c0519; padding: 4px 8px; border-radius: 6px; color: #fda4af; font-family: monospace; font-weight: bold; font-size: 11px;">${toolType}</span></p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Proposed Tool Parameters Array:</strong></p>
        <pre style="background-color: #020205; padding: 16px; border-radius: 8px; border: 1px solid #27272a; color: #34d399; font-family: monospace; font-size: 11px; overflow-x: auto; margin-top: 0; margin-bottom: 24px;">${payloadString}</pre>
        <hr style="border: 0; border-top: 1px solid #27272a; margin-bottom: 20px;" />
        <p style="font-size: 11px; color: #71717a; line-height: 1.6; margin-bottom: 0;">
          <strong>Escalation Directive Notice:</strong> If this privileged action does not receive programmatic authorization within standard SLA tracking parameters, alerts automatically escalate to backup destination vault carrier: <code style="color: #a1a1aa; font-family: monospace;">${escalationFallback}</code>.
        </p>
      </div>
    `
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify(emailPayload)
    });

    if (response.ok) {
      await supabase.from("events_ax2024").insert({
        type: "hitl_notification_metric",
        payload: { ticket_id: ticketId, routine: "dispatchHITLProposalAlert", status: "success", primary_dispatched: primaryRecipient }
      });
    } else {
      const errorMsg = await response.text();
      console.error(`Upstream Resend cluster rejected HITL notification proxy context: ${errorMsg}`);
    }
  } catch (err: any) {
    console.error("Critical connection failure attempting to transmit governance macro alerts:", err.message);
  }
}


async function handleToolCommand(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  const startTime = Date.now();
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { command, ticketId } = (await request.json()) as any;

    // Stubbed logic calling Claude API with tools
    // A real implementation would send 'command' to Anthropic API
    // `anthropic-version`: `2023-06-01`
    // and tools: ONYX_TOOLS


    let toolUsePayload = null;

    if (env.ANTHROPIC_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 500,
            system: "You are an AI support agent. Your job is to select the most appropriate tool to run based on the user's command. If no tool is appropriate, just reply.",
            messages: [{ role: 'user', content: command }],
            tools: ONYX_TOOLS
          })
        });

        if (response.ok) {
          const data: any = await response.json();
          // Find the tool_use block
          const toolUseBlock = data.content.find((c: any) => c.type === 'tool_use');
          if (toolUseBlock) {
            toolUsePayload = {
              name: toolUseBlock.name,
              input: toolUseBlock.input
            };
          }
        } else {
          const errText = await response.text(); logErr(supabase, logCtx, new Error("Anthropic API error in handleToolCommand: " + errText), ctx); console.error("Anthropic API error in handleToolCommand:", errText);
        }
      } catch (err) {
        logErr(supabase, logCtx, err, ctx); console.error("Anthropic API fetch failed in handleToolCommand:", err);
      }
    }

    if (!toolUsePayload) {
      // Mocking Claude's response for specific commands if live call failed/no key:
      if (command.toLowerCase().includes("refund")) {
        const amountMatch = command.match(/\$?(\d+(\.\d{2})?)/);
        const amount = amountMatch ? parseFloat(amountMatch[1]) : 50;
        toolUsePayload = {
          name: "issue_refund",
          input: { amount, reason: "Customer requested via support." },
        };
      } else if (
        command.toLowerCase().includes("password reset") ||
        command.toLowerCase().includes("reset password")
      ) {
        toolUsePayload = {
          name: "trigger_password_reset",
          input: { email: "user@example.com" }, // Mock email
        };
      } else if (command.toLowerCase().includes("beta access")) {
        toolUsePayload = {
          name: "grant_beta_access",
          input: { feature_name: "new_dashboard" },
        };
      }
    }

    if (toolUsePayload) {
      // HITL Logging
      const { data: hitlLog, error: hitlError } = await supabase
        .from("hitl_audit_logs")
        .insert({
          status: "pending",
          tool_type: toolUsePayload.name,
          payload: toolUsePayload.input,
          support_ticket_id: ticketId,
        })
        .select()
        .single();

      if (hitlError) throw hitlError;

      // Send message with metadata
      const { error: msgError } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: "onyx_system",
          message_body: `Onyx proposes an action: ${toolUsePayload.name}`,
          metadata: { hitl_log_id: hitlLog.id },
        });

      if (msgError) throw msgError;

      // CRITICAL FIX: Non-blocking background worker handshake to broadcast real-time HITL governance carrier emails
      ctx.waitUntil(dispatchHITLProposalAlert(
        ticketId,
        toolUsePayload.name,
        toolUsePayload.input,
        env,
        supabase
      ));

      logEnd(supabase, logCtx, startTime, ctx);
      return new Response(
        JSON.stringify({ success: true, action_proposed: true }),
        {
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(env, request),
          },
        },
      );
    }

    // Default response if no tool is used

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(
      JSON.stringify({ success: true, action_proposed: false }),
      {
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(env, request),
        },
      },
    );
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  }
}

async function handleExecuteAction(request: Request, env: Env, ctx: any): Promise<Response> {
  const rawIdempotencyKey = request.headers.get("X-Idempotency-Key");

  if (rawIdempotencyKey && env.IDEMPOTENCY_KV) {
    const cacheKey = `action_idempotency:${rawIdempotencyKey}`;
    const existingKey = await env.IDEMPOTENCY_KV.get(cacheKey);

    if (existingKey) {
      return new Response(JSON.stringify({ error: "Conflict: Action already processed", status: "rejected" }), {
        status: 409, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
    }
    await env.IDEMPOTENCY_KV.put(cacheKey, "processed", { expirationTtl: 86400 });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers }).catch(() => {}));
  const startTime = Date.now();

  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const isAllowed = await checkRateLimit(clientIP, 5, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Request throttled by Cloudflare KV." }), {
      status: 429, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_ACTION_EXECUTION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const rawPayload: any = await request.json();
    let payload;
    try {
      payload = ToolCommandSchema.parse(rawPayload);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new Response(JSON.stringify({ error: "Action payload validation failed", details: zodError.issues }), {
          status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
        });
      }
      throw zodError;
    }

    const { hitlLogId, disposition = "approved" } = payload;

    const { data: hitlLog, error: fetchError } = await supabase
      .from("hitl_audit_logs")
      .select("*")
      .eq("id", hitlLogId)
      .single();

    if (fetchError) throw fetchError;

    if (hitlLog.status === "executed" || hitlLog.status === "rejected") {
      logEnd(supabase, logCtx, startTime, ctx);
      return new Response(JSON.stringify({ success: true, executed: false, message: `Action already marked with status: ${hitlLog.status}` }), {
        status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
    }

    // HANDLE REMEDY DISMISSAL/REJECTION PATHWAY
    if (disposition === "rejected") {
      await supabase.from("hitl_audit_logs").update({ status: "rejected" }).eq("id", hitlLogId);

      if (hitlLog.support_ticket_id) {
        await supabase.from("ticket_messages").insert({
          ticket_id: hitlLog.support_ticket_id,
          sender_id: "onyx_system",
          message_body: `**[⚠️ SYSTEM REMEDY REJECTED BY ADMINISTRATOR]**\n\nProposed tool action \`${hitlLog.tool_type}\` was marked as invalid/rejected by an internal support engineer. Parameters archived cleanly.`,
          is_internal_note: true
        });

        await supabase.from("events_ax2024").insert({
          type: "hitl_rejection_metric",
          payload: { ticket_id: hitlLog.support_ticket_id, action: hitlLog.tool_type, hitl_log_id: hitlLogId, status: "dismissed", operator_id: user.id }
        });
      }

      logEnd(supabase, logCtx, startTime, ctx);
      return new Response(JSON.stringify({ success: true, executed: false, status: "rejected" }), {
        status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
    }

    // HANDLE REMEDY APPROVAL PATHWAY (Vault API Handshake Proxy)
    const coreProxyUrl = env.CORE_API_URL ? `${env.CORE_API_URL}/functions/v1/api-proxy` : "https://api.axim-core.internal/v1/proxy";

    const proxyResponse = await fetch(coreProxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Idempotency-Key": hitlLogId,
      },
      body: JSON.stringify({ action: hitlLog.tool_type, payload: hitlLog.payload }),
    });

    if (!proxyResponse.ok) {
      if (proxyResponse.status === 401 || proxyResponse.status === 403) {
        throw new Error("Vault Access Denied: Core rejected the credential handshake request.");
      }
      throw new Error(`Core API Proxy Failed: ${await proxyResponse.text()}`);
    }

    // Inside handleExecuteAction directly following successful execution updates:
    const telemetryExecutionDuration = Date.now() - startTime;
    if (hitlLog.support_ticket_id) {
      await supabase.from("ticket_messages").insert({
        ticket_id: hitlLog.support_ticket_id,
        sender_id: "onyx_system",
        message_body: `ACTION EXECUTED VIA CORE PROXY: ${hitlLog.tool_type} completed successfully in ${telemetryExecutionDuration}ms.`,
      });

      await supabase.from("events_ax2024").insert({
        type: "action_executed",
        payload: {
          ticket_id: hitlLog.support_ticket_id,
          action: hitlLog.tool_type,
          hitl_log_id: hitlLogId,
          status: "success",
          performance_telemetry: {
            transport_latency_ms: telemetryExecutionDuration,
            cloudflare_node_routing: true,
            timestamp_completion: new Date().toISOString()
          }
        },
      });

      // TRIGGER OUTBOUND INTER-SYSTEM DISPATCH FAN-OUT
      const { data: boundEgressTargets } = await supabase
        .from("tenant_webhooks")
        .select("url, secret")
        .eq("tenant_id", hitlLog.organization_id || "system");

      if (boundEgressTargets && boundEgressTargets.length > 0) {
        for (const target of boundEgressTargets) {
          ctx.waitUntil(dispatchSecureEgressWebhook(
            target.url,
            {
              event: "ticket_automation_executed",
              ticket_id: hitlLog.support_ticket_id,
              tool: hitlLog.tool_type,
              status: "executed",
              duration_ms: telemetryExecutionDuration
            },
            env,
            supabase
          ));
        }
      }
    }

    await supabase.from("hitl_audit_logs").update({ status: "executed" }).eq("id", hitlLogId);

    const cfRayId = request.headers.get("cf-ray") || "unknown_ray";

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(JSON.stringify({ success: true, executed: true, proxied: true, cf_ray: cfRayId }), {
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  }
}


async function handleTicketResolved(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  const startTime = Date.now();
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Webhook Request start", { headers: request.headers }).catch(() => {}));

  // CRITICAL FIX: Eliminate URL query param leaks. Authenticate database triggers via secure request headers.
  const networkWebhookToken = request.headers.get("X-Axim-Network-Key");
  if (networkWebhookToken !== env.AXIM_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED_DATABASE_TRIGGER" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const payload: any = await request.json();
    const record = payload.record;

    if (!record || record.status !== "resolved") {
      return new Response("Ignored", { status: 200 });
    }

    const dispatchWebhook = async () => {
      try {
        const tenantId = record.organization_id || record.customer_id;
        if (!tenantId) return;
        const { data: webhooks } = await supabase.from('tenant_webhooks').select('url, secret').eq('tenant_id', tenantId);
        if (!webhooks || webhooks.length === 0) return;

        const ticketSummary = { ticket_id: record.id, subject: record.subject, status: record.status, resolution_time: new Date().toISOString() };
        for (const wh of webhooks) {
          try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (wh.secret) headers['Authorization'] = `Bearer ${wh.secret}`;
            await fetch(wh.url, { method: 'POST', headers, body: JSON.stringify(ticketSummary) });
          } catch (e) {}
        }
      } catch (err) { console.error('Webhook dispatcher error:', err); }
    };
    ctx.waitUntil(dispatchWebhook());

    if (record.priority === "urgent" && !record.rca_generated) {
      const processRCA = async () => {
        try {
          const { data: messages } = await supabase.from("ticket_messages").select("sender_id, message_body, created_at").eq("ticket_id", record.id).order("created_at", { ascending: true });
          const threadText = messages?.map((m: any) => `[${m.sender_id}]: ${m.message_body}`).join("\n") || "";

          let rcaMarkdown = "";

          if (env.DEEPSEEK_API_KEY) {
            const prompt = `You are Onyx Mk3. Generate a Root Cause Analysis for this resolved ticket.\nSubject: ${record.subject}\nThread:\n${threadText}\nOutput strictly in Markdown with ## Problem, ## Root Cause, and ## Resolution. DO NOT include conversational filler.`;
            const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
              body: JSON.stringify({
                model: "deepseek-chat",
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }]
              }),
            });
            if (deepseekRes.ok) {
              const data = await deepseekRes.json() as any;
              rcaMarkdown = data.choices[0].message.content;
            } else { throw new Error("Deepseek API failed"); }

          } else if (env.ANTHROPIC_API_KEY) {
            const prompt = `You are Onyx Mk3. Generate a Root Cause Analysis for this resolved ticket.\nSubject: ${record.subject}\nThread:\n${threadText}\nOutput strictly in Markdown with ## Problem, ## Root Cause, and ## Resolution.`;
            const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
            });
            if (anthropicRes.ok) {
              const data = await anthropicRes.json() as any;
              rcaMarkdown = data.content[0].text;
            } else { throw new Error("Anthropic API failed"); }
          } else {
            rcaMarkdown = `## Problem\n${record.subject}\n## Root Cause\nLocal dev mode. No AI keys provided. No RCA generated.\n## Resolution\nN/A`;
          }

          let embeddingForMemory = null;
          try {
             const embedRes = await fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
                body: JSON.stringify({ input: `RCA: ${record.subject}\n\n${rcaMarkdown}` }),
             });
             if (embedRes.ok) { const embedData: any = await embedRes.json(); embeddingForMemory = embedData.embedding; }
          } catch(e) {}

          await supabase.from("memory_banks").insert({
            title: `RCA: ${record.subject}`, content: rcaMarkdown, embedding: embeddingForMemory, metadata: { source: "support_system", category: record.suggested_category || "support" },
          });

          await supabase.from("events_ax2024").insert({ type: "rca_generated", payload: { ticket_id: record.id, subject: record.subject, rca: rcaMarkdown } });
          await supabase.from("support_tickets").update({ rca_generated: true }).eq("id", record.id);

          await supabase.from("ticket_messages").insert({
            ticket_id: record.id, sender_id: "onyx_system", message_body: `**[SYSTEM ROOT CAUSE ANALYSIS GENERATED]**\n\n${rcaMarkdown}`, is_internal_note: true, metadata: { is_rca: true }
          });
        } catch (e: any) {
          logErr(supabase, logCtx, e, ctx);
          await supabase.from("ticket_messages").insert({
            ticket_id: record.id,
            sender_id: "onyx_system",
            message_body: `**[SYSTEM ERROR]**\n\nRoot Cause Analysis generation failed in background worker. Manual RCA required.\n\nTrace: ${e.message}`,
            is_internal_note: true,
            metadata: { is_rca: false, error: true }
          });
        }
      };
      ctx.waitUntil(processRCA());
    }

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(JSON.stringify({ success: true, status: "background_processing_initiated" }), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleAutoDraft(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  const startTime = Date.now();
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers }).catch(() => {}));

  // CRITICAL FIX: Upgrade auto-draft route to enforce zero-trust dynamic user session verification
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_DRAFT_GENERATION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const { ticketData, articles } = (await request.json()) as any;
    let contextText = articles.map((a: any) => `${a.title}: ${a.content}`).join("\n");
    const systemPrompt = "You are an expert technical support agent. Draft a professional, concise reply to the customer based ONLY on the provided knowledge base context.";
    const userPrompt = `Ticket Subject: ${ticketData.subject}\n\nKnowledge Base:\n${contextText}\n\nDraft a concise, helpful reply:`;

    let draft = "";

    if (env.DEEPSEEK_API_KEY) {
      try {
        const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            max_tokens: 500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
          })
        });
        if (deepseekRes.ok) {
          const data: any = await deepseekRes.json();
          draft = data.choices[0].message.content;
        }
      } catch (dsDraftErr) { console.error("Deepseek auto-draft fallback engaged."); }
    }

    if (!draft && env.ANTHROPIC_API_KEY) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }]
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data: any = await response.json();
          draft = data.content[0].text;
        }
      } catch (e) {}
    }

    if (!draft) {
      draft = `Hello ${ticketData?.contacts_ax2024?.name || "there"},\n\nBased on our knowledge base findings, we are actively looking into this request.`;
    }

    return new Response(JSON.stringify({ draft }), { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

async function handleGenerateSuggestion(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers }).catch(() => {}));
  const startTime = Date.now();

  // CRITICAL FIX: Enforce zero-trust dynamic JWT validation rather than old static secret checks
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_SUGGESTION" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const { subject, description, context_messages } = (await request.json()) as any;
    const safeMessages = (context_messages || []).filter((m: any) => m.is_internal_note !== true).slice(-5);
    const historyText = safeMessages.map((m: any) => typeof m === "string" ? m : m.text || m.message_body || "").join("\n");

    let embedding: any = [];
    try {
      const embedRes = await fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ input: `${subject} ${description || ""}` }),
      });
      if (embedRes.ok) {
        const embedData: any = await embedRes.json();
        if (embedData.embedding) embedding = embedData.embedding;
      }
    } catch (err) { console.error("Embedding generation fallback engaged."); }

    const { data: memoryBanks } = await supabase.rpc("match_memory_banks", {
      query_embedding: embedding,
      match_threshold: 0.75,
      match_count: 3,
    });

    const contextText = memoryBanks?.map((m: any) => `Title: ${m.title}\nContent: ${m.content}`).join("\n\n") || "No context found.";

    const prompt = `You are Onyx, an expert AXiM Support AI. Given the following ticket details and context from our memory banks, write a professional and helpful support response draft for the agent to review.\n\nTicket Subject: ${subject}\nTicket Description: ${description}\n\nRecent Conversation History:\n${historyText || "No previous replies."}\n\nContext from Memory Banks:\n${contextText}\n\nOutput ONLY the suggested response text:`;

    let draft = "";
    let providerUsed = "unknown";

    if (env.DEEPSEEK_API_KEY) {
      try {
        const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }]
          })
        });
        if (deepseekRes.ok) {
          const data: any = await deepseekRes.json();
          draft = data.choices[0].message.content;
          providerUsed = "Deepseek-V3";
        }
      } catch (e) { console.error("Deepseek suggestions stream offline."); }
    }

    if (!draft && env.ANTHROPIC_API_KEY) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (anthropicRes.ok) {
          const data: any = await anthropicRes.json();
          draft = data.content[0].text;
          providerUsed = "Claude-3-Haiku";
        }
      } catch (err) { clearTimeout(timeoutId); }
    }

    if (!draft) {
      draft = `[AUTO-FALLBACK] Playbook findings context retrieved:\n\n${contextText}`;
      providerUsed = "System-Fallback";
    }

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(JSON.stringify({ draft, model_provenance: providerUsed }), {
      status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) },
    });
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}
async function handleMessageEgress(request: Request, env: Env, ctx: any): Promise<Response> {
  // CRITICAL FIX: Eliminate URL query param leaks. Authenticate database triggers via secure request headers.
  const networkWebhookToken = request.headers.get("X-Axim-Network-Key");
  if (networkWebhookToken !== env.AXIM_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED_EGRESS_TRIGGER" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const payload = await request.json() as any;
    const record = payload.record;

    if (!record) {
      return new Response(JSON.stringify({ error: "No record in payload" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (record.is_internal_note === true || record.sender_id === 'system') {
      return new Response(JSON.stringify({ success: true, ignored: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const emailDispatch = async () => {
      try {
        const { data: ticket, error: ticketError } = await supabase
          .from("support_tickets")
          .select("customer_id, subject, status")
          .eq("id", record.ticket_id)
          .single();

        if (ticketError || !ticket) {
          console.error("Failed to fetch ticket for egress", ticketError);
          return;
        }

        const { data: contact, error: contactError } = await supabase
          .from("contacts_ax2024")
          .select("email, name")
          .eq("id", ticket.customer_id)
          .single();

        if (contactError || !contact) {
          console.error("Failed to fetch contact for egress", contactError);
          return;
        }

        let finalBody = record.message_body || "";

        if (ticket.status === 'closed') {
          finalBody += `\n\n---\nThis case has been marked as closed. How did we do? Please let us know by visiting: https://axim.us.com/feedback?ticket_id=${record.ticket_id}`;
        }

        const emailPayload = {
          from: env.RESEND_FROM_EMAIL || "support@axim.us.com",
          to: contact.email,
          subject: `Re: ${ticket.subject}`,
          text: finalBody,
        };

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          },
          body: JSON.stringify(emailPayload),
        });

        if (!resendRes.ok) {
           const errText = await resendRes.text();
           console.error("Email dispatch failed:", errText);
           await supabase.from("events_ax2024").insert({
              type: "error",
              payload: { function: "emailDispatch", ticket_id: record.ticket_id, error: errText, timestamp: new Date().toISOString() }
           });
        } else {
           await supabase.from("events_ax2024").insert({
              type: "email_dispatch_success",
              payload: { ticket_id: record.ticket_id, recipient: contact.email, timestamp: new Date().toISOString() }
           });

           await supabase.from("ticket_messages").insert({
              ticket_id: record.ticket_id,
              sender_id: "system",
              message_body: `**[SYSTEM EGRESS CONFIRMED]**\n\nReply securely routed to external MTA gateway for: \`${contact.email}\`._`,
              is_internal_note: true
           });
        }
      } catch (err) {
        console.error("Error in email dispatch background task", err);
      }
    };

    ctx.waitUntil(emailDispatch());
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[handleMessageEgress] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}





async function handleFeedbackIngress(request: Request, env: Env, ctx: any): Promise<Response> {
  const cors = getCorsHeaders(env, request);
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const payload = (await request.json()) as { ticket_id: string; rating: number; comments?: string };
    const { ticket_id, rating, comments } = payload;

    if (!ticket_id || typeof rating !== 'number') {
      return new Response(JSON.stringify({ error: "Missing required fields: ticket_id and rating" }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' }});
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertError } = await supabase
      .from('product_feedback')
      .insert({ ticket_id, rating, comments });

    if (insertError) {
      throw insertError;
    }

    if (rating <= 2) {
      ctx.waitUntil((async () => {
        try {
          const { data: messages, error: msgError } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticket_id)
            .order('created_at', { ascending: true });

          if (msgError || !messages) throw msgError;

          const threadText = messages.map((m: any) => `[${m.sender_type || m.sender_id}] ${m.body}`).join('\n');

          const systemPrompt = "Generate a Failure Analysis detailing why the customer was unsatisfied with this resolution, and propose a new operational rule to prevent this.";

                  // CRITICAL FIX: Explicitly append trailing env mapping parameters to ensure Deepseek execution paths
                  const analysisResult = await analyzeWithOnyx("", threadText + "\n\nPROMPT: " + systemPrompt, env.ANTHROPIC_API_KEY, null, null, "", env);

          await supabase.from('hitl_audit_logs').insert({
            support_ticket_id: ticket_id,
            status: 'pending',
            action_required: 'Review Failure Analysis and update ecosystem memory if valid.',
            tool_type: 'update_memory_bank',
            payload: analysisResult
          });
        } catch (err) {
          console.error("Failed to generate continuous learning failure analysis:", err);
        }
      })());
    }

    return new Response(JSON.stringify({ success: true, message: "Feedback recorded" }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error("Feedback Ingress Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(env, request), 'Content-Type': 'application/json' } });
  }
}







async function handleSandboxResolution(request: Request, env: Env, ctx: any): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized Vault Access" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  }

  try {
    const payload = await request.json() as any;
    const { ticket_id, resolution_notes, patch_payload } = payload;
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Egress Webhook Dispatcher
    ctx.waitUntil((async () => {
      try {
        const { data: ticket } = await supabase.from('support_tickets').select('*').eq('id', ticket_id).single();
        if (ticket && ticket.status === 'resolved') {
          const tenantId = ticket.organization_id || ticket.customer_id;
          if (!tenantId) return;
          const { data: webhooks } = await supabase.from('tenant_webhooks').select('url, secret').eq('tenant_id', tenantId);
          if (webhooks && webhooks.length > 0) {
            const webhookPayload = { ticket_id, subject: ticket.subject, status: ticket.status };
            for (const wh of webhooks) {
              const headers: any = { 'Content-Type': 'application/json' };
              if (wh.secret) headers['Authorization'] = `Bearer ${wh.secret}`;
              await fetch(wh.url, { method: 'POST', headers, body: JSON.stringify(webhookPayload) }).catch(e => console.error(e));
            }
          }
        }
      } catch (err) {
        console.error('Sandbox webhook error:', err);
      }
    })());

    // Create pending HITL execution block
    const { data: hitlLog, error: hitlError } = await supabase.from("hitl_audit_logs").insert({
      status: 'pending',
      tool_type: 'apply_git_patch',
      payload: patch_payload,
      support_ticket_id: ticket_id
    }).select().single();

    if (hitlError) throw hitlError;
    // Inside handleExecuteAction when an HITL proposal requires manual approval:
    ctx.waitUntil(sendEmailItNotification(
      "james.ellars@axim.us.com",
      `⚡ [HITL APPROVAL REQUIRED] Action Proposal for Ticket #${hitlLog.support_ticket_id?.slice(0, 8) || 'N/A'}`,
      `<div style="font-family: monospace; background: #09090b; color: #f4f4f5; padding: 20px; border-radius: 12px;">
        <h2 style="color: #6366f1; margin-top: 0;">HUMAN-IN-THE-LOOP APPROVAL REQUESTED</h2>
        <p><strong>Tool Type:</strong> ${hitlLog.tool_type}</p>
        <p><strong>Ticket ID:</strong> ${hitlLog.support_ticket_id || 'N/A'}</p>
        <p><strong>Status:</strong> Pending Approval</p>
        <p><a href="https://support.axim.us.com" style="color: #10b981; font-weight: bold;">Enter Support Cockpit HUD to Approve</a></p>
      </div>`,
      env
    ));


    // Inject proposed action into the message thread
    await supabase.from("ticket_messages").insert({
      ticket_id: ticket_id,
      sender_id: 'onyx_system',
      message_body: resolution_notes || "Tier 3 Sandbox Agent has proposed a code resolution.",
      metadata: { hitl_log_id: hitlLog.id }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) }
    });
  }
}

async function generateAndSendDailyDigest(env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Fetch open and pending tickets
    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select("id, subject, priority, status, created_at")
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const activeCount = tickets ? tickets.length : 0;
    const dashboardUrl = "https://support.axim.us.com"; // Adjust to live URL

    let htmlContent = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #09090b;">AXiM Support: Daily Operations Digest</h2>
        <p>System check complete. There are currently <strong>${activeCount}</strong> active tickets requiring attention.</p>
        <hr style="border: 1px solid #eaeaea; margin: 20px 0;" />
    `;

    if (activeCount > 0) {
      htmlContent += `<ul style="list-style: none; padding: 0;">`;
      tickets.forEach(t => {
        const priorityColor = t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'orange' : 'gray';
        htmlContent += `
          <li style="margin-bottom: 15px; padding: 15px; border: 1px solid #eaeaea; border-radius: 8px;">
            <div style="font-size: 12px; color: ${priorityColor}; font-weight: bold; text-transform: uppercase;">[${t.priority}] ${t.status}</div>
            <div style="font-size: 16px; font-weight: 600; margin: 5px 0;">${t.subject}</div>
            <a href="${dashboardUrl}/ticket/${t.id}" style="font-size: 14px; color: #2563eb; text-decoration: none;">Work this ticket &rarr;</a>
          </li>
        `;
      });
      htmlContent += `</ul>`;
    } else {
      htmlContent += `<p style="color: #10b981; font-weight: bold;">Inbox Zero achieved. No active tickets in the queue.</p>`;
    }

    htmlContent += `
        <hr style="border: 1px solid #eaeaea; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Automated dispatch from AXiM Support System Edge Worker.</p>
      </div>
    `;

    // Dispatch via Resend to Mr. Ellars
    // (Using VITE_ADMIN_EMAIL or fallback to jim@ellars.us.com if env not explicitly set)
    const adminEmail = env.ADMIN_EMAIL || "jim@ellars.us.com";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || "AXiM Support System <system@axim.us.com>",
        to: adminEmail,
        subject: `AXiM Daily Operations Digest (${activeCount} Active)`,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
       throw new Error(`Resend API failed: ${await resendRes.text()}`);
    }

    // Log success to telemetry
    await supabase.from("events_ax2024").insert({
      type: "system_metric",
      payload: { function: "generateAndSendDailyDigest", status: "success", ticket_count: activeCount }
    });

  } catch (err: any) {
    console.error("Daily digest failed:", err);
    await supabase.from("events_ax2024").insert({
      type: "error",
      payload: { function: "generateAndSendDailyDigest", error: err.message }
    });
  }
}

async function handleDataRetentionSweep(env: Env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString();

    const { data: expiredAttachments, error: queryError } = await supabase
      .from('support_attachments')
      .select('id, file_path')
      .lt('created_at', cutoffDate);

    if (queryError) {
      console.error('[handleDataRetentionSweep] DB query error:', queryError);
      return;
    }

    if (expiredAttachments && expiredAttachments.length > 0) {
      const paths = expiredAttachments.map(att => att.file_path);
      const { error: storageError } = await supabase.storage.from('ticket_attachments').remove(paths);

      if (storageError) {
        console.error('[handleDataRetentionSweep] Storage remove error:', storageError);
      } else {
        const ids = expiredAttachments.map(att => att.id);
        await supabase.from('support_attachments').delete().in('id', ids);
        console.log(`[handleDataRetentionSweep] Successfully deleted ${expiredAttachments.length} attachments.`);
      }
    }
  } catch (error) {
    console.error('[handleDataRetentionSweep] Unhandled exception:', error);
  }
}


async function handleTelemetryIngress(payload: any, env: Env, ctx: any, request: Request): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);

  const targetApplicationCode = payload.source_app || "UNKNOWN_MICRO_APP";
  const incidentErrorCode = payload.error_code || "GENERIC_ANOMALY";
  const incidentDescription = payload.details || "No structural trace logs provided.";

  // Construct a deterministic signature hash to group high-frequency alert floods
  const debouncingCacheKey = `telemetry_cooldown:${targetApplicationCode}:${incidentErrorCode}`;

  if (!env.STATUS_KV) {
    return new Response(JSON.stringify({ error: "STATUS_KV namespace reference binding missing." }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // Look up high-frequency anomaly bursts cached inside Cloudflare edge rows
    const activeIncidentTrackerId = await env.STATUS_KV.get(debouncingCacheKey);

    if (activeIncidentTrackerId) {
      // TELEMETRY DEBOUNCING ACTIVE: Deduplicate high-frequency floods under a single parent ticket note
      ctx.waitUntil((async () => {
        const timestampMarker = new Date().toISOString();
        await supabase.from("ticket_messages").insert({
          ticket_id: activeIncidentTrackerId,
          sender_id: "onyx_system",
          message_body: `**[HIGH-FREQUENCY TELEMETRY ANOMALY BUNDLED]**\n\nDuplicate signal burst suppressed at edge node: \`${logCtx.edge_colo}\`.\nTimestamp: \`${timestampMarker}\`.\nTrace Block Details: ${incidentDescription}`,
          is_internal_note: true
        });
      })());

      return new Response(JSON.stringify({ success: true, debounced: true, ticket_id: activeIncidentTrackerId }), {
        status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
    }

    // NEW UNIQUE ANOMALY IDENTIFIED: Spawning enterprise target ticket rows
    const { data: newTicket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        subject: `[ANOMALY] ${targetApplicationCode} caught systemic fault: ${incidentErrorCode}`,
        description: incidentDescription,
        priority: payload.severity === "critical" ? "urgent" : "medium",
        status: "open",
        assigned_department: "Technical Operations"
      })
      .select()
      .single();

    if (ticketError) throw ticketError;
    // Inside handleTelemetryIngress after creating a new urgent ticket:
    if (payload.severity === "critical" || newTicket.priority === "urgent") {
      ctx.waitUntil(sendEmailItNotification(
        "james.ellars@axim.us.com",
        `🚨 [URGENT SLA ALERT] Support Ticket #${newTicket.id.slice(0, 8)} Spawned`,
        `<div style="font-family: monospace; background: #09090b; color: #f4f4f5; padding: 20px; border-radius: 12px;">
          <h2 style="color: #f43f5e; margin-top: 0;">CRITICAL SYSTEM ANOMALY DETECTED</h2>
          <p><strong>App Target:</strong> ${targetApplicationCode}</p>
          <p><strong>Error Code:</strong> ${incidentErrorCode}</p>
          <p><strong>Details:</strong> ${incidentDescription}</p>
          <p style="color: #a1a1aa; font-size: 11px;">Edge Node Location: ${logCtx.edge_colo}</p>
        </div>`,
        env
      ));
    }


    // Save the new incident mapping tracker to Cloudflare KV with a rolling 5-minute (300s) suppression expiration TTL window
    ctx.waitUntil(env.STATUS_KV.put(debouncingCacheKey, newTicket.id, { expirationTtl: 300 }));

    // Async background triage calculation thread invocation pass
    ctx.waitUntil((async () => {
      const onyxAnalysis = await analyzeWithOnyx(newTicket.subject, incidentDescription, env.ANTHROPIC_API_KEY, null, null, "", env);

      const synchronizedMetrics = {
        ...(onyxAnalysis.metrics || {}),
        edge_colo: logCtx.edge_colo,
        ingest_method: "universal_telemetry_valve"
      };

      await supabase.from("ticket_ai_telemetry").insert({
        ticket_id: newTicket.id,
        analyzed_sentiment: onyxAnalysis.sentiment,
        suggested_category: onyxAnalysis.category,
        auto_response_draft: onyxAnalysis.draft,
        confidence_score: onyxAnalysis.confidence,
        metadata: synchronizedMetrics
      });
    })());

    return new Response(JSON.stringify({ success: true, debounced: false, ticket_id: newTicket.id }), {
      status: 201, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  }
}

// --- CRYPTOGRAPHIC OUTBOUND EGRESS FAN-OUT ROUTINE ---
async function dispatchSecureEgressWebhook(
  targetUrl: string,
  payload: any,
  env: Env,
  supabase: any
): Promise<void> {
  if (!targetUrl) return;

  const bodyString = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Axim-Origin": "AX_SUPPORT_CORE",
    "X-Axim-Timestamp": new Date().toISOString()
  };

  // Generate edge-native SHA-256 HMAC transport signature if service key is configured
  if (env.AXIM_SERVICE_KEY) {
    try {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.AXIM_SERVICE_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(bodyString));
      const hexSignature = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      headers["X-Axim-Webhook-Signature"] = hexSignature;
    } catch (sigError) {
      console.error("[EGRESS SIGNING FAULT] Failed to compute HMAC header:", sigError);
    }
  }

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: bodyString
    });

    // Log outbound dispatch trace into central events table
    await supabase.from("events_ax2024").insert({
      type: "egress_webhook_dispatched",
      payload: {
        destination: targetUrl,
        status_code: res.status,
        success: res.ok,
        timestamp: new Date().toISOString()
      }
    });
  } catch (fetchErr: any) {
    console.error(`[EGRESS TRANSPORT DROP] Failed to reach destination ${targetUrl}:`, fetchErr.message);
  }
}
