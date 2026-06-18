import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import CoreHealthIndicator from './CoreHealthIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

export default function AppLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const urgentChannel = supabase.channel('global:urgent_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets', filter: "priority=eq.urgent" }, (payload) => {
        toast.error(`🚨 URGENT TICKET: ${payload.new.subject}`, {
          duration: 10000,
          style: { background: '#7f1d1d', color: '#fff', border: '1px solid #ef4444' }
        });
      })
      .subscribe();

    return () => supabase.removeChannel(urgentChannel);
  }, []);


  return (
    <div className="min-h-screen bg-black">
      <div className="md:hidden p-4 bg-zinc-950 flex items-center justify-between border-b border-zinc-900 z-[70] relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-black">
            <SafeIcon icon={FiIcons.FiZap} className="text-xl" />
          </div>
          <span className="text-white font-black uppercase tracking-widest text-xs">AXiM Support</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-zinc-400 hover:text-white p-2">
          <SafeIcon icon={isSidebarOpen ? FiIcons.FiX : FiIcons.FiMenu} className="text-2xl" />
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="md:pl-24 transition-all">
        <CoreHealthIndicator />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  );
}
