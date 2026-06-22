import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import CoreHealthIndicator from './CoreHealthIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(true);
  const [hasImminentBreach, setHasImminentBreach] = useState(false);

  useEffect(() => {
    const urgentChannel = supabase.channel('global:urgent_alerts')
      .on('system', { event: '*' }, (payload) => {
        if (payload.status === 'error' || payload.status === 'closed') {
          setIsSocketConnected(false);
        }
      })
      .on('SUBSCRIBE_ERROR', () => setIsSocketConnected(false))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets', filter: "priority=eq.urgent" }, (payload) => {
        toast.error(`🚨 URGENT TICKET: ${payload.new.subject}`, {
          duration: 10000,
          style: { background: '#7f1d1d', color: '#fff', border: '1px solid #ef4444' }
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsSocketConnected(true);
        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') setIsSocketConnected(false);
      });

    return () => supabase.removeChannel(urgentChannel);
  }, []);

  useEffect(() => {
    const checkSLAStatus = async () => {
      const { data } = await supabase
        .from('support_tickets')
        .select('sla_breach_at')
        .in('status', ['open', 'pending']);

      if (data) {
        const nearBreach = data.some(ticket => {
          const remainingMs = new Date(ticket.big_breach_at || ticket.sla_breach_at).getTime() - Date.now();
          return remainingMs > 0 && remainingMs <= 15 * 60 * 1000;
        });
        setHasImminentBreach(nearBreach);
      }
    };
    checkSLAStatus();
    const interval = setInterval(checkSLAStatus, 60000);
    return () => clearInterval(interval);
  }, []);



  return (
    <div className="min-h-screen bg-black">
      {hasImminentBreach && (
        <div className="w-full bg-rose-950/40 border-b border-rose-500/30 text-rose-400 font-mono text-[10px] uppercase font-black text-center py-1.5 tracking-widest animate-pulse z-[100]">
          ⚠️ CRITICAL ATTENTION REQUIRED: SYSTEM SLA BREACH IMMINENT ON LIVE CASE CHANNELS
        </div>
      )}

      {!isSocketConnected && (
        <div className="bg-rose-500 text-white text-[10px] font-bold uppercase tracking-widest text-center py-1">
          ⚠️ WebSocket connection lost. Reconnecting...
        </div>
      )}
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
