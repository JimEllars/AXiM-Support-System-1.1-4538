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
  const [hasNearBreachSla, setHasNearBreachSla] = useState(false);

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
    const checkSlaStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('sla_breach_at')
          .in('status', ['open', 'pending'])
          .not('sla_breach_at', 'is', null);

        if (error) throw error;

        if (data && data.length > 0) {
          const now = new Date();
          const hasBreach = data.some(ticket => {
            const breachTime = new Date(ticket.sla_breach_at);
            const diffMinutes = (breachTime - now) / (1000 * 60);
            return diffMinutes <= 15 && diffMinutes >= -1440; // less than 15 mins to breach, or breached within last 24h
          });
          setHasNearBreachSla(hasBreach);
        } else {
          setHasNearBreachSla(false);
        }
      } catch (err) {
        console.error('Error checking SLA status:', err);
      }
    };

    checkSlaStatus();

    const slaChannel = supabase.channel('sla_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        checkSlaStatus();
      })
      .subscribe();

    const interval = setInterval(checkSlaStatus, 60000); // Check every minute

    return () => {
      supabase.removeChannel(slaChannel);
      clearInterval(interval);
    };
  }, []);



  return (
    <div className="min-h-screen bg-black">
      {hasNearBreachSla && (
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
