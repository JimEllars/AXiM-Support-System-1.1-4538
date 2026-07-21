import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useTicketStore = create((set, get) => ({
  // --- REQUIRED BY NEW CODE ---
  tickets: [],
  activeTicket: null,
  activeThreadMessages: [],
  isLoading: false,
  error: null,
  realtimeStatus: 'DISCONNECTED', // 'SUBSCRIBED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'

  // Fetch initial ticket list
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

  // Select active ticket and fetch thread messages
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

  // Initialize Realtime Replication Subscriptions
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
        if (status === 'SUBSCRIBED') {
          set({ realtimeStatus: 'SUBSCRIBED', realtimeSocketStatus: 'SUBSCRIBED' });
        }
        if (status === 'CHANNEL_ERROR') {
          set({ realtimeStatus: 'ERROR', realtimeSocketStatus: 'ERROR' });
        }
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
            // Deduplicate incoming realtime messages
            if (!activeThreadMessages.some((m) => m.id === newMsg.id)) {
              set({ activeThreadMessages: [...activeThreadMessages, newMsg] });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
      supabase.removeChannel(messageChannel);
      set({ realtimeStatus: 'DISCONNECTED', realtimeSocketStatus: 'DISCONNECTED' });
    };
  },


  // --- EXISTING CODE TO NOT BREAK THE BUILD ---
  currentTicket: null,
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

  subscribeToTicketQueue: () => get().subscribeToRealtime(),

  triggerDeepTraceInspection: (traceId) => set({
    activeInspectionTraceId: traceId,
    isInspectionModalOpen: true
  }),

  setCoreOnlineStatus: (status) => set({ isCoreOnline: status }),

  // added by Jules to not break existing frontend code
  subscribeToTickets: () => get().subscribeToRealtime(),
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
