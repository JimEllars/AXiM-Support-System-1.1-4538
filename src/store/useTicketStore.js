import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useTicketStore = create((set, get) => ({
  tickets: [],
  currentTicket: null,
  isLoading: false,
  error: null,
  filters: { status: 'all', priority: 'all', search: '' },
  isCoreOnline: true,
  realtimeSocketStatus: 'INITIALIZING', // CRITICAL FIX: Track live multiplayer socket states

  // --- TELEMETRY & TRACE DEEP CONTROL STATES ---
  dlqEvents: [],
  clearDLQEvents: () => set({ dlqEvents: [] }),
  activeInspectionTraceId: null,
  isInspectionModalOpen: false,
  isTerminalStreamPaused: false,

  setFilters: (newFilters) => set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  setDlqEvents: (events) => set({ dlqEvents: events }),
  toggleTerminalStream: () => set((state) => ({ isTerminalStreamPaused: !state.isTerminalStreamPaused })),

  // --- COLLABORATIVE PRESENCE STATE ---
  activeAgents: [],
  activePresenceChannel: null,

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
      activePresenceChannel.untrack().catch(() => {});
      supabase.removeChannel(activePresenceChannel);
    }
    set({ activeAgents: [], activePresenceChannel: null });
  },

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

  // CRITICAL FIX: Consolidated high-performance ticket subscription loop with health hooks
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

          // Dynamically synchronize current ticket state to prevent deep context drift
          const currentTicketUpdate = state.currentTicket?.id === payload.new?.id ? payload.new : state.currentTicket;

          return {
            tickets: updatedTickets,
            currentTicket: currentTicketUpdate
          };
        });
      })
      .subscribe((status) => {
        // Expose live socket status matrices to the core health panel
        set({ realtimeSocketStatus: status });
      });

    return () => supabase.removeChannel(channel);
  },

  triggerDeepTraceInspection: (traceId) => set({
    activeInspectionTraceId: traceId,
    isInspectionModalOpen: true
  }),

  setCoreOnlineStatus: (status) => set({ isCoreOnline: status }),

  // added by Jules to not break existing frontend code
  subscribeToTickets: () => get().subscribeToTicketQueue(),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectedTicketIds: [],
  setSelectedTicketIds: (ids) => set({ selectedTicketIds: ids }),
  toggleSelectedTicketId: (id) => set((state) => {
      const selected = state.selectedTicketIds.includes(id)
          ? state.selectedTicketIds.filter(tId => tId !== id)
          : [...state.selectedTicketIds, id];
      return { selectedTicketIds: selected };
  }),
}));
