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
        const rawPayload: any = await request.json();

        // Attempt to normalize the payload to standard schema
        const normalizedData = {
            subject: rawPayload.subject || rawPayload.title || rawPayload.inquiry_subject || 'External Intake Webhook',
            description: rawPayload.description || rawPayload.body || rawPayload.message || JSON.stringify(rawPayload),
            customer_email: rawPayload.customer_email || rawPayload.email || rawPayload.sender,
            source: rawPayload.source || 'webhook'
        };

        if (!normalizedData.customer_email) {
            return new Response(JSON.stringify({ error: "Missing customer email" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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
                    name: rawPayload.customer_name || rawPayload.name || normalizedData.customer_email.split('@')[0],
                    tags: rawPayload.tags || []
                })
                .select('id, tags')
                .single();

            if (insertError) throw insertError;
            customerId = newCustomer.id;
            customerTags = newCustomer.tags || [];
        }

        // Analyze and insert
        const onyxAnalysis = await analyzeWithOnyx(normalizedData.subject, normalizedData.description, env.ANTHROPIC_API_KEY);

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

async function analyzeWithOnyx(subject: string, description: string, apiKey: string) {
  // Stubbed logic for AXiM Triage
  return {
    priority: description.toLowerCase().includes('urgent') ? 'urgent' : 'medium',
    sentiment: description.toLowerCase().includes('angry') ? 'negative' : 'neutral',
    category: 'technical_support',
    draft: "Hello, Onyx AI has received your request regarding " + subject + ". A human agent will be with you shortly.",
    confidence: Math.floor(Math.random() * 20) + 80 // 80-99
  };
}
