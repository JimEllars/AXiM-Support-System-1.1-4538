import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useAuthStore = create((set) => ({
  user: null,
  session: null,
  activeOrganization: null, // NEW
  isAuthenticated: false,

  setSession: async (session) => {
    if (!session) {
      set({ session: null, user: null, activeOrganization: null, isAuthenticated: false });
      return;
    }

    // Fetch user's organization profile
    const { data: profile } = await supabase.from('team_profiles').select('organization_id').eq('id', session.user.id).single();

    set({
      user: session.user,
      session: session,
      activeOrganization: profile?.organization_id || null,
      isAuthenticated: true
    });
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Fetch user's organization profile
    const { data: profile } = await supabase.from('team_profiles').select('organization_id').eq('id', data.user.id).single();

    set({
      user: data.user,
      session: data.session,
      activeOrganization: profile?.organization_id || null,
      isAuthenticated: true
    });

    return { data, error: null };
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, activeOrganization: null, isAuthenticated: false });
  }
}));
