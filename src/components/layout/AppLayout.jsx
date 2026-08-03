import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import CoreHealthIndicator from './CoreHealthIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useTicketStore } from '../../store/useTicketStore';
import Sidebar from './Sidebar';
import OnyxCommandHub from '../OnyxCommandHub';

export default function AppLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(true);
  const [hasImminentBreach, setHasImminentBreach] = useState(false);
  const [isCommandHubOpen, setIsCommandHubOpen] = useState(false);

  const { subscribeToDLQChanges } = useTicketStore();

  useEffect(() => {
    const unsubscribe = subscribeToDLQChanges();
    return () => unsubscribe();
  }, [subscribeToDLQChanges]);

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
          const remainingMs = new Date(ticket.sla_breach_at).getTime() - Date.now();
          return remainingMs > 0 && remainingMs <= 15 * 60 * 1000; // 15 mins
        });
        setHasImminentBreach(nearBreach);
      }
    };
    checkSLAStatus();
    const interval = setInterval(checkSLAStatus, 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandHubOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);




  return (
    <div className="min-h-screen bg-black">

      {/* Global header with ⌘K Badge overlay */}
      <div className="fixed top-4 right-4 z-[90] hidden md:flex items-center gap-2 bg-zinc-900/50 backdrop-blur border border-zinc-800 rounded-lg px-3 py-1.5 pointer-events-none">
        <span className="text-zinc-500 text-xs font-mono">CMD HUD</span>
        <kbd className="bg-zinc-800 text-zinc-400 font-mono text-[10px] px-1.5 py-0.5 rounded border border-zinc-700">⌘K</kbd>
      </div>

      {hasImminentBreach && (
        <div className="w-full bg-rose-950/80 border-b border-rose-500/50 text-rose-100 font-mono text-[10px] uppercase font-black text-center py-2 tracking-[0.2em] shadow-[0_0_20px_rgba(225,29,72,0.3)] animate-pulse z-[100] relative">
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

        {/* Hidden Global Trigger for CSS badge or styling (optional) */}
        <OnyxCommandHub isOpen={isCommandHubOpen} onClose={() => setIsCommandHubOpen(false)} />
      </div>
    </div>
  );
}
