import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTicketStore } from '../store/useTicketStore';
import TicketList from '../components/TicketList';
import OnyxCommandHub from '../components/OnyxCommandHub';
import CreateTicketModal from '../components/CreateTicketModal';
import BatchTriageModal from '../components/modals/BatchTriageModal';
import SystemBroadcastModal from '../components/modals/SystemBroadcastModal';
import PayloadTraceInspectorModal from '../components/modals/PayloadTraceInspectorModal';
import SupportMetrics from '../components/analytics/SupportMetrics';
import DLQMonitorBlock from '../components/tickets/DLQMonitorBlock';
import AgentPresence from '../components/AgentPresence';
import DashboardQuickActions from '../components/DashboardQuickActions';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiInbox, FiPlus, FiActivity, FiLayers } = FiIcons;

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setFilters, filters, assigneeFilter, setAssigneeFilter, slaRiskFilter, setSlaRiskFilter, fetchTickets, subscribeToDLQChanges, subscribeToTicketQueue } = useTicketStore();
  const [modalType, setModalType] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeQueue, setActiveQueue] = useState('All');
  const [sessionUser, setSessionUser] = useState(null);
  const queueTabs = ['All', 'Engineering', 'Legal_Operations', 'Financial_Systems', 'General Support'];

  useEffect(() => {
    // Fetch live session identity
    supabase.auth.getUser().then(({ data }) => setSessionUser(data?.user));

    // Initial data load
    fetchTickets();

    // CRITICAL FIX: Mount real-time WebSockets for Live Triage
    const unsubscribeDLQ = subscribeToDLQChanges();
    const unsubscribeTickets = subscribeToTicketQueue();

    return () => {
      if (unsubscribeDLQ) unsubscribeDLQ();
      if (unsubscribeTickets) unsubscribeTickets();
    };
  }, [fetchTickets, subscribeToDLQChanges, subscribeToTicketQueue]);

  const handleAction = (id) => {
    if (id === 'triage') setModalType('batch');
    if (id === 'broadcast') setModalType('broadcast');
  };

  const currentAgent = {
    agentId: sessionUser?.id || 'pending-auth',
    name: sessionUser?.email?.split('@')[0] || 'AXiM Agent',
    role: 'Support Engineer',
    color: 'bg-cyan-500',
  };

  return (
    <div className="min-h-screen selection:bg-cyan-500/30 pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[150px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-fuchsia-500/5 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-12 py-12">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-zinc-900 border-2 border-cyan-500/50 rounded-2xl flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <SafeIcon icon={FiInbox} className="text-3xl" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-3">
                AXiM <span className="text-cyan-400">SUPPORT</span>
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  <SafeIcon icon={FiActivity} className="text-emerald-500" /> HUB_AX_01: ONLINE
                </div>
                <div className="w-1 h-1 rounded-full bg-zinc-800" />
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Onyx Layer active</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <AgentPresence ticketId="dashboard" currentAgent={currentAgent} />
            <button 
              onClick={() => setModalType('create')}
              className="group relative px-8 py-3.5 bg-cyan-600 hover:bg-cyan-500 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] active:scale-95 overflow-hidden"
            >
              <div className="relative z-10 flex items-center gap-2">
                <SafeIcon icon={FiPlus} />
                Ingest Case
              </div>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
          </div>
        </header>

        <div className="space-y-6">
          <SupportMetrics />
          <DLQMonitorBlock />

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 backdrop-blur-xl">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-10">
              <DashboardQuickActions onAction={handleAction} />
            </div>

            <OnyxCommandHub />

            <main className="glass-panel rounded-[3rem] p-12 border-zinc-800/40">
          <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500">
                <SafeIcon icon={FiLayers} className="text-xl" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">{t('dashboard.recent_tickets', 'Recent Tickets')}</h2>
                <div className="flex items-center gap-2 text-[10px] font-black text-cyan-400/70 uppercase tracking-[0.2em] mt-0.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                   Real-time Synchronization
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {queueTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveQueue(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeQueue === tab
                      ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30'
                      : 'text-zinc-400 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* CRITICAL FIX: Mount status filters tied to Zustand */}
            <div className="flex items-center gap-2 p-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl w-max shadow-inner">
              {['all', 'open', 'pending', 'resolved'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilters({ status })}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    (filters?.status || 'all') === status
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.1)]'
                      : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <TicketList onSelectTicket={(id) => navigate(`/ticket/${id}`)} activeQueue={activeQueue} statusFilter={filters?.status || 'all'} />
        </main>
          </div>
        </div>
      </div>

      <CreateTicketModal 
        isOpen={modalType === 'create'} 
        onClose={() => setModalType(null)}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />

      <BatchTriageModal 
        isOpen={modalType === 'batch'} 
        onClose={() => setModalType(null)}
      />

      <SystemBroadcastModal 
        isOpen={modalType === 'broadcast'} 
        onClose={() => setModalType(null)}
      />

      <PayloadTraceInspectorModal />
    </div>
  );
}