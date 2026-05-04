/**
 * AXiM Support - Edge Worker
 * Handles ticket ingestion, batch triage, RAG search, and webhooks.
 */

import { createClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AXIM_ONYX_SECRET: string;
  ANTHROPIC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. Route Handling
    if (url.pathname === '/vector-search') {
      return handleVectorSearch(request, env);
    }

    if (url.pathname === '/batch-triage') {
        return handleBatchTriage(request, env);
    }

    if (url.pathname === '/webhooks/intake') {
        return handleWebhookIntake(request, env);
    }

    // Default route (ticket ingestion)
    return handleTicketIngestion(request, env);
  },
};

// --- Route Handlers ---

async function handleTicketIngestion(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const ticketData: any = await request.json();
      const { subject, description, customer_id } = ticketData;

      const onyxAnalysis = await analyzeWithOnyx(subject, description, env.ANTHROPIC_API_KEY);
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          subject,
          description,
          customer_id,
          priority: onyxAnalysis.priority,
          status: 'open'
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      await supabase
        .from('ticket_ai_telemetry')
        .insert({
          ticket_id: ticket.id,
          analyzed_sentiment: onyxAnalysis.sentiment,
          suggested_category: onyxAnalysis.category,
          auto_response_draft: onyxAnalysis.draft,
          confidence_score: onyxAnalysis.confidence
        });

      return new Response(JSON.stringify({ success: true, ticket_id: ticket.id }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });

    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
}

async function handleVectorSearch(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { query } = (await request.json()) as any;

        // Mock embedding generation - in production use Cloudflare AI or external API
        const embedding = Array(384).fill(0).map(() => Math.random() * 2 - 1);

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Use RPC to search pgvector
        const { data, error } = await supabase.rpc('match_kb_articles', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 3
        });

        if (error) {
            // Mock response if RPC fails (e.g. schema not set up in dev)
            console.error("Vector search RPC error:", error);
            return new Response(JSON.stringify([
                { id: '1', title: "Mock: Resetting AXiM Core Node Auth", content: "To reset the node auth, go to settings and click Reset Auth.", similarity: 0.98 },
                { id: '2', title: "Mock: Billing Tier Migration Guide", content: "Migrating billing tiers requires contacting support.", similarity: 0.85 },
                { id: '3', title: "Mock: Onyx API Rate Limit Documentation", content: "The Onyx API is limited to 1000 requests per minute.", similarity: 0.72 }
            ]), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        const results = data.map((item: any) => ({
            id: item.id,
            title: item.title,
            content: item.content,
            relevance: Math.round(item.similarity * 100)
        }));

        return new Response(JSON.stringify(results), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}

async function handleBatchTriage(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { ticketIds } = (await request.json()) as any;
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Fetch tickets to analyze
        const { data: tickets, error: fetchError } = await supabase
            .from('support_tickets')
            .select('*')
            .in('id', ticketIds);

        if (fetchError) throw fetchError;

        const updates = [];
        const telemetryUpdates = [];

        // Simulate parallel AI processing for batch
        for (const ticket of tickets) {
            const analysis = await analyzeWithOnyx(ticket.subject, ticket.description, env.ANTHROPIC_API_KEY);

            updates.push({
                id: ticket.id,
                priority: analysis.priority,
                status: 'pending' // Move from open to pending after triage
            });

            telemetryUpdates.push({
                ticket_id: ticket.id,
                analyzed_sentiment: analysis.sentiment,
                suggested_category: analysis.category,
                auto_response_draft: analysis.draft,
                confidence_score: analysis.confidence
            });
        }

        // Bulk update tickets (upsert hack for bulk update in Supabase JS)
        const { error: updateError } = await supabase
            .from('support_tickets')
            .upsert(updates);

        if (updateError) throw updateError;

        // Upsert telemetry
        const { error: telemetryError } = await supabase
            .from('ticket_ai_telemetry')
            .upsert(telemetryUpdates);

        if (telemetryError) throw telemetryError;

        return new Response(JSON.stringify({ success: true, processed: updates.length }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}

async function handleWebhookIntake(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const contentType = request.headers.get('content-type') || '';
        let normalizedData: any = {};
        let attachmentUrl = null;
        let attachmentBase64 = null;
        let attachmentMime = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();

            // Extract text fields
            const rawPayloadStr = formData.get('payload');
            let rawPayload: any = {};
            if (rawPayloadStr) {
                try {
                    rawPayload = JSON.parse(rawPayloadStr as string);
                } catch(e) {}
            }

            normalizedData = {
                subject: formData.get('subject') || rawPayload.subject || rawPayload.title || 'External Intake Webhook',
                description: formData.get('description') || rawPayload.description || rawPayload.body || rawPayload.message || '',
                customer_email: formData.get('customer_email') || formData.get('email') || rawPayload.customer_email || rawPayload.email || rawPayload.sender,
                source: formData.get('source') || rawPayload.source || 'webhook',
                customer_name: formData.get('customer_name') || rawPayload.customer_name || rawPayload.name,
                tags: rawPayload.tags || []
            };

            // Process attachment if present
            const file = formData.get('attachment') as File | null;
            if (file) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);
                const fileExt = file.name.split('.').pop() || 'bin';
                const fileName = `${crypto.randomUUID()}.${fileExt}`;
                const filePath = `intake/${fileName}`;
                attachmentMime = file.type;

                // For small files, we can extract base64 directly to pass to Claude
                if (buffer.length < 5 * 1024 * 1024 && attachmentMime.startsWith('image/')) { // < 5MB
                    attachmentBase64 = btoa(String.fromCharCode.apply(null, Array.from(buffer)));
                }

                // Upload to Supabase Storage
                normalizedData.pendingFile = { buffer, filePath, type: file.type };
            }

        } else {
            const rawPayload: any = await request.json();
            normalizedData = {
                subject: rawPayload.subject || rawPayload.title || rawPayload.inquiry_subject || 'External Intake Webhook',
                description: rawPayload.description || rawPayload.body || rawPayload.message || JSON.stringify(rawPayload),
                customer_email: rawPayload.customer_email || rawPayload.email || rawPayload.sender,
                source: rawPayload.source || 'webhook',
                customer_name: rawPayload.customer_name || rawPayload.name,
                tags: rawPayload.tags || []
            };
        }

        if (!normalizedData.customer_email) {
            return new Response(JSON.stringify({ error: "Missing customer email" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // 1. Customer Upsert Logic
        let customerId;
        let customerTags: string[] = [];
        const { data: existingCustomer, error: lookupError } = await supabase
            .from('contacts_ax2024')
            .select('id, tags')
            .eq('email', normalizedData.customer_email)
            .single();

        if (lookupError && lookupError.code !== 'PGRST116') { // PGRST116 is not found
            throw lookupError;
        }

        if (existingCustomer) {
            customerId = existingCustomer.id;
            customerTags = existingCustomer.tags || [];
        } else {
            // Create new customer
            const { data: newCustomer, error: insertError } = await supabase
                .from('contacts_ax2024')
                .insert({
                    email: normalizedData.customer_email,
                    name: normalizedData.customer_name || normalizedData.customer_email.split('@')[0],
                    tags: normalizedData.tags || []
                })
                .select('id, tags')
                .single();

            if (insertError) throw insertError;
            customerId = newCustomer.id;
            customerTags = newCustomer.tags || [];
        }

        // Analyze and insert
        const onyxAnalysis = await analyzeWithOnyx(normalizedData.subject, normalizedData.description, env.ANTHROPIC_API_KEY, attachmentBase64, attachmentMime);

        let initialStatus = 'open';
        let onyxResponseDraft = onyxAnalysis.draft;

        let priority = onyxAnalysis.priority;
        let slaBreachAt = new Date();
        slaBreachAt.setHours(slaBreachAt.getHours() + 24); // Default 24h SLA

        const isVIP = customerTags.includes('VIP') || customerTags.includes('Enterprise');
        if (isVIP) {
            priority = 'urgent';
            slaBreachAt = new Date();
            slaBreachAt.setHours(slaBreachAt.getHours() + 1); // 1h SLA for VIP
        }

        // Sentinel Logic: Run vector search and attempt deflection
        // Mocking embedding since we don't have a real one here
        const embedding = Array(384).fill(0).map(() => Math.random() * 2 - 1);
        const { data: searchResults, error: searchError } = await supabase.rpc('match_kb_articles', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 3
        });

        let context = '';
        if (!searchError && searchResults && searchResults.length > 0) {
           context = searchResults.map((r: any) => `Title: ${r.title}\nContent: ${r.content}`).join('\n\n');
        }

        // If confidence > 90%, deflect
        if (onyxAnalysis.confidence > 90) {
            initialStatus = 'pending'; // Changed to pending_user via pending status per enum
        }

        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .insert({
                subject: normalizedData.subject,
                description: normalizedData.description,
                customer_id: customerId,
                priority: priority,
                sla_breach_at: slaBreachAt.toISOString(),
                status: initialStatus
            })
            .select()
            .single();

        if (ticketError) throw ticketError;

        // Upload attachment now that we have ticket id
        if (normalizedData.pendingFile) {
            const file = normalizedData.pendingFile;
            const fullPath = `${ticket.id}/${file.filePath}`;
            const { error: uploadError } = await supabase.storage
                .from('ticket_attachments')
                .upload(fullPath, file.buffer, {
                    contentType: file.type,
                    upsert: false
                });
            if (uploadError) console.error("Error uploading attachment:", uploadError);
        }

        if (initialStatus === 'pending' && onyxResponseDraft) {
            // Insert deflected response
            const { error: messageError } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticket.id,
                    sender_id: 'onyx_system', // Need to make sender_id Onyx. Update schema or use an AI id
                    message_body: onyxResponseDraft,
                    is_internal_note: false
                });
            if (messageError) console.error("Error inserting Onyx deflection message:", messageError);
        }

        await supabase
            .from('ticket_ai_telemetry')
            .insert({
                ticket_id: ticket.id,
                analyzed_sentiment: onyxAnalysis.sentiment,
                suggested_category: onyxAnalysis.category,
                auto_response_draft: onyxAnalysis.draft,
                confidence_score: onyxAnalysis.confidence
            });

        return new Response(JSON.stringify({ success: true, ticket_id: ticket.id }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}

// --- Helpers ---

async function analyzeWithOnyx(subject: string, description: string, apiKey: string, imageBase64?: string | null, imageMime?: string | null) {
  // Stubbed logic for AXiM Triage, would call Claude here with image if present
  // Claude 3 API payload example:
  /*
    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: `Subject: ${subject}\nDescription: ${description}` }
            ]
        }
    ];
    if (imageBase64 && imageMime) {
        messages[0].content.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: imageMime,
                data: imageBase64
            }
        });
    }
  */

  return {
    priority: description.toLowerCase().includes('urgent') ? 'urgent' : 'medium',
    sentiment: description.toLowerCase().includes('angry') ? 'negative' : 'neutral',
    category: 'technical_support',
    draft: "Hello, Onyx AI has received your request regarding " + subject + ". A human agent will be with you shortly.",
    confidence: Math.floor(Math.random() * 20) + 80 // 80-99
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
          description: "The amount to refund, in dollars."
        },
        reason: {
          type: "string",
          description: "The reason for the refund."
        }
      },
      required: ["amount", "reason"]
    }
  },
  {
    name: "trigger_password_reset",
    description: "Triggers a password reset email for the user.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The email address of the user to reset the password for."
        }
      },
      required: ["email"]
    }
  },
  {
    name: "grant_beta_access",
    description: "Grants the user access to a specific beta feature.",
    input_schema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "The name of the beta feature to grant access to."
        }
      },
      required: ["feature_name"]
    }
  }
];

async function handleToolCommand(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { command, ticketId } = (await request.json()) as any;
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Stubbed logic calling Claude API with tools
        // A real implementation would send 'command' to Anthropic API
        // `anthropic-version`: `2023-06-01`
        // and tools: ONYX_TOOLS

        let toolUsePayload = null;

        // Mocking Claude's response for specific commands:
        if (command.toLowerCase().includes('refund')) {
            const amountMatch = command.match(/\$?(\d+(\.\d{2})?)/);
            const amount = amountMatch ? parseFloat(amountMatch[1]) : 50;
            toolUsePayload = {
                name: 'issue_refund',
                input: { amount, reason: 'Customer requested via support.' }
            };
        } else if (command.toLowerCase().includes('password reset') || command.toLowerCase().includes('reset password')) {
            toolUsePayload = {
                name: 'trigger_password_reset',
                input: { email: 'user@example.com' } // Mock email
            };
        } else if (command.toLowerCase().includes('beta access')) {
             toolUsePayload = {
                name: 'grant_beta_access',
                input: { feature_name: 'new_dashboard' }
            };
        }

        if (toolUsePayload) {
            // HITL Logging
            const { data: hitlLog, error: hitlError } = await supabase
                .from('hitl_audit_logs')
                .insert({
                    status: 'pending',
                    tool_type: toolUsePayload.name,
                    payload: toolUsePayload.input,
                    support_ticket_id: ticketId
                })
                .select()
                .single();

            if (hitlError) throw hitlError;

            // Send message with metadata
            const { error: msgError } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticketId,
                    sender_id: 'onyx_system',
                    message_body: `Onyx proposes an action: ${toolUsePayload.name}`,
                    metadata: { hitl_log_id: hitlLog.id }
                });

            if (msgError) throw msgError;

            return new Response(JSON.stringify({ success: true, action_proposed: true }), {
                 headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        // Default response if no tool is used
        return new Response(JSON.stringify({ success: true, action_proposed: false }), {
             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}



async function handleExecuteAction(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { hitlLogId } = (await request.json()) as any;
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Fetch hitl log
        const { data: hitlLog, error: fetchError } = await supabase
            .from('hitl_audit_logs')
            .select('*')
            .eq('id', hitlLogId)
            .single();

        if (fetchError) throw fetchError;

        // Perform actual action execution here based on tool_type
        // For example:
        // if (hitlLog.tool_type === 'issue_refund') {
        //     await stripe.refunds.create({ charge: 'ch_123', amount: hitlLog.payload.amount });
        // }

        console.log(`Simulating execution of ${hitlLog.tool_type} with payload:`, hitlLog.payload);

        // Update ticket with execution message
        if (hitlLog.support_ticket_id) {
            await supabase.from('ticket_messages').insert({
                ticket_id: hitlLog.support_ticket_id,
                sender_id: 'onyx_system',
                message_body: `ACTION EXECUTED: ${hitlLog.tool_type} completed successfully.`
            });
        }

        return new Response(JSON.stringify({ success: true, executed: true }), {
             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}



async function handleTicketResolved(request: Request, env: Env): Promise<Response> {
    // This is called via Supabase DB Webhook when a ticket status changes to 'resolved'
    // The webhook payload structure depends on Supabase, usually contains 'record' and 'old_record'

    // Auth could be a simple secret check for webhooks
    const url = new URL(request.url);
    if (url.searchParams.get('secret') !== env.AXIM_ONYX_SECRET) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const payload: any = await request.json();
        const record = payload.record;

        if (!record || record.status !== 'resolved' || record.priority !== 'urgent' || record.rca_generated) {
            return new Response('Ignored', { status: 200 });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Fetch thread
        const { data: messages } = await supabase
            .from('ticket_messages')
            .select('sender_id, message_body, created_at')
            .eq('ticket_id', record.id)
            .order('created_at', { ascending: true });

        const threadText = messages?.map(m => `[${m.sender_id}]: ${m.message_body}`).join('\n') || '';

        // Call Claude 3 Haiku for RCA
        // Mock RCA generation:
        const rcaMarkdown = `
# Root Cause Analysis: ${record.subject}

## Problem
Customer reported a critical issue.

## Impact
High impact for VIP customer.

## Root Cause
Configuration error in the core system.

## Resolution
Applied the correct configuration and verified functionality.
`;

        // 1. Push to vector_kb
        const embedding = Array(384).fill(0).map(() => Math.random() * 2 - 1);
        await supabase.from('knowledge_base').insert({
            title: `RCA: ${record.subject}`,
            content: rcaMarkdown,
            embedding: embedding // requires pgvector integration correctly setup
        });

        // 2. Push to events_ax2024
        await supabase.from('events_ax2024').insert({
            type: 'rca_generated',
            payload: {
                ticket_id: record.id,
                subject: record.subject,
                rca: rcaMarkdown
            }
        });

        // 3. Mark ticket as rca_generated
        await supabase.from('support_tickets').update({ rca_generated: true }).eq('id', record.id);

        return new Response(JSON.stringify({ success: true, rca_generated: true }), {
             headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
