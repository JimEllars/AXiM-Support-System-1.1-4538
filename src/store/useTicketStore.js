import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useTicketStore = create((set, get) => ({
  tickets: [],
  currentTicket: null,
  isLoading: false,
  error: null,
  filters: { status: 'all', priority: 'all', search: '' },
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  isCoreOnline: true,
  realtimeSocketStatus: 'CLOSED',

  // --- TELEMETRY & TRACE DEEP CONTROL STATES ---
  dlqEvents: [],
  threatEvents: [], // CRITICAL FIX: Track edge security events
  clearDLQEvents: () => set({ dlqEvents: [] }), // CRITICAL FIX: Optimistic UI clearing
  activeInspectionTraceId: null,
  isInspectionModalOpen: false,
  isTerminalStreamPaused: false,

  setFilters: (newFilters) => set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  setDlqEvents: (events) => set({ dlqEvents: events }),
  toggleTerminalStream: () => set((state) => ({ isTerminalStreamPaused: !state.isTerminalStreamPaused })),
  // --- COLLABORATIVE PRESENCE STATE ---
  activeAgents: [],
  activePresenceChannel: null, // New reference tracker

  joinTicketPresence: (ticketId, agentData) => {
    const channel = supabase.channel(`ticket-presence:${ticketId}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const agents = Object.values(state).flat();
        set({ activeAgents: agents });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ ...agentData, isTyping: false });
        }
      });

    set({ activePresenceChannel: channel });
  },

  leaveTicketPresence: async () => {
    const { activePresenceChannel } = get();
    if (activePresenceChannel) {
      await activePresenceChannel.untrack();
      supabase.removeChannel(activePresenceChannel);
    }
    set({ activeAgents: [], activePresenceChannel: null });
  },

  // CRITICAL FIX: Broadcast typing states globally, not just locally
  updateTypingStatus: async (isTyping, agentData) => {
    const { activePresenceChannel } = get();
    if (activePresenceChannel) {
      await activePresenceChannel.track({ ...agentData, isTyping });
    }
  },

  fetchTickets: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) set({ error: error.message, isLoading: false });
    else set({ tickets: data, isLoading: false });
  },

  fetchLiveDLQData: async () => {
    try {
      const { data: dlqData } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'dlq_payload')
        .order('created_at', { ascending: false })
        .limit(10);
      if (dlqData) set({ dlqEvents: dlqData });

      const { data: threatData } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'threat_blocked')
        .order('created_at', { ascending: false })
        .limit(10);
      if (threatData) set({ threatEvents: threatData });
    } catch (e) {
      console.error("Telemetry fetch failed", e);
    }
  },

  subscribeToDLQChanges: () => {
    const channel = supabase
      .channel('global-telemetry-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events_ax2024' }, (payload) => {
        set((state) => {
           if (payload.new.type === 'dlq_payload') {
             const exists = state.dlqEvents.find(e => e.id === payload.new.id);
             return exists ? state : { dlqEvents: [payload.new, ...state.dlqEvents].slice(0, 10) };
           }
           if (payload.new.type === 'threat_blocked') {
             const exists = state.threatEvents.find(e => e.id === payload.new.id);
             return exists ? state : { threatEvents: [payload.new, ...state.threatEvents].slice(0, 10) };
           }
           return state;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events_ax2024' }, (payload) => {
        set((state) => ({ dlqEvents: state.dlqEvents.filter(e => e.id !== payload.old.id) }));
      })
      .subscribe((status) => {
        set({ realtimeSocketStatus: status });
      });

    return () => supabase.removeChannel(channel);
  },

  subscribeToTicketQueue: () => {
    const channel = supabase
      .channel('global-ticket-feed')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets'
      }, (payload) => {
        set((state) => {
          let updatedTickets = [...state.tickets];

          if (payload.eventType === 'INSERT') {
            // Prevent duplicates
            if (!updatedTickets.find(t => t.id === payload.new.id)) {
              updatedTickets = [payload.new, ...updatedTickets];
            }
          } else if (payload.eventType === 'UPDATE') {
            updatedTickets = updatedTickets.map(t =>
              t.id === payload.new.id ? { ...t, ...payload.new } : t
            );
          } else if (payload.eventType === 'DELETE') {
            updatedTickets = updatedTickets.filter(t => t.id !== payload.old.id);
          }

          return { tickets: updatedTickets };
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  },


  subscribeToMessages: (ticketId) => {
    const channel = supabase
      .channel(`messages-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ticket_messages',
        filter: `ticket_id=eq.${ticketId}`
      }, (payload) => {
        set((state) => {
          // Ensure we don't duplicate messages already added optimistically
          const exists = state.currentTicketMessages?.find(m => m.id === payload.new.id);
          if (exists) return state;
          return { currentTicketMessages: [...(state.currentTicketMessages || []), payload.new] };
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  triggerDeepTraceInspection: (traceId) => set({
    activeInspectionTraceId: traceId,
    isInspectionModalOpen: true
  }),

  setCoreOnlineStatus: (status) => set({ isCoreOnline: status }),

  subscribeToTicketChanges: () => {
    const channel = supabase
      .channel('global-tickets-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, (payload) => {
        set((state) => ({ tickets: [payload.new, ...state.tickets] }));
        // Optional: Dispatch a global toast event here if required by the UI layer
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, (payload) => {
        set((state) => ({
          tickets: state.tickets.map(t => t.id === payload.new.id ? payload.new : t),
          currentTicket: state.currentTicket?.id === payload.new.id ? payload.new : state.currentTicket
        }));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
}));
