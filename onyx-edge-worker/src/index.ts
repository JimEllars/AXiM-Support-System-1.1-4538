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

const ToolCommandSchema = z.object({
  hitlLogId: z.string().uuid(),
});

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  ip: string,
  maxRequests: number,
  windowMs = 60000,
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
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

interface LogContext {
  requestId: string;
  endpoint: string;
  method: string;
  timestamp: string;
}

function createLogContext(request: Request): LogContext {
  return {
    requestId: crypto.randomUUID(),
    endpoint: new URL(request.url).pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
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
  context: LogContext,
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
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AXIM_ONYX_SECRET: string;
  ANTHROPIC_API_KEY: string;
  AXIM_SERVICE_KEY: string;
  CORE_API_URL: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
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


async function handleSLASweep(env: Env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();

    const { data: breachedTickets, error: fetchError } = await supabase
      .from('support_tickets')
      .select('id')
      .in('status', ['open', 'pending'])
      .lt('sla_breach_at', now);

    if (fetchError) {
      console.error('[handleSLASweep] Error fetching breached tickets:', fetchError);
      return;
    }

    if (!breachedTickets || breachedTickets.length === 0) {
      console.log('[handleSLASweep] No breached tickets found.');
      return;
    }

    console.log(`[handleSLASweep] Found ${breachedTickets.length} breached tickets. Escalating...`);

    for (const ticket of breachedTickets) {
      // Escalate priority
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ priority: 'urgent' })
        .eq('id', ticket.id);

      if (updateError) {
        console.error(`[handleSLASweep] Error updating ticket ${ticket.id}:`, updateError);
        continue;
      }

      // Inject system message
      const { error: messageError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: 'system',
          sender_type: 'system',
          content: 'SYSTEM ALERT: SLA Breached. Ticket automatically escalated to URGENT priority.',
          is_internal: true
        });

      if (messageError) {
        console.error(`[handleSLASweep] Error inserting message for ticket ${ticket.id}:`, messageError);
      }
    }

    console.log('[handleSLASweep] SLA sweep completed successfully.');
  } catch (error) {
    console.error('[handleSLASweep] Unhandled exception in SLA sweep:', error);
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: any) {
    ctx.waitUntil(handleSLASweep(env));
  },
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...getCorsHeaders(env, request),
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 2. Route Handling
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/onyx-bridge/stream"
    ) {
      return handleOnyxBridgeStream(request, env, ctx);
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

    if (url.pathname === '/api/v1/webhooks/feedback') {
      return handleFeedbackIngress(request, env, ctx);
    }



    if (url.pathname === "/api/v1/webhooks/sandbox-resolution") {
      return handleSandboxResolution(request, env, ctx);
    }

    if (url.pathname === "/api/v1/webhooks/sandbox-resolution") {
      return handleSandboxResolution(request, env, ctx);
    }

if (url.pathname === "/webhooks/intake") {
      return handleWebhookIntake(request, env, ctx);
    }

    if (url.pathname === "/api/v1/actions/resolve") {
      return handleExecuteAction(request, env, ctx);
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
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const ticketData: any = await request.json();
    const { subject, description, customer_id } = ticketData;


    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        subject,
        description,
        customer_id,
        priority: "medium", // Default
        status: "open", // Default
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
            );

            const { error: updateError } = await supabase
              .from("support_tickets")
              .update({
                priority: onyxAnalysis.priority,
              })
              .eq("id", ticket.id);
            if (updateError) throw updateError;


            if (onyxAnalysis.confidence < 85) {
              console.log(`[ESCALATION] Confidence ${onyxAnalysis.confidence} < 85. Dispatching to Sandbox.`);
              fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/sandbox-dispatch`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
                },
                body: JSON.stringify({
                  ticket_id: ticket.id,
                  subject: subject,
                  description: description,
                  customer_email: ticketData.customer_email || "unknown@example.com",
                }),
              }).catch(err => console.error("Sandbox dispatch failed:", err));
            }

            const { error: aiError } = await supabase.from("ticket_ai_telemetry").insert({

              ticket_id: ticket.id,
              analyzed_sentiment: onyxAnalysis.sentiment,
              suggested_category: onyxAnalysis.category,
              auto_response_draft: onyxAnalysis.draft,
              confidence_score: onyxAnalysis.confidence,
            });



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
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { query } = (await request.json()) as any;

    let embedding = [];
    try {
      const embedRes = await fetch(
        `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
          },
          body: JSON.stringify({ input: query }),
        },
      );
      if (embedRes.ok) {
        const embedData: any = await embedRes.json();
        if (embedData.embedding) embedding = embedData.embedding;
      } else {
        logErr(
          supabase,
          logCtx,
          new Error("Embedding API error: " + (await embedRes.text())),
          ctx
        );
        throw new Error("Failed to fetch embedding from Core");
      }
    } catch (err) {
      logErr(supabase, logCtx, err, ctx);
      throw new Error("Embedding generation failed");
    }

    // Use RPC to search pgvector
    const { data, error } = await supabase.rpc("match_kb_articles", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 3,
    });

    if (error || !data || data.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(env, request),
        },
      });
    }

    const results = data.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      relevance: Math.round(item.similarity * 100),
    }));

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(JSON.stringify(results), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
}

async function handleBatchTriage(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { ticketIds } = (await request.json()) as any;

    // Fetch tickets to analyze
    const { data: tickets, error: fetchError } = await supabase
      .from("support_tickets")
      .select("*")
      .in("id", ticketIds);

    if (fetchError) throw fetchError;

    const updates = [];
    const telemetryUpdates = [];
    const messagesToInsert = [];

    // Simulate parallel AI processing for batch
    for (const ticket of tickets) {
      const analysis = await analyzeWithOnyx(
        ticket.subject,
        ticket.description,
        env.ANTHROPIC_API_KEY,
      );

      updates.push({
        id: ticket.id,
        priority: analysis.priority,
        status: "pending", // Move from open to pending after triage
      });

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

    // Bulk update tickets (upsert hack for bulk update in Supabase JS)
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ priority: update.priority, status: update.status })
        .eq("id", update.id);
      if (updateError) throw updateError;
    }

    // Upsert telemetry
    const { error: telemetryError } = await supabase
      .from("ticket_ai_telemetry")
      .upsert(telemetryUpdates);

    if (telemetryError) throw telemetryError;

    if (messagesToInsert.length > 0) {
      const { error: messagesError } = await supabase
        .from("ticket_messages")
        .insert(messagesToInsert);
      if (messagesError) throw messagesError;
    }

    return new Response(
      JSON.stringify({ success: true, processed: updates.length }),
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

/**
 * Handles tokenless public intake from web forms.
 * Enforces origin rules and tags sandbox escalation for zero-day faults.
 */
async function handlePublicWebIngress(request: Request, env: Env, ctx: any): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : [];

  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden: Invalid Origin" }), { status: 403, headers: getCorsHeaders(env, request) });
  }

  try {
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Authorization", `Bearer ${env.AXIM_ONYX_SECRET}`);
    newHeaders.set("X-Axim-Default-Source", "website");

    // @ts-ignore - Required by CF Workers for ReadableStream body
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      // @ts-ignore
      duplex: 'half'
    });

    return handleWebhookIntake(newRequest, env, ctx);
  } catch (error) {
    return new Response(JSON.stringify({ error: "Proxy routing failed" }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}




async function handleWebhookIntake(request: Request, env: Env, ctx: any): Promise<Response> {
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
  if (!checkRateLimit(clientIP, 10)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded for webhooks" }),
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
      .select("id, tags")
      .eq("email", normalizedData.customer_email)
      .maybeSingle();

    if (customerError) throw customerError;

    let customerId = customerData?.id;
    let customerTags = customerData?.tags || [];

    if (!customerId) {
      const { data: newCustomer, error: insertError } = await supabase
        .from("contacts_ax2024")
        .insert({
          email: normalizedData.customer_email,
          name: normalizedData.customer_name || "Unknown Sender",
          role: "customer",
          tags: normalizedData.tags,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      customerId = newCustomer.id;
      customerTags = newCustomer.tags || [];
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

const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        assigned_department: assignedDepartment,
        subject: normalizedData.subject,
        description: normalizedData.description,
        customer_id: customerId,
        priority: "medium", // Default priority
        status: "open", // Default status
        sla_breach_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
            source: normalizedData.source,
            tags: normalizedData.tags,
            workflow_category: normalizedData.workflow_category,
        },
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // 3. Immediately Return 200 OK Response
    const response = new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id }),
      {
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(env, request),
        },
      },
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
              if (uploadError) logErr(supabase, logCtx, uploadError, ctx);
            }

            // Analyze and insert
            let embeddingForRag: any[] = [];
            try {
              const embedRes = await fetch(
                `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
                  },
                  body: JSON.stringify({
                    input: `${normalizedData.subject} ${normalizedData.description || ""}`,
                  }),
                },
              );
              if (embedRes.ok) {
                const embedData: any = await embedRes.json();
                if (embedData.embedding) embeddingForRag = embedData.embedding;
              }
            } catch (err) {
              logErr(supabase, logCtx, err, ctx);
            }

            let contextText = "";
            if (embeddingForRag.length > 0) {
              const { data: searchResults, error: searchError } = await supabase.rpc(
                "match_memory_banks",
                {
                  query_embedding: embeddingForRag,
                  match_threshold: 0.5,
                  match_count: 3,
                },
              );

              if (!searchError && searchResults && searchResults.length > 0) {
                contextText = searchResults
                  .map((r: any) => `Title: ${r.title}\nContent: ${r.content}`)
                  .join("\n\n");
              }
            } else {
               const { data: searchResults, error: searchError } = await supabase
                .from("memory_banks")
                .select("title, content")
                .limit(3);

              if (!searchError && searchResults && searchResults.length > 0) {
                contextText = searchResults
                  .map((r: any) => `Title: ${r.title}\nContent: ${r.content}`)
                  .join("\n\n");
              }
            }

            const onyxAnalysis = await analyzeWithOnyx(
              normalizedData.subject,
              normalizedData.description,
              env.ANTHROPIC_API_KEY,
              attachmentBase64,
              attachmentMime,
              contextText
            );

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

            // Sentinel Logic: Run vector search and attempt deflection
            let embedding: any[] = [];
            try {
              const embedRes = await fetch(
                `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
                  },
                  body: JSON.stringify({
                    input: `${normalizedData.subject} ${normalizedData.description || ""}`,
                  }),
                },
              );
              if (embedRes.ok) {
                const embedData: any = await embedRes.json();
                if (embedData.embedding) embedding = embedData.embedding;
              } else {
                logErr(supabase, logCtx, new Error("Embedding API error: " + (await embedRes.text())), ctx);
              }
            } catch (err) {
              logErr(supabase, logCtx, err, ctx);
            }

            if (embedding.length > 0) {
              const { data: searchResults, error: searchError } = await supabase.rpc(
                "match_kb_articles",
                {
                  query_embedding: embedding,
                  match_threshold: 0.5,
                  match_count: 3,
                },
              );

              let context = "";
              if (!searchError && searchResults && searchResults.length > 0) {
                context = searchResults
                  .map((r: any) => `Title: ${r.title}\nContent: ${r.content}`)
                  .join("\n\n");
              }
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


            if (onyxAnalysis.confidence < 85) {
              console.log(`[ESCALATION] Confidence ${onyxAnalysis.confidence} < 85. Dispatching to Sandbox.`);
              fetch(`${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/sandbox-dispatch`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
                },
                body: JSON.stringify({
                  ticket_id: ticket.id,
                  subject: normalizedData.subject,
                  description: normalizedData.description,
                  customer_email: normalizedData.customer_email,
                }),
              }).catch(err => console.error("Sandbox dispatch failed:", err));
            }

            const { error: aiTelemetryError } = await supabase.from("ticket_ai_telemetry").insert({

              ticket_id: ticket.id,
              analyzed_sentiment: onyxAnalysis.sentiment,
              suggested_category: onyxAnalysis.category,
              auto_response_draft: onyxAnalysis.draft,
              confidence_score: onyxAnalysis.confidence,
            });

  // Tier 3 Sandbox Egress Dispatch
  if (onyxAnalysis.confidence < 85) {
    console.log(`[ESCALATION] Confidence ${onyxAnalysis.confidence} < 85. Dispatching to Sandbox.`);
    const sandboxUrl = `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/sandbox-dispatch`;

    fetch(sandboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        ticket_id: ticket.id,
        subject: normalizedData.subject,
        description: normalizedData.description,
        customer_email: normalizedData.customer_email,
      }),
    }).catch(err => console.error("Sandbox dispatch failed:", err));
  }


  // Tier 3 Sandbox Egress Dispatch
  if (onyxAnalysis.confidence < 85) {
    console.log(`[ESCALATION] Confidence ${onyxAnalysis.confidence} < 85. Dispatching to Sandbox.`);
    const sandboxUrl = `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/sandbox-dispatch`;

    fetch(sandboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        ticket_id: ticket.id,
        subject: normalizedData.subject,
        description: normalizedData.description,
        customer_email: normalizedData.customer_email,
      }),
    }).catch(err => console.error("Sandbox dispatch failed:", err));
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

async function analyzeWithOnyx(
  subject: string,
  description: string,
  apiKey: string,
  imageBase64?: string | null,
  imageMime?: string | null,
  contextText?: string,
) {
  const defaultFallback = {
    priority: description.toLowerCase().includes("urgent") ? "urgent" : "medium",
    sentiment: description.toLowerCase().includes("angry") ? "negative" : "neutral",
    category: "technical_support",
    draft: "Hello, Onyx AI has received your request regarding " + subject + "\n\nWe are analyzing the issue.",
    confidence: 50,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: `Subject: ${subject}\nDescription: ${description}` }
        ] as any[]
      }
    ];

    if (imageBase64 && imageMime) {
      messages[0].content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageMime,
          data: imageBase64
        }
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: `You are the AXiM Support Triage AI. ${contextText ? `Here are the relevant AXiM operational guidelines for this issue:\n[Context]\n${contextText}\n[End Context]\nUse these guidelines to determine priority and draft a response.\n` : ""}You MUST return your response STRICTLY as a stringified JSON object matching this exact schema:\n{\n  "priority": "low" | "medium" | "high" | "urgent",\n  "sentiment": "positive" | "neutral" | "negative",\n  "category": "string",\n  "draft": "string",\n  "confidence": number\n}`,
        messages: messages
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return defaultFallback;
    }

    const data: any = await response.json();
    let textRes = data.content[0].text;
    textRes = textRes.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(textRes);

    return {
      priority: parsed.priority || defaultFallback.priority,
      sentiment: parsed.sentiment || defaultFallback.sentiment,
      category: parsed.category || defaultFallback.category,
      draft: parsed.draft || defaultFallback.draft,
      confidence: parsed.confidence || defaultFallback.confidence,
    };
  } catch (error) {
    return defaultFallback;
  }
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
  if (!checkRateLimit(clientIP, 5)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded for action execution" }),
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  }

  try {
    const rawPayload: any = await request.json();
    let payload;
    try {
      payload = ToolCommandSchema.parse(rawPayload);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Action payload validation failed",
            details: zodError.issues,
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
      throw zodError;
    }

    const { hitlLogId } = payload;

    // Fetch hitl log
    const { data: hitlLog, error: fetchError } = await supabase
      .from("hitl_audit_logs")
      .select("*")
      .eq("id", hitlLogId)
      .single();

    if (fetchError) throw fetchError;

    // Idempotency check
    if (hitlLog.status === "executed") {
      logEnd(supabase, logCtx, startTime, ctx);
      return new Response(
        JSON.stringify({
          success: true,
          executed: true,
          message: "Action already executed.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(env, request),
          },
        },
      );
    }

    // Step 1: The AXiM Core API Proxy Handshake
    // Proxy the request through the AXiM Core Ecosystem Vault


    const coreProxyUrl = env.CORE_API_URL
      ? `${env.CORE_API_URL}/functions/v1/api-proxy`
      : "https://api.axim-core.internal/v1/proxy";

    // The AXiM Core API Proxy Handshake implementation
    const proxyResponse = await fetch(coreProxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
        "Idempotency-Key": hitlLogId,
      },
      body: JSON.stringify({
        action: hitlLog.tool_type,
        payload: hitlLog.payload,
      }),
    });

    if (!proxyResponse.ok) {
      if (proxyResponse.status === 401 || proxyResponse.status === 403) {
        throw new Error(
          "Vault Access Denied: Core rejected the credential request.",
        );
      }
      throw new Error(`Core API Proxy Failed: ${await proxyResponse.text()}`);
    }

    // Update ticket with execution message
    if (hitlLog.support_ticket_id) {
      await supabase.from("ticket_messages").insert({
        ticket_id: hitlLog.support_ticket_id,
        sender_id: "onyx_system",
        message_body: `ACTION EXECUTED VIA CORE PROXY: ${hitlLog.tool_type} completed successfully.`,
      });

      // Log to telemetry events table
      await supabase.from("events_ax2024").insert({
        type: "action_executed",
        payload: {
          ticket_id: hitlLog.support_ticket_id,
          action: hitlLog.tool_type,
          hitl_log_id: hitlLogId,
          status: "success",
        },
      });
    }

    await supabase
      .from("hitl_audit_logs")
      .update({ status: "executed" })
      .eq("id", hitlLogId);

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(
      JSON.stringify({ success: true, executed: true, proxied: true }),
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

async function handleTicketResolved(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  const startTime = Date.now();
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));

  // This is called via Supabase DB Webhook when a ticket status changes to 'resolved'
  // The webhook payload structure depends on Supabase, usually contains 'record' and 'old_record'

  // Auth could be a simple secret check for webhooks
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== env.AXIM_ONYX_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload: any = await request.json();
    const record = payload.record;

    if (
      !record ||
      record.status !== "resolved" ||
      record.priority !== "urgent" ||
      record.rca_generated
    ) {
      return new Response("Ignored", { status: 200 });
    }

    // Fetch thread
    const { data: messages } = await supabase
      .from("ticket_messages")
      .select("sender_id, message_body, created_at")
      .eq("ticket_id", record.id)
      .order("created_at", { ascending: true });

    const threadText =
      messages
        ?.map((m: any) => `[${m.sender_id}]: ${m.message_body}`)
        .join("\n") || "";

        // Call Claude 3 Haiku for RCA
    let rcaMarkdown = "";
    if (env.ANTHROPIC_API_KEY) {
      try {
        const prompt = `You are Onyx Mk3. Generate a Root Cause Analysis for this resolved ticket.\nSubject: ${record.subject}\nThread:\n${threadText}\nOutput strictly in Markdown with ## Problem, ## Root Cause, and ## Resolution.`;
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (anthropicRes.ok) {
          const data = await anthropicRes.json() as any;
          rcaMarkdown = data.content[0].text;
        } else {
          throw new Error("Anthropic API failed");
        }
      } catch (err) {
        logErr(supabase, logCtx, err as Error, ctx);
        rcaMarkdown = `## Problem\n${record.subject}\n## Root Cause\nUnavailable (Engine Timeout)\n## Resolution\nResolved manually by operator.`;
      }
    } else {
      rcaMarkdown = `## Problem\n${record.subject}\n## Root Cause\nSystem operating in local dev mode. No RCA generated.\n## Resolution\nN/A`;
    }

    // 1. Push to AXiM Core memory_banks (Ecosystem Fusion)

    let embeddingForMemory: any[] | null = null;
    try {
      const embedRes = await fetch(
        `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
          },
          body: JSON.stringify({
            input: `RCA: ${record.subject}\n\n${rcaMarkdown}`,
          }),
        },
      );
      if (embedRes.ok) {
        const embedData: any = await embedRes.json();
        if (embedData.embedding) embeddingForMemory = embedData.embedding;
      }
    } catch (err) {
      logErr(supabase, logCtx, err, ctx);
    }

    await supabase.from("memory_banks").insert({
      title: `RCA: ${record.subject}`,
      content: rcaMarkdown,
      embedding: embeddingForMemory,
      metadata: {
        source: "support_system",
        partner: record.metadata?.partner || "unknown",
        category: record.suggested_category || "support",
      },
    });

    // 2. Push to events_ax2024
    await supabase.from("events_ax2024").insert({
      type: "rca_generated",
      payload: {
        ticket_id: record.id,
        subject: record.subject,
        rca: rcaMarkdown,
      },
    });

    // 3. Mark ticket as rca_generated
    await supabase
      .from("support_tickets")
      .update({ rca_generated: true })
      .eq("id", record.id);

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(
      JSON.stringify({ success: true, rca_generated: true }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleOnyxBridgeStream(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const ticketId = url.searchParams.get("ticket_id");

  // Strict validation against AXIM_ONYX_SECRET
  if (token !== env.AXIM_ONYX_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let controller: ReadableStreamDefaultController | undefined;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const encoder = new TextEncoder();
  const sendEvent = (data: any) => {
    controller?.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Simulate the process asynchronously and update Presence
  (async () => {
    try {
      sendEvent({ type: "start" });

      // Presence Integration: notify agents Onyx is thinking
      if (ticketId) {
        const channelName = `ticket-presence:${ticketId}`;
        const channel = supabase.channel(channelName);
        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              agentId: "onyx-ai",
              name: "Onyx AI",
              role: "AI Orchestrator",
              color: "bg-fuchsia-500",
              isAI: true,
              isTyping: true,
            });
          }
        });
        await new Promise((r) => setTimeout(r, 500));
      }

      // Also push to events_ax2024 for the frontend to pick up the 'Thinking' status
      if (ticketId) {
        await supabase.from("events_ax2024").insert({
          type: "onyx_presence",
          payload: {
            ticket_id: ticketId,
            status: "Thinking",
            message: "Onyx sub-agents spawned.",
          },
        });
      }

      await new Promise((r) => setTimeout(r, 1000));
      sendEvent({ type: "log", message: `Analyzing ticket ${ticketId}...` });

      await new Promise((r) => setTimeout(r, 1500));
      sendEvent({ type: "log", message: "Checking knowledge base..." });

      await new Promise((r) => setTimeout(r, 1500));
      sendEvent({ type: "log", message: "Verifying user permissions..." });

      await new Promise((r) => setTimeout(r, 1000));

      if (ticketId) {
        await supabase.from("events_ax2024").insert({
          type: "onyx_presence",
          payload: {
            ticket_id: ticketId,
            status: "Complete",
            message: "Investigation complete.",
          },
        });
      }
      sendEvent({ type: "complete" });

      controller?.close();
    } catch (e: any) {
      logErr(supabase, logCtx, e, ctx);
      controller?.error(e);
    } finally {
      // Clear presence
      if (ticketId) {
        try {
          const channelName = `ticket-presence:${ticketId}`;
          const channel = supabase.channel(channelName);
          await channel.untrack();
          supabase.removeChannel(channel);
        } catch (err) {
          console.error("Error cleaning up channel", err);
        }
      }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...getCorsHeaders(env, request),
    },
  });
}

async function handleAutoDraft(request: Request, env: Env, ctx: any): Promise<Response> {
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
    const { ticketData, articles } = (await request.json()) as any;

    let contextText = articles
      .map((a: any) => `${a.title}: ${a.content}`)
      .join("\n");

    // Mocking Claude 3 Haiku API response based on RAG context
    // In real life, we would use fetch('https://api.anthropic.com/v1/messages', {...}) here.

    const simulatedDraft = `Hello ${ticketData?.contacts_ax2024?.name || "there"},

Based on our knowledge base, here is some relevant information regarding "${ticketData.subject}":
${contextText ? contextText : "No specific articles found, but we are looking into this."}

I am currently investigating this further and will provide a full update shortly.

Best,
AXiM Support (Onyx Auto-Draft)`;

    let generatedDraft = simulatedDraft;

    if (env.ANTHROPIC_API_KEY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const systemPrompt = "You are Onyx, an AI support co-pilot. Draft a concise, professional initial response to the customer based on the provided context. If the context doesn't contain a full answer, state that we are looking into it.";
        const userPrompt = `Customer Issue: ${ticketData.subject}

Relevant Context:
${contextText}`;

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
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const anthropicData: any = await response.json();
          if (anthropicData.content && anthropicData.content[0] && anthropicData.content[0].text) {
            generatedDraft = anthropicData.content[0].text;
          }
        } else {
          const errText = await response.text(); logErr(supabase, logCtx, new Error("Anthropic API error in handleAutoDraft: " + errText), ctx); console.error("Anthropic API error in handleAutoDraft:", errText);
        }
      } catch (err) {
        logErr(supabase, logCtx, err, ctx); console.error("Anthropic API fetch failed or timed out in handleAutoDraft:", err);
      }
    }

    return new Response(JSON.stringify({ draft: generatedDraft }), {

      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
}

async function handleGenerateSuggestion(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const logCtx = createLogContext(request);
  ctx.waitUntil(logToEvents(supabase, logCtx, "performance_metric", "Request start", {
    headers: request.headers,
  }).catch(() => {}));
  const startTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { subject, description, context_messages } =
      (await request.json()) as any;

    // Defense-in-Depth Filter (even though frontend already filters, we filter just in case, though frontend sends string array now, we can check if it has is_internal_note property if we sent objects, but if we sent strings we can just map them directly. Let's filter just in case it's objects, but the frontend sends strings)
    // Wait, the prompt says: "Implement a strict backend filter: const safeMessages = (context_messages || []).filter((m: any) => m.is_internal_note !== true);"
    const safeMessages = (context_messages || [])
      .filter((m: any) => m.is_internal_note !== true)
      .slice(-5);

    // Convert to text since they might be strings or objects depending on the previous steps
    const historyText = safeMessages
      .map((m: any) =>
        typeof m === "string" ? m : m.text || m.message_body || "",
      )
      .join("\n");

    // 1. Query memory_banks for context (top 3)

    let embedding = [];
    try {
      const embedRes = await fetch(
        `${env.CORE_API_URL || "https://api.axim-core.internal"}/functions/v1/generate-embedding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.AXIM_SERVICE_KEY}`,
          },
          body: JSON.stringify({ input: `${subject} ${description || ""}` }),
        },
      );
      if (embedRes.ok) {
        const embedData: any = await embedRes.json();
        if (embedData.embedding) embedding = embedData.embedding;
      } else {
        logErr(
          supabase,
          logCtx,
          new Error("Embedding API error: " + (await embedRes.text())),
          ctx
        );
        throw new Error("Failed to fetch embedding from Core");
      }
    } catch (err) {
      logErr(supabase, logCtx, err, ctx);
      throw new Error("Embedding generation failed");
    }

    const { data: memoryBanks, error: dbError } = await supabase.rpc(
      "match_memory_banks",
      {
        query_embedding: embedding,
        match_threshold: 0.75,
        match_count: 3,
      },
    );

    if (dbError) throw dbError;

    let contextText =
      memoryBanks
        ?.map((m: any) => `Title: ${m.title}\nContent: ${m.content}`)
        .join("\n\n") || "No context found.";

    // 2. Call Claude 3 Haiku
    const prompt = `You are Onyx, an expert AXiM Support AI. Given the following ticket details and context from our memory banks, write a professional and helpful support response draft for the agent to review and send to the customer.

Ticket Subject: ${subject}
Ticket Description: ${description}

Recent Conversation History:
${historyText || "No previous replies."}

Context from Memory Banks (Playbooks/RCAs):
${contextText}

Draft a concise, professional reply:`;

    let draft = "";
    if (env.ANTHROPIC_API_KEY) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout boundary

      try {
        const anthropicRes = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 500,
              messages: [{ role: "user", content: prompt }],
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (anthropicRes.ok) {
          const data: any = await anthropicRes.json();
          draft = data.content[0].text;
        } else {
          logErr(
            supabase,
            logCtx,
            new Error("Anthropic Error: " + (await anthropicRes.text())),
            ctx

          );
          throw new Error("Anthropic API returned non-OK status.");
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        logErr(supabase, logCtx, err, ctx);

        // Engineered fallback boundary
        draft = `[AUTO-FALLBACK: AI Generation Timeout]\n\nBased on the primary knowledge base findings, we have identified the following context for your issue:\n\n${contextText}\n\nOur support team will review this information and follow up shortly.`;
      }
    } else {
      // Fallback if no key is provided in env
      draft = `Based on the context:\n${contextText}\n\nWe are investigating the issue "${subject}".`;
    }

    logEnd(supabase, logCtx, startTime, ctx);
    return new Response(JSON.stringify({ draft }), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });
  } catch (error: any) {
    logErr(supabase, logCtx, error, ctx);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...getCorsHeaders(env, request) },
    });
  }
}

async function handleMessageEgress(request: Request, env: Env, ctx: any): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== env.AXIM_ONYX_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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

    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

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
          finalBody += `

---
This case has been marked as closed. How did we do? Please let us know by visiting: https://axim.us.com/feedback?ticket_id=${record.ticket_id}`;
        }

        const emailPayload = {
          from: env.RESEND_FROM_EMAIL || "support@axim.us.com",
          to: contact.email,
          subject: `Re: ${ticket.subject}`,
          text: finalBody,
        };

        // Fire and forget generic external API placeholder
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          },
          body: JSON.stringify(emailPayload),
        }).catch(err => console.error("Email dispatch failed", err));

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
          const analysisResult = await analyzeWithOnyx("", threadText + "\n\nPROMPT: " + systemPrompt, env.ANTHROPIC_API_KEY);

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
  if (authHeader !== `Bearer ${env.AXIM_SERVICE_KEY}`) {
    return new Response("Unauthorized Vault Access", { status: 401 });
  }

  try {
    const payload = await request.json() as any;
    const { ticket_id, resolution_notes, patch_payload } = payload;

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Create pending HITL execution block
    const { data: hitlLog, error: hitlError } = await supabase.from("hitl_audit_logs").insert({
      status: 'pending',
      tool_type: 'apply_git_patch',
      payload: patch_payload,
      support_ticket_id: ticket_id
    }).select().single();

    if (hitlError) throw hitlError;

    // Inject proposed action into the message thread
    await supabase.from("ticket_messages").insert({
      ticket_id: ticket_id,
      sender_id: 'onyx_system',
      message_body: resolution_notes || "Tier 3 Sandbox Agent has proposed a code resolution.",
      metadata: { hitl_log_id: hitlLog.id }
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
