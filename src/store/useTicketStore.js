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
