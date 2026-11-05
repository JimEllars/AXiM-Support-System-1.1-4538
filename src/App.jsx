import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Phase 161: `@questlabs/react-sdk/dist/style.css` used to be imported here.
// Nothing in `src/` renders a Quest/HelpHub component, so the only thing that
// import did was push a 2.03 MB stylesheet (1.56 MB of it a single inline
// base64 PNG for `.question-input-cont`) into every visitor's critical path.
//
// Phase 162: every page was imported statically too, so a visitor landing on
// `/login` or the public `/submit` form also downloaded the whole operator HUD —
// TicketDetail, the analytics panels (recharts) and the 28 kB live chat panel —
// before the first paint. Routes are split now; each page is fetched on
// navigation, and the authenticated HUD is never shipped to a public visitor.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Login = lazy(() => import('./pages/Login'));
const PublicIntake = lazy(() => import('./pages/PublicIntake'));
const MemoryHub = lazy(() => import('./pages/MemoryHub'));

import AppLayout from './components/layout/AppLayout';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from './store/useAuthStore';


import { useTicketStore } from './store/useTicketStore';
import { supabase } from './lib/supabaseClient';
import { useState } from 'react';

const queryClient = new QueryClient();

/**
 * Shared suspense fallback. Deliberately the same skeleton the auth bootstrap
 * already renders, so a route chunk arriving late is indistinguishable from
 * session hydration rather than a layout jump.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 animate-pulse border border-zinc-800" />
      <div className="w-48 h-4 rounded-full bg-zinc-900 animate-pulse" />
      <div className="w-32 h-3 rounded-full bg-zinc-900 animate-pulse" />
    </div>
  );
}

const ProtectedRoute = ({ children }) => {
  const { session } = useAuthStore();
  if (!session) return <Navigate to="/login" replace />;
  return children;
};

function AuthListener({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/login', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return children;
}

function App() {
  const { setSession, isInitialized } = useAuthStore();
  const [activeOutage, setActiveOutage] = useState(null);

  useEffect(() => {
    const channel = supabase.channel('public:events_ax2024:outage')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events_ax2024',
        filter: 'type=eq.system_broadcast'
      }, (payload) => {
        if (payload.new && payload.new.payload) {
           const p = typeof payload.new.payload === 'string' ? JSON.parse(payload.new.payload) : payload.new.payload;
           if (p.active_outage === true) {
              setActiveOutage(p.message || 'CRITICAL FLEET OUTAGE ACTIVE');
           } else if (p.active_outage === false) {
              setActiveOutage(null);
           }
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        supabase.from('team_profiles').upsert({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.email.split('@')[0],
            department: 'General Support'
        }).then(() => {}, console.error);
      }
    });

    // Listen for auth changes
    // Start watchdog
    const cleanupWatchdog = useAuthStore.getState().startTokenWatchdog();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().logout();
        useTicketStore.setState({ tickets: [], selectedTicketIds: [] });
      } else if (session?.user) {
        supabase.from('team_profiles').upsert({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.email.split('@')[0],
            department: 'General Support'
        }).then(() => {}, console.error);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (cleanupWatchdog) cleanupWatchdog();
    };
  }, [setSession]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Cmd/Ctrl + K for command palette (mock or set state if store has it)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Here we would open Command Hub, could dispatch custom event
        window.dispatchEvent(new CustomEvent('open-command-hub'));
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        // Here we could close active modals
        window.dispatchEvent(new CustomEvent('close-modals'));
      }

      // Cmd/Ctrl + N to create new ticket
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-create-ticket'));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    let timeout;

    const logoutUser = () => {
      const { session, logout } = useAuthStore.getState();
      if (session) {
        logout();
        useTicketStore.setState({ tickets: [], selectedTicketIds: [] });
        import('react-hot-toast').then(({ default: toast }) => {
          toast.error("Session expired due to inactivity.");
        });
      }
    };

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(logoutUser, 15 * 60 * 1000); // 15 minutes
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    // Initialize timer
    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, []);


  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 space-y-6">
         <div className="w-16 h-16 rounded-2xl bg-zinc-900 animate-pulse border border-zinc-800" />
         <div className="w-48 h-4 rounded-full bg-zinc-900 animate-pulse" />
         <div className="w-32 h-3 rounded-full bg-zinc-900 animate-pulse" />
      </div>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {activeOutage && (
          <div className="bg-rose-500/10 text-rose-400 border-b border-rose-500/30 animate-pulse font-mono text-xs text-center py-2 z-[100] relative w-full top-0 left-0">
            [ OUTAGE BROADCAST ] {activeOutage}
          </div>
        )}
        <AuthListener>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/submit" element={<PublicIntake />} />

              <Route path="/" element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/ticket/:id" element={
                <ProtectedRoute>
                  <AppLayout>
                    <TicketDetail />
                  </AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/memory" element={
                <ProtectedRoute>
                  <AppLayout>
                    <MemoryHub />
                  </AppLayout>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </AuthListener>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
