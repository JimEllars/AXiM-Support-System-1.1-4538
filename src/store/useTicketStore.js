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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        get().fetchTickets();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
}));
