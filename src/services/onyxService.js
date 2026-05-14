/**
 * Onyx AI Frontend Service - Enhanced
 * Logic for Edge Triage, Command Hub, and RAG Suggestions
 */

const ONYX_WORKER_URL = import.meta.env.VITE_ONYX_WORKER_URL;
const ONYX_SECRET = "onyx_local_dev_secret"; // Matches worker auth

export const onyxService = {
  async createTicket(ticketData) {
    if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
      return { success: true, ticket_id: crypto.randomUUID() };
    }
    const response = await fetch(ONYX_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
      body: JSON.stringify(ticketData)
    });
    return response.json();
  },

  async generateAutoDraft(ticketId, ticketData) {
    try {
        const response = await fetch(`${ONYX_WORKER_URL}/api/v1/onyx/generate-suggestion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
            body: JSON.stringify({ subject: ticketData.subject, description: ticketData.description })
        });
        return await response.json();
    } catch (e) {
        console.error("Failed to generate auto-draft:", e);
        return { draft: "Failed to generate draft." };
    }
  },

  async getKBSuggestions(subject, description) {
    if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
        await new Promise(resolve => setTimeout(resolve, 800));
        return [
            { id: 1, title: "Resetting AXiM Core Node Auth", relevance: 98, content: "To reset the node auth, go to settings and click Reset Auth." },
            { id: 2, title: "Billing Tier Migration Guide", relevance: 85, content: "Migrating billing tiers requires contacting support." },
            { id: 3, title: "Onyx API Rate Limit Documentation", relevance: 72, content: "The Onyx API is limited to 1000 requests per minute." }
        ];
    }

    try {
        const response = await fetch(`${ONYX_WORKER_URL}/vector-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
            body: JSON.stringify({ query: `${subject} ${description}` })
        });
        return response.json();
    } catch (e) {
        console.error("Vector search failed:", e);
        return [];
    }
  },

  async executeBatchTriage(ticketIds) {
      if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { success: true, processed: ticketIds.length };
      }

      const response = await fetch(`${ONYX_WORKER_URL}/batch-triage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
          body: JSON.stringify({ ticketIds })
      });
      return response.json();
  },

  async syncTelemetryToCore(metrics) {
      // Sync metrics to core events table (simulated edge logic)
      try {
          const { supabase } = await import('../lib/supabaseClient');
          const { error } = await supabase.from('events_ax2024').insert({
              type: 'support_daily_rollup',
              payload: metrics
          });
          if (error) throw error;
          console.log("Telemetry synced to AXiM Core successfully.");
          return { success: true };
      } catch (e) {
          console.error("Failed to sync telemetry:", e);
          return { success: false, error: e };
      }
  },

  async parseCommand(query, ticketId = null) {
    if (ticketId && (query.toLowerCase().includes('refund') || query.toLowerCase().includes('password') || query.toLowerCase().includes('beta'))) {
        try {
            const response = await fetch(`${ONYX_WORKER_URL}/tool-command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
                body: JSON.stringify({ command: query, ticketId })
            });
            const data = await response.json();
            if (data.action_proposed) {
                 return { intent: 'TOOL_PROPOSAL', success: true };
            }
        } catch (e) {
            console.error("Tool command failed:", e);
        }
    }
    const q = query.toLowerCase();
    return new Promise(resolve => {
        setTimeout(() => {
            if (q.includes('assign') && q.includes('ticket') && q.includes('me')) {
                const match = q.match(/#(\w+-\w+-\w+)/);
                if (match) {
                    resolve({ intent: 'SYSTEM_ACTION', action: 'ASSIGN_TICKET', ticketId: match[1], assignee: 'me' });
                    return;
                }
            }
            if (q.includes('mark') && q.includes('urgent')) {
                const match = q.match(/#(\w+-\w+-\w+)/);
                if (match) {
                    resolve({ intent: 'SYSTEM_ACTION', action: 'UPDATE_PRIORITY', ticketId: match[1], priority: 'urgent' });
                    return;
                }
            }
            if (q.includes('urgent')) { resolve({ intent: 'FILTER', action: 'FILTER', value: 'urgent' }); return;}
            if (q.includes('open')) { resolve({ intent: 'FILTER', action: 'FILTER', value: 'open' }); return; }
            if (q.includes('vip')) { resolve({ intent: 'FILTER', action: 'FILTER_VIP' }); return; }

            resolve({ intent: 'SEARCH', action: 'SEARCH', value: query });
        }, 300);
    });
  }
};
