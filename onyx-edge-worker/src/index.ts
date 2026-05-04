/**
 * AXiM Support - Edge Intake Worker
 * Handles ticket ingestion, Onyx AI triage, and Supabase insertion.
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
    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. Authentication Check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const ticketData = await request.json();
      const { subject, description, customer_id } = ticketData;

      // 3. Onyx AI Triage (Claude-3-Haiku)
      // In a production environment, we call Anthropic here.
      // Below is the structured prompt logic for Onyx.
      const onyxAnalysis = await analyzeWithOnyx(subject, description, env.ANTHROPIC_API_KEY);

      // 4. Supabase Integration
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // Create the ticket
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

      // Store AI Telemetry
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
  },
};

async function analyzeWithOnyx(subject: string, description: string, apiKey: string) {
  // Stubbed logic for AXiM Triage
  // In real implementation, this performs a fetch() to Anthropic API
  return {
    priority: description.toLowerCase().includes('urgent') ? 'urgent' : 'medium',
    sentiment: 'neutral',
    category: 'technical_support',
    draft: "Hello, Onyx AI has received your request regarding " + subject + ". A human agent will be with you shortly.",
    confidence: 85
  };
}