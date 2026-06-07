import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@questlabs/react-sdk/dist/style.css';
import Dashboard from './pages/Dashboard';
import TicketDetail from './pages/TicketDetail';
import Login from './pages/Login';
import PublicIntake from './pages/PublicIntake';
import MemoryHub from './pages/MemoryHub';

import AppLayout from './components/layout/AppLayout';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import { useTicketStore } from './store/useTicketStore';
import { supabase } from './lib/supabaseClient';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }) => {
  const { session } = useAuthStore();
  if (!session) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  const { setSession } = useAuthStore();

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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().signOut();
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

    return () => subscription.unsubscribe();
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
      const { session, signOut } = useAuthStore.getState();
      if (session) {
        signOut();
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

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
