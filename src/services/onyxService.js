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

  async getKBSuggestions(subject, description) {
    // Simulated RAG retrieval from AXiM Knowledge Base
    await new Promise(resolve => setTimeout(resolve, 800));
    return [
      { id: 1, title: "Resetting AXiM Core Node Auth", relevance: 98 },
      { id: 2, title: "Billing Tier Migration Guide", relevance: 85 },
      { id: 3, title: "Onyx API Rate Limit Documentation", relevance: 72 }
    ];
  },

  parseCommand(query) {
    const q = query.toLowerCase();
    if (q.includes('urgent')) return { action: 'FILTER', value: 'urgent' };
    if (q.includes('open')) return { action: 'FILTER', value: 'open' };
    if (q.includes('my')) return { action: 'FILTER', value: 'assigned_to_me' };
    return { action: 'SEARCH', value: query };
  }
};