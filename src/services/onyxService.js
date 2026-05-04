/**
 * Onyx AI Frontend Service - Enhanced
 * Logic for Edge Triage, Command Hub, and RAG Suggestions
 */

const ONYX_WORKER_URL = import.meta.env.VITE_ONYX_WORKER_URL;
const ONYX_SECRET = "onyx_local_dev_secret";

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
    // In a real scenario, this would call the Cloudflare worker with the ticket context.
    // We mock it for the client layer logic simulation.
    return new Promise(resolve => setTimeout(() => {
        resolve({
            draft: `Hello ${ticketData.contacts_ax2024?.name || 'there'},\n\nOnyx has analyzed your issue regarding "${ticketData.subject}". I am looking into this right now and will update you shortly.\n\nBest,\nSupport Team`
        });
    }, 1000));
  },

  async getKBSuggestions(subject, description) {
    // Simulated RAG retrieval from AXiM Knowledge Base
    await new Promise(resolve => setTimeout(resolve, 800));
    return [
      { id: 1, title: "Resetting AXiM Core Node Auth", relevance: 98 },
      { id: 2, title: "Billing Tier Migration Guide", relevance: 85 },
      { id: 3, title: "Onyx API Rate Limit Documentation", relevance: 72 }
    ];
  },

  async parseCommand(query) {
    // In production, this would route to Cloudflare Workers for NLP parsing
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
