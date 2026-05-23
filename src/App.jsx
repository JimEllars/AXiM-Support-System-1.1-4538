import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@questlabs/react-sdk/dist/style.css';
import Dashboard from './pages/Dashboard';
import TicketDetail from './pages/TicketDetail';
import AppLayout from './components/layout/AppLayout';
import { Toaster } from 'react-hot-toast';
import { useTicketStore } from './store/useTicketStore';

const queryClient = new QueryClient();

function App() {
  const { subscribeToTickets, unsubscribeFromTickets } = useTicketStore();

  useEffect(() => {
    console.log('[App] Setting up subscriptions');
    subscribeToTickets();

    return () => {
      console.log('[App] Cleaning up subscriptions');
      unsubscribeFromTickets();
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ticket/:id" element={<TicketDetail />} />
          </Routes>
        </AppLayout>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
