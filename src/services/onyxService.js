import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';
import toast from 'react-hot-toast';

/**
 * Onyx AI Frontend Service - Enhanced
 * Logic for Edge Triage, Command Hub, and RAG Suggestions
 */

const ONYX_WORKER_URL = getEdgeWorkerUrl();
const ONYX_SECRET = import.meta.env.VITE_ONYX_SECURE_KEY;

// Safe fetch wrapper with 3000ms timeout and standardized error handling
async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeout || 3000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const traceId = crypto.randomUUID();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ONYX_SECRET}`,
    'X-Onyx-Trace-ID': traceId,
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(id);

    if (!response.ok) {
      let errorMsg = `HTTP Error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
         // ignore
      }
      return { success: false, data: null, error: errorMsg, traceId };
    }

    const data = await response.json();

    if (data && data.synthetic) {
      return { success: false, data, error: "Synthetic response (edge-cached), core unreachable", traceId, synthetic: true };
    }
    return { success: true, data, error: null, traceId };
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      return { success: false, data: null, error: 'Edge Request Timeout', traceId };
    }
    return { success: false, data: null, error: err.message, traceId };
  }
}

export const onyxService = {
  async fetchWithTimeout(url, options = {}) {
    return fetchWithTimeout(url, options);
  },

  async checkOnyxHealth() {
    const result = await fetchWithTimeout(`${ONYX_WORKER_URL}/api/v1/health`);
    if (result.synthetic || (result.data && result.data.synthetic)) {
      return { isHealthy: true, isDegraded: true, source: "edge-cache" };
    }
    return { isHealthy: true, isDegraded: false };
  },

  async createTicket(ticketData) {
    if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
      return { success: true, ticket_id: crypto.randomUUID() };
    }
    const result = await fetchWithTimeout(ONYX_WORKER_URL, {
      method: 'POST',
      body: JSON.stringify(ticketData)
    });

    if (result.success) {
      return result.data;
    }
    return result; // contains { success: false, error: ... }
  },

  async generateAutoDraft(ticketId, ticketData, messages = []) {
    try {
        // AI Privacy Guardrails & Context Windowing
        const publicMessages = messages.filter(msg => msg.is_internal_note !== true);

        const recentContext = publicMessages.slice(-5).map(msg => {
            const senderType = msg.sender_id === ticketData.customer_id ? 'Customer' : 'Agent';
            return `[${senderType}]: ${msg.message_body}`;
        });

                const result = await fetchWithTimeout(`${ONYX_WORKER_URL}/api/v1/onyx/generate-suggestion`, {
            method: 'POST',
            body: JSON.stringify({
                subject: ticketData.subject,
                description: ticketData.description,
                context_messages: recentContext
            })
        });

        if (result.success || result.synthetic) {
            let data = result.data || {};
            if (result.synthetic || result.isDegraded) {
                data.requires_hitl = true;
                data.auto_executable = false;
                toast.error("Onyx core is operating in degraded mode. Autonomous action suspended for human review.", {
                   style: { background: '#09090b', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.4)' }
                });
            }
            return data;
        }
        return { draft: "Failed to generate draft. " + result.error };
    } catch (e) {
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

    const result = await fetchWithTimeout(`${ONYX_WORKER_URL}/vector-search`, {
        method: 'POST',
        body: JSON.stringify({ query: `${subject} ${description}` })
    });

    if (result.success) {
        return result.data;
    }
    return [];
  },

  async executeBatchTriage(ticketIds) {
      if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { success: true, processed: ticketIds.length };
      }

            const health = await this.checkOnyxHealth();
      if (health.isDegraded || health.synthetic) {
          toast.error("Onyx core is operating in degraded mode. Autonomous action suspended for human review.", {
              style: { background: '#09090b', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.4)' }
          });
          return {
              success: false,
              error: "Automated resolution aborted due to degraded state. Flagged for manual HITL review.",
              flaggedForHITL: true,
              requires_hitl: true,
              auto_executable: false
          };
      }

      const result = await fetchWithTimeout(`${ONYX_WORKER_URL}/batch-triage`, {
          method: 'POST',
          body: JSON.stringify({ ticketIds })
      });
      if (result.success) {
        return result.data;
      }
      return result;
  },

  async syncTelemetryToCore(metrics) {
      try {
          const { supabase } = await import('../lib/supabaseClient');
          const { error } = await supabase.from('events_ax2024').insert({
              type: 'support_daily_rollup',
              payload: metrics
          });
          if (error) throw error;
          return { success: true, error: null };
      } catch (e) {
          return { success: false, error: e.message || 'Telemetry Sync Failed' };
      }
  },

  async parseCommand(query, ticketId = null) {
        if (ticketId && (query.toLowerCase().includes('refund') || query.toLowerCase().includes('password') || query.toLowerCase().includes('beta'))) {
        const result = await fetchWithTimeout(`${ONYX_WORKER_URL}/tool-command`, {
            method: 'POST',
            body: JSON.stringify({ command: query, ticketId })
        });

        if ((result.success || result.synthetic) && result.data?.action_proposed) {
             let data = result.data;
             if (result.synthetic) {
                data.requires_hitl = true;
                data.auto_executable = false;
                toast.error("Onyx core is operating in degraded mode. Autonomous action suspended for human review.", {
                   style: { background: '#09090b', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.4)' }
                });
             }
             return { intent: 'TOOL_PROPOSAL', success: true, ...data };
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
