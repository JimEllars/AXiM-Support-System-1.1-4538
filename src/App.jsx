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
