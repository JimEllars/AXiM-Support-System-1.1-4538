import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@questlabs/react-sdk/dist/style.css';
import Dashboard from './pages/Dashboard';
import TicketDetail from './pages/TicketDetail';
import Login from './pages/Login';
import AppLayout from './components/layout/AppLayout';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
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
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

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
        </Routes>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
