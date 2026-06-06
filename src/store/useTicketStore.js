import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

export const useTicketStore = create((set, get) => ({
  tickets: [],
  isLoading: false,
  isCoreOnline: true,
  setCoreOnlineStatus: (status) => set({ isCoreOnline: status }),
  selectedTicketId: null,
  setSelectedTicketId: (id) => set({ selectedTicketId: id }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectedTicketIds: [], // State for multi-select
  setSelectedTicketIds: (ids) => set({ selectedTicketIds: ids }),
  toggleSelectedTicketId: (id) =>
    set((state) => ({
      selectedTicketIds: state.selectedTicketIds.includes(id)
        ? state.selectedTicketIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedTicketIds, id],
    })),

  updateTicketAssignee: (ticketId, assigneeId, department) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, assigned_to: assigneeId, assigned_department: department }
          : t,
      ),
    })),

  updateLocalTicketMeta: (ticketId, assignedTo, department) =>
    set((state) => ({
      tickets: state.tickets.map(t =>
        t.id === ticketId
          ? { ...t, assigned_to: assignedTo, assigned_department: department }
          : t
      )
    })),

  fetchTickets: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, contacts_ax2024(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data.length === 0 && supabase.mock) {
        set({
          tickets: [
            {
              id: "ax-8271-bf3a",
              subject: "Node Authentication Failure",
              status: "open",
              priority: "urgent",
              created_at: new Date().toISOString(),
            },
            {
              id: "ax-9920-ca9b",
              subject: "API Rate Limit Inconsistency",
              status: "pending",
              priority: "high",
              created_at: new Date().toISOString(),
            },
            {
              id: "ax-1044-dd2c",
              subject: "Billing Tier Refresh",
              status: "resolved",
              priority: "medium",
              created_at: new Date().toISOString(),
            },
          ],
          isLoading: false,
        });
        return;
      }

      set({ tickets: data || [], isLoading: false });
    } catch (error) {
      toast.error("Failed to synchronize queue: " + error.message, {
        style: {
          background: "#18181b",
          color: "#f43f5e",
          border: "1px solid #9f1239",
        },
      });
      set({ isLoading: false });
    }
  },

  subscribeToTickets: () => {
    const channel = supabase
      .channel("public:support_tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          const currentTickets = get().tickets;

          if (eventType === "INSERT") {
            toast.success(`New Case Received: #${newRecord.id.slice(0, 8)}`, {
              style: {
                background: "#18181b",
                color: "#22d3ee",
                border: "1px solid #0891b2",
              },
            });
            set((state) => ({ tickets: [newRecord, ...state.tickets] }));
          } else if (eventType === "UPDATE") {
            toast.success(`Case Updated: #${newRecord.id.slice(0, 8)}`, {
              style: {
                background: "#18181b",
                color: "#22d3ee",
                border: "1px solid #0891b2",
              },
            });
            set((state) => ({
              tickets: state.tickets.map((t) =>
                t.id === newRecord.id ? { ...t, ...newRecord } : t,
              ),
            }));
          } else if (eventType === "DELETE") {
            set({
              tickets: currentTickets.filter((t) => t.id !== oldRecord.id),
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  unsubscribeFromTickets: () => {},

  // --- Real-Time Agent Presence ---
  presenceChannel: null,
  activeAgents: [],

  joinTicketPresence: (ticketId, currentAgent) => {
    const existingChannel = get().presenceChannel;
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
    }

    const channelName = `ticket-presence:${ticketId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentAgent.agentId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const active = [];
        for (const id in presenceState) {
          active.push(presenceState[id][0]); // take the first presence per agent
        }
        set({ activeAgents: active });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            agentId: currentAgent.agentId,
            name: currentAgent.name,
            role: currentAgent.role || "Agent",
            color: currentAgent.color || "bg-cyan-500",
            isTyping: false,
          });
        }
      });

    set({ presenceChannel: channel });
  },

  updateTypingStatus: async (isTyping, currentAgent) => {
    const channel = get().presenceChannel;
    if (channel) {
      await channel.track({
        ...currentAgent,
        isTyping,
      });
    }
  },

  leaveTicketPresence: () => {
    const channel = get().presenceChannel;
    if (channel) {
      supabase.removeChannel(channel);
      set({ presenceChannel: null, activeAgents: [] });
    }
  },
}));
