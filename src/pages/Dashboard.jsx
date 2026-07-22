import React, { useEffect } from 'react';
import { useTicketStore } from '../store/useTicketStore';
import TicketList from '../components/TicketList';
import TicketDetail from './TicketDetail';
import SupportMetrics from '../components/analytics/SupportMetrics';
import DashboardQuickActions from '../components/DashboardQuickActions';
import { FiRadio } from 'react-icons/fi';

export default function Dashboard() {
  const {
    fetchTickets,
    subscribeToRealtime,
    realtimeStatus,
    activeTicket
  } = useTicketStore();

  useEffect(() => {
    // 1. Fetch initial ticket queue
    fetchTickets();

    // 2. Auto-mount Realtime WebSocket subscription channel
    const unsubscribe = subscribeToRealtime();

    // 3. Clean up WebSocket connection on component unmount
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchTickets, subscribeToRealtime]);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Realtime Stream Status Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <FiRadio className={`text-xs ${realtimeStatus === 'SUBSCRIBED' ? 'text-emerald-400 animate-pulse' : realtimeStatus === 'CONNECTING' ? 'text-amber-400 animate-spin' : 'text-zinc-500'}`}/>
          <span className="text-[11px] font-mono font-bold uppercase text-zinc-400">
            Realtime Stream: {realtimeStatus}
          </span>
        </div>
        <DashboardQuickActions/>
      </div>

      {/* Analytics Overview Cards */}
      <SupportMetrics/>

      {/* Main HUD Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[600px]">
        <div className="lg:col-span-5 xl:col-span-4 h-full overflow-y-auto">
          <TicketList/>
        </div>
        <div className="lg:col-span-7 xl:col-span-8 h-full">
          {activeTicket ? (
            <TicketDetail ticketId={activeTicket.id}/>
          ) : (
            <div className="h-full flex items-center justify-center rounded-3xl border border-zinc-800/80 bg-zinc-950/40 p-8 text-center text-zinc-500 font-mono text-xs">
              Select a ticket from the queue to enter the workstation HUD.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
