import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useTicketStore = create((set, get) => ({
  tickets: [],
  currentTicket: null,
  isLoading: false,
  error: null,
  filters: { status: 'all', priority: 'all', search: '' },
  isCoreOnline: true,

  // --- TELEMETRY & TRACE DEEP CONTROL STATES ---
  dlqEvents: [],
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
    const { data, error } = await supabase
      .from('events_ax2024')
      .select('*')
      .eq('type', 'dlq_payload')
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && data) set({ dlqEvents: data });
  },

  subscribeToDLQChanges: () => {
    const channel = supabase
      .channel('global-dlq-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events_ax2024',
        filter: "type=eq.dlq_payload"
      }, (payload) => {
        set((state) => {
           const updatedDLQ = [payload.new, ...state.dlqEvents].slice(0, 10);
           return { dlqEvents: updatedDLQ };
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
