import { create } from 'zustand';

export const useTicketStore = create((set) => ({
  selectedTicketId: null,
  setSelectedTicketId: (id) => set({ selectedTicketId: id }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));