import { useTranslation } from "react-i18next";
import { onyxService } from '../services/onyxService';
import toast from 'react-hot-toast';
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';
import { useAuthStore } from '../store/useAuthStore';
import SLABadge from './tickets/SLABadge';

const { FiCircle, FiCheckCircle, FiClock, FiAlertCircle, FiSearch, FiCheckSquare, FiSquare, FiRefreshCw, FiGlobe, FiMail, FiMessageSquare } = FiIcons;

const statusStyles = {
  open: { icon: FiCircle, color: 'text-cyan-400', border: 'border-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.2)]', bg: 'bg-cyan-500/10' },
  pending: { icon: FiClock, color: 'text-amber-400', border: 'border-amber-500/20 shadow-[0_0_10px_rgba(251,191,36,0.2)]', bg: 'bg-amber-500/10' },
  resolved: { icon: FiCheckCircle, color: 'text-emerald-400', border: 'border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]', bg: 'bg-emerald-500/10' },
  closed: { icon: FiCheckCircle, color: 'text-zinc-500', border: 'border-zinc-500/30 shadow-[0_0_10px_rgba(113,113,122,0.1)]', bg: 'bg-zinc-500/5' },
};

const SkeletonLoader = () => (
  <div className="space-y-3 p-4">
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="animate-pulse bg-zinc-900/80 rounded-[2rem] p-6 border border-zinc-800 backdrop-blur-md">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default function TicketList({ onSelectTicket, activeQueue = "All" }) {
  const { t } = useTranslation();
  const { tickets, isLoading, fetchTickets, subscribeToTickets, searchQuery, selectedTicketIds, toggleSelectedTicketId } = useTicketStore();
  const { activeOrganization } = useAuthStore();
  const { user } = useAuthStore();
  const [queueFilter, setQueueFilter] = useState('unassigned');
  const [isTriaging, setIsTriaging] = useState(false);
  const previousTicketCount = useRef(tickets.length);

  // Filter tickets based on queue state, search query, and activeQueue department
  const filteredTickets = tickets.filter(ticket => {
    // 1. Department Filter
    if (activeQueue !== 'All' && ticket.assigned_department !== activeQueue) return false;

    // 2. Search Filter overrides queue filter
    if (searchQuery) return true;

    // 3. Queue State Filter
    if (queueFilter === 'unassigned') return !ticket.assigned_to;
    if (queueFilter === 'my_queue') return ticket.assigned_to === user?.id;

    return true;
  });

  // Tab notification effect
  useEffect(() => {
    if (tickets.length > previousTicketCount.current) {
        document.title = "(1) New Ticket - AXiM Support";
    }
    previousTicketCount.current = tickets.length;
  }, [tickets.length]);

  // Reset title on focus
  useEffect(() => {
    const handleFocus = () => {
      document.title = "AXiM Support System";
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleBatchTriage = async () => {
    if (selectedTicketIds.length === 0) return;
    setIsTriaging(true);

    const toastId = toast.loading(`Triaging ${selectedTicketIds.length} cases with Onyx...`, {
        style: { background: '#18181b', color: '#22d3ee', border: '1px solid #0891b2' }
    });

    try {
        const result = await onyxService.executeBatchTriage(selectedTicketIds);

        if (result && result.success) {
            useTicketStore.getState().setSelectedTicketIds([]);
            fetchTickets(activeOrganization);
            toast.success(`Successfully triaged ${selectedTicketIds.length} cases`, {
                id: toastId,
                style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
            });
        } else {
            toast.error("Batch triage failed to complete", {
                id: toastId,
                style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
            });
        }
    } catch (error) {
        toast.error("An error occurred during batch triage", {
            id: toastId,
            style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
        });
    } finally {
        setIsTriaging(false);
    }
  };


  useEffect(() => {
    fetchTickets(activeOrganization);

    const ticketChannel = supabase.channel('public:support_tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, (payload) => {
        // FIX: Prevent state leaking across tabs
        if (activeQueue === 'All' || payload.new.assigned_department === activeQueue) {
          useTicketStore.getState().setTickets((prev) => [payload.new, ...prev]);
        }
      })
      // Also handle UPDATES (e.g., status changing to resolved should remove it from open queues)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, (payload) => {
        useTicketStore.getState().setTickets((prev) => prev.map(t => t.id === payload.new.id ? payload.new : t));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
    };
  }, [isTriaging, fetchTickets, activeOrganization, activeQueue]);





  if (filteredTickets.length === 0) {
    if (searchQuery) {
        return (
          <div className="p-16 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-[2rem] bg-zinc-950/50">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-4">
              <SafeIcon icon={FiSearch} className="text-2xl" />
            </div>
            <h3 className="text-white font-black text-xl tracking-tight">No Cases Match Protocol</h3>
            <p className="text-zinc-500 font-medium text-sm mt-2">Adjust your Onyx Command Hub query.</p>
          </div>
        );
    } else {
        return (
          <>
            <div className="flex bg-zinc-900/50 p-1 rounded-xl mb-6 border border-zinc-800">
              <button
                onClick={() => setQueueFilter('unassigned')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'unassigned' ? 'bg-zinc-800 text-cyan-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Unassigned
              </button>
              <button
                onClick={() => setQueueFilter('my_queue')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'my_queue' ? 'bg-zinc-800 text-fuchsia-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                My Queue
              </button>
              <button
                onClick={() => setQueueFilter('all')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'all' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                All Cases
              </button>
            </div>
            <div className="py-24 text-center">
              <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 rounded-full bg-zinc-900/50 border border-zinc-800 flex items-center justify-center text-zinc-600 shadow-inner">
                  <SafeIcon icon={FiIcons.FiCheckCircle} className="text-2xl" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-zinc-300 font-bold tracking-wide">{t('ticket_list.empty_title', 'Inbox Zero')}</h3>
                  <p className="text-zinc-500 text-sm max-w-sm mx-auto">{t('ticket_list.empty_desc', 'All support tickets have been resolved. The AXiM queue is clear.')}</p>
                </div>
              </div>
            </div>
          </>
        );
    }
  }


  return (
    <>
      <div className="flex bg-zinc-900/50 p-1 rounded-xl mb-6 border border-zinc-800">
        <button
          onClick={() => setQueueFilter('unassigned')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'unassigned' ? 'bg-zinc-800 text-cyan-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Unassigned
        </button>
        <button
          onClick={() => setQueueFilter('my_queue')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'my_queue' ? 'bg-zinc-800 text-fuchsia-400 shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          My Queue
        </button>
        <button
          onClick={() => setQueueFilter('all')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${queueFilter === 'all' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          All Cases
        </button>
      </div>

      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex flex-1 justify-between text-zinc-400 font-bold tracking-widest text-[10px] uppercase px-4">
          <span>{t('ticket_list.subject', 'Subject')}</span>
          <div className="flex gap-12">
            <span>{t('ticket_list.priority', 'Priority')}</span>
            <span>{t('ticket_list.time', 'Time')}</span>
            <span>{t('ticket_list.status', 'Status')}</span>
          </div>
        </div>
        <button
          onClick={() => {
            if (!isTriaging && !isLoading) {
              fetchTickets(activeOrganization);
            }
          }}
          className="text-zinc-500 hover:text-cyan-400 transition-colors p-2 rounded-xl hover:bg-zinc-800/50"
          title="Manual Refresh"
        >
          <SafeIcon icon={FiRefreshCw} className={`text-lg ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
      <div className="space-y-3 bg-[#09090b]/80 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-4">
      <div className={`transition-opacity duration-300 ${isTriaging ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
      <AnimatePresence>
        {isLoading ? (
  <>
    {[1, 2, 3, 4, 5].map((i) => (
      <tr key={i} className="border-b border-zinc-800/50 flex">
        <td className="px-6 py-4 flex-1"><div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4"></div></td>
        <td className="px-6 py-4 flex-1"><div className="h-4 bg-zinc-800 rounded animate-pulse w-1/2"></div></td>
        <td className="px-6 py-4 flex-1"><div className="h-4 bg-zinc-800 rounded animate-pulse w-1/3"></div></td>
        <td className="px-6 py-4 flex-1"><div className="h-4 bg-zinc-800 rounded animate-pulse w-1/4"></div></td>
        <td className="px-6 py-4"><div className="h-8 w-8 bg-zinc-800 rounded-lg animate-pulse ml-auto"></div></td>
      </tr>
    ))}
  </>
) : filteredTickets.length === 0 ? (
          <div className="py-24 text-center">
            <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 rounded-full bg-zinc-900/50 border border-zinc-800 flex items-center justify-center text-zinc-600 shadow-inner">
                <SafeIcon icon={FiCheckCircle} className="text-2xl" />
              </div>
              <div className="space-y-1">
                <h3 className="text-zinc-300 font-bold tracking-wide">{t('ticket_list.empty_title', 'Inbox Zero')}</h3>
                <p className="text-zinc-500 text-sm max-w-sm mx-auto">{t('ticket_list.empty_desc', 'All support tickets have been resolved. The AXiM queue is clear.')}</p>
              </div>
            </div>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
          const style = statusStyles[ticket.status] || statusStyles.open;
          const priorityColor = ticket.priority === 'escalated' ? 'text-rose-500' : ticket.priority === 'urgent' ? 'text-rose-500' : ticket.priority === 'high' ? 'text-amber-500' : 'text-zinc-500';
          const isEscalated = ticket.priority === 'escalated';
          const customerName = ticket.contacts_ax2024?.name || 'Unknown Contact';


          const isNew = (new Date().getTime() - new Date(ticket.created_at).getTime()) < 5 * 60 * 1000; // 5 minutes
          const isSelected = selectedTicketIds.includes(ticket.id);
          
          return (
            <motion.div 
              key={ticket.id} 
              layout
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`group flex items-center justify-between p-5 border rounded-2xl transition-all duration-200 hover:bg-white/5 cursor-pointer ${
                  isSelected
                    ? 'bg-fuchsia-500/10 border-fuchsia-500/50'
                    : isEscalated
                      ? 'bg-rose-950/20 border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.2)]'
                      : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-5">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelectedTicketId(ticket.id); }}
                  className={`p-2 rounded-lg transition-colors ${isSelected ? 'text-fuchsia-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                    <SafeIcon icon={isSelected ? FiCheckSquare : FiSquare} className="text-xl" />
                </button>
                <div onClick={() => onSelectTicket(ticket.id)} className={`w-12 h-12 rounded-xl ${style.bg} border-2 ${style.border} flex items-center justify-center transition-all group-hover:scale-110 shadow-lg shrink-0`}>
                  <SafeIcon icon={style.icon} className={`text-xl ${style.color}`} />
                </div>
                <div onClick={() => onSelectTicket(ticket.id)}>
                  <h4 className="font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors tracking-tight">
                    {ticket.subject}
                  </h4>
                  <div className="text-xs text-zinc-500 font-medium flex items-center gap-2 mt-1">
                    <span className="text-zinc-400 font-bold">{customerName}</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                    <span>{new Date(ticket.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                {ticket.assignee_id && (
                    <div className="hidden md:flex items-center gap-2 mr-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center text-indigo-400 text-[10px] font-bold">
                            {ticket.assignee_id.slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                )}
                <div onClick={() => onSelectTicket(ticket.id)}>
                  <div className="flex items-center gap-2">
                    <SLABadge breachAt={ticket.sla_breach_at} status={ticket.status} />
                    {isNew && (
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[9px] font-black uppercase tracking-widest animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                        New
                      </span>
                    )}
                  </div>
                </div>
                <div onClick={() => onSelectTicket(ticket.id)} className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.15em] ${style.color} ${style.border} ${style.bg}`}>
                  {ticket.status}
                </div>
              </div>
            </motion.div>
          );
        })
        )}
      </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedTicketIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-4 rounded-3xl shadow-2xl z-50 flex items-center gap-6"
          >
            <span className="text-cyan-400 font-bold text-sm tracking-widest uppercase px-4 border-r border-zinc-700">
              {selectedTicketIds.length} Cases Selected
            </span>
            <button
              onClick={handleBatchTriage}
              disabled={isTriaging}
              className={`px-6 py-2 bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(217,70,239,0.3)] ${isTriaging ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {isTriaging ? 'Processing...' : 'Batch Triage'}
            </button>
            <button
              onClick={() => useTicketStore.getState().setSelectedTicketIds([])}
              className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}