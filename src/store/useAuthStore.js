import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export const useAuthStore = create((set) => ({
  user: null,
  session: null,
  activeOrganization: null, // NEW
  isAuthenticated: false,

  setSession: async (session) => {
    if (!session) {
      // Try to silently re-verify if session null arrives from a transient network blip
      const currentLocalUser = useAuthStore.getState().user;
      if (currentLocalUser) {
        try {
          const retries = 3;
          for (let i = 0; i < retries; i++) {
            try {
              const { data: { session: newSession }, error: refreshError } = await supabase.auth.getSession();
              if (!refreshError && newSession) {
                console.log("[AuthGuard] Successfully recovered transient session drop.");
                set({
                  user: newSession.user,
                  session: newSession,
                  isAuthenticated: true
                });
                return;
              }
            } catch (err) {
              console.warn(`[AuthGuard] Session retry ${i + 1} failed:`, err);
            }
            // Exponential backoff: 500ms, 1000ms, 2000ms
            await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
          }
          console.warn("[AuthGuard] Exhausted retries. Dropping session.");
        } catch (fatalErr) {
          console.error("[AuthGuard] Fatal failure during session recovery loop:", fatalErr);
        }
      }

      // If we completely exhausted retries or didn't have a user, do hard reset
      set({ session: null, user: null, activeOrganization: null, isAuthenticated: false });
      return;
    }

    const currentState = useAuthStore.getState();
    // Prevent unneeded re-fetches or clearing of activeOrganization on minor token refresh
    if (currentState.user?.id === session.user.id) {
       // Only update session without touching user/org to prevent flashing UI elements
       set({
         session: session,
         isAuthenticated: true
       });
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
