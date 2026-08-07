import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';

const playAlertChime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // AudioContext silent fallback if user interaction hasn't occurred yet
  }
};

export const useTicketStore = create((set, get) => ({
  tickets: [],
  activeTicket: null,
  activeThreadMessages: [],
  isLoading: false,
  error: null,
  realtimeStatus: 'DISCONNECTED', // 'SUBSCRIBED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'

  activeAgents: [],
  presenceChannel: null,

  trackPresence: async (ticketId, userEmail) => {
    let channel = get().presenceChannel;

    if (!channel) {
      channel = supabase.channel('axim_agent_presence');

      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const allAgents = [];

        Object.keys(presenceState).forEach((key) => {
          const presences = presenceState[key];
          if (presences && presences.length > 0) {
            allAgents.push(presences[0]);
          }
        });

        set({ activeAgents: allAgents });
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            ticket_id: ticketId,
            email: userEmail,
            is_typing: false,
            timestamp: new Date().toISOString()
          });
        }
      });

      set({ presenceChannel: channel });
    } else {
      if (channel.state === 'joined') {
        await channel.track({
          ticket_id: ticketId,
          email: userEmail,
          is_typing: false,
          timestamp: new Date().toISOString()
        });
      }
    }
  },

  untrackPresence: async () => {
    const channel = get().presenceChannel;
    if (channel && channel.state === 'joined') {
      await channel.untrack();
    }
  },

  updateTypingStatus: async (isTyping) => {
    const channel = get().presenceChannel;
    if (channel && channel.state === 'joined') {
      const state = channel.presenceState();
      let currentUserEmail = null;
      let currentTicketId = null;

      // Attempt to get userEmail and ticketId from the current active user's presence state
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;

      if (email) {
          Object.keys(state).forEach((key) => {
            const presences = state[key];
            if (presences && presences.length > 0) {
              if (presences[0].email === email) {
                  currentTicketId = presences[0].ticket_id;
              }
            }
          });

          if (currentTicketId) {
              await channel.track({
                ticket_id: currentTicketId,
                email: email,
                is_typing: isTyping,
                timestamp: new Date().toISOString()
              });
          }
      }
    }
  },

  triggerDesktopNotification: async (title, body) => {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/email/preferences`);
      if (res.ok) {
        const data = await res.json();
        if (data.preferences?.desktop_notifications_enabled) {
          new Notification(title, { body });
        }
      }
    } catch (err) {
      console.error("Failed to check preferences for desktop notification", err);
    }
  },



  checkPrefsAndPlayChime: async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/email/preferences`);
      if (res.ok) {
        const data = await res.json();
        if (data.preferences?.sound_alerts_enabled) {
          playAlertChime();
        }
      }
    } catch (err) {
      console.error("Failed to check preferences for audio alert", err);
    }
  },

  fetchTickets: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ tickets: data || [], isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectTicket: async (ticketId) => {
    set({ isLoading: true, error: null });
    try {
      const { data: ticket, error: ticketErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketErr) throw ticketErr;

      const { data: messages, error: msgErr } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;

      set({ activeTicket: ticket, activeThreadMessages: messages || [], isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  subscribeToRealtime: () => {
    set({ realtimeStatus: 'CONNECTING' });

    const ticketChannel = supabase
      .channel('public:support_tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          const { tickets, activeTicket } = get();

          if (eventType === 'INSERT') {
            set({ tickets: [newRecord, ...tickets] });
          } else if (eventType === 'UPDATE') {
            const updatedTickets = tickets.map((t) => (t.id === newRecord.id ? newRecord : t));
            set({ tickets: updatedTickets });
            if (activeTicket?.id === newRecord.id) {
              set({ activeTicket: newRecord });
            }
          } else if (eventType === 'DELETE') {
            set({ tickets: tickets.filter((t) => t.id !== oldRecord.id) });
            if (activeTicket?.id === oldRecord.id) {
              set({ activeTicket: null, activeThreadMessages: [] });
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') set({ realtimeStatus: 'SUBSCRIBED' });
        if (status === 'CHANNEL_ERROR') set({ realtimeStatus: 'ERROR' });
      });

    const messageChannel = supabase
      .channel('public:ticket_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages' },
        (payload) => {
          const { new: newMsg } = payload;
          const { activeTicket, activeThreadMessages } = get();

          if (activeTicket && newMsg.ticket_id === activeTicket.id) {
            if (!activeThreadMessages.some((m) => m.id === newMsg.id)) {
              set({ activeThreadMessages: [...activeThreadMessages, newMsg] });
            }
          }
        }
      )
      .subscribe();

    const hitlChannel = supabase
      .channel('public:hitl_audit_logs')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hitl_audit_logs' },
        (payload) => {
          const { new: hitlRecord } = payload;
          if (hitlRecord?.metadata?.executive_responder) {
            const statusUpper = hitlRecord.status?.toUpperCase() || 'UPDATED';
            toast(`👤 Executive Directive: ${statusUpper} for ${hitlRecord.tool_type || 'Action'}`, {
              icon: hitlRecord.status === 'approved' ? '⚡' : '🚫',
              style: {
                background: '#09090b',
                color: hitlRecord.status === 'approved' ? '#10b981' : '#f43f5e',
                border: `1px solid ${hitlRecord.status === 'approved' ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'}`
              },
              duration: 5000
            });
            get().fetchTickets();
          }
        }
      )
      .subscribe();

    const eventsChannel = supabase
      .channel('public:events_ax2024')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events_ax2024' },
        (payload) => {
          const { new: newEvent } = payload;
          if (newEvent?.type === 'thread_executive_briefing_exported') {
            window.dispatchEvent(new CustomEvent('axim:briefing_exported', { detail: newEvent }));
            toast("📋 Executive Briefing Dispatched", {
              style: { background: '#09090b', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }
            });
          } else if (newEvent?.type === 'support_ticket_ingested_and_notified') {
            toast("📨 Ingestion Notification Dispatched", {
              style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
            });
            get().fetchTickets();
          } else if (newEvent?.type === 'sla_warning_threshold_breached' || newEvent?.type === 'sla_breach_escalated') {
            get().checkPrefsAndPlayChime();
            if (newEvent?.type === 'sla_warning_threshold_breached') {
              get().triggerDesktopNotification('⚠️ SLA Warning Horizon', `Ticket #${newEvent.payload?.ticket_id || 'ID'} is due within 1 hour!`);
            } else if (newEvent?.type === 'sla_breach_escalated') {
              get().triggerDesktopNotification('🚨 SLA BREACH ESCALATED', `Ticket #${newEvent.payload?.ticket_id || 'ID'} has breached SLA!`);
            }


            if (newEvent?.type === 'sla_warning_threshold_breached') {
              toast(`⚠️ SLA Warning Horizon: Ticket #${newEvent.payload?.ticket_id || 'ID'} is due within 1 hour!`, {
                style: { background: '#09090b', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' },
                duration: 5000
              });
            } else if (newEvent?.type === 'sla_breach_escalated') {
              toast(`🚨 SLA BREACH ESCALATED: Ticket #${newEvent.payload?.ticket_id || 'ID'} has breached SLA!`, {
                style: { background: '#09090b', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
                duration: 7000
              });
            }
            get().fetchTickets();
          } else if (newEvent?.type === 'kv_cache_auto_purged') {
            toast(`🧹 Automated Maintenance: Edge KV Cache Purged`, {
              icon: '⚙️',
              style: { background: '#09090b', color: '#a1a1aa', border: '1px solid rgba(161,161,170,0.3)' },
              duration: 3500
            });
          } else if (newEvent?.type === 'kv_cache_purged_by_admin') {
            toast(`⚡ Cloudflare KV Cache Purged by ${newEvent.payload?.operator || 'Administrator'}`, {
              icon: '🧹',
              style: { background: '#09090b', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
              duration: 4000
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(hitlChannel);
      supabase.removeChannel(eventsChannel);
      set({ realtimeStatus: 'DISCONNECTED' });
    };
  }
}));
