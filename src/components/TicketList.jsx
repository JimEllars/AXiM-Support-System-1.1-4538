import { onyxService } from '../services/onyxService';
import toast from 'react-hot-toast';
import React, { useEffect, useState, useRef } from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';
import SLABadge from './tickets/SLABadge';

const { FiCircle, FiCheckCircle, FiClock, FiAlertCircle, FiSearch, FiCheckSquare, FiSquare, FiRefreshCw, FiGlobe, FiMail, FiMessageSquare } = FiIcons;

const statusStyles = {
  open: { icon: FiCircle, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10' },
  pending: { icon: FiClock, color: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/10' },
  resolved: { icon: FiCheckCircle, color: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10' },
  closed: { icon: FiCheckCircle, color: 'text-zinc-500', border: 'border-zinc-500/30', bg: 'bg-zinc-500/5' },
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

export default function TicketList({ onSelectTicket }) {
  const { tickets, isLoading, fetchTickets, subscribeToTickets, searchQuery, selectedTicketIds, toggleSelectedTicketId } = useTicketStore();
  const [isTriaging, setIsTriaging] = useState(false);
  const previousTicketCount = useRef(tickets.length);

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
        previousTicketCount.current = tickets.length;
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [tickets.length]);

  const handleBatchTriage = async () => {
    if (selectedTicketIds.length === 0 || isTriaging) return;
    setIsTriaging(true);

    const toastId = toast.loading("Onyx is triaging selected cases...", {
        style: { background: '#18181b', color: '#22d3ee', border: '1px solid #0891b2' }
    });

    try {
        const result = await onyxService.executeBatchTriage(selectedTicketIds);

        if (result && result.success) {
            useTicketStore.getState().setSelectedTicketIds([]);
            fetchTickets();
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
    fetchTickets();
    const unsubscribe = subscribeToTickets();


    return () => {
      unsubscribe();
    };
  }, [isTriaging, fetchTickets]);


    if (isLoading && tickets.length === 0) {
    return (
      <div className="space-y-3 relative">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="animate-pulse flex items-center justify-between p-5 border border-zinc-800 rounded-2xl bg-zinc-900/40">
            <div className="flex gap-4 items-center w-full">
              <div className="w-8 h-8 bg-zinc-800 rounded-lg shrink-0" />
              <div className="w-12 h-12 bg-zinc-800 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-zinc-800 rounded w-1/3" />
                <div className="h-3 bg-zinc-800 rounded w-1/4" />
              </div>
            </div>
            <div className="w-20 h-6 bg-zinc-800 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    );
  }


  if (tickets.length === 0) {
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
        // Find assigned department from user tickets or context,
        // For now let's grab it from the first ticket if any exist, or fallback to 'General Support'
        const dept = tickets.length > 0 && tickets[0].assigned_department ? tickets[0].assigned_department : "your department";
        return (
          <div className="p-16 flex flex-col items-center justify-center border-2 border-dashed border-emerald-900/50 rounded-[2rem] bg-emerald-950/10">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950 border border-emerald-900 flex items-center justify-center text-emerald-500 mb-4 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <SafeIcon icon={FiIcons.FiCheckCircle} className="text-2xl" />
            </div>
            <h3 className="text-emerald-400 font-black text-xl tracking-tight">System Optimal</h3>
            <p className="text-emerald-500/70 font-medium text-sm mt-2 uppercase tracking-widest text-[10px]">No Active Incidents in [{dept}]</p>
          </div>
        );
    }
  }


  return (
    <>
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-zinc-400 font-bold tracking-widest text-sm uppercase flex items-center gap-2">
          Inbox Pipeline
        </h2>
        <button
          onClick={() => {
            if (!isTriaging && !isLoading) {
              fetchTickets();
            }
          }}
          className="text-zinc-500 hover:text-cyan-400 transition-colors p-2 rounded-xl hover:bg-zinc-800/50"
          title="Manual Refresh"
        >
          <SafeIcon icon={FiRefreshCw} className={`text-lg ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
      <div className="space-y-3">
      <AnimatePresence>
        {tickets.map((ticket) => {
          const style = statusStyles[ticket.status] || statusStyles.open;
          const priorityColor = ticket.priority === 'escalated' ? 'text-rose-500' : ticket.priority === 'urgent' ? 'text-rose-500' : ticket.priority === 'high' ? 'text-amber-500' : 'text-zinc-500';
          const isEscalated = ticket.priority === 'escalated';
          const customerName = ticket.contacts_ax2024?.name || 'Unknown Contact';


          const isSelected = selectedTicketIds.includes(ticket.id);
          
          return (
            <motion.div 
              key={ticket.id} 
              layout
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`group flex items-center justify-between p-5 border rounded-2xl transition-all cursor-pointer ${
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
                  <div className="flex items-center gap-3 mt-1">
                    <span className="mono-font text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">#{ticket.id.slice(0, 8)}</span>
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${priorityColor}`}>
                      {ticket.priority}
                    </span>
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                    {/* Omnichannel Source Badging */}
                    <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 tracking-wider">
                      {customerName}
                      <span className="ml-1 opacity-60">
                        {ticket.source === 'website' || ticket.source === 'widget' ? <SafeIcon icon={FiGlobe} /> : ticket.source === 'email' ? <SafeIcon icon={FiMail} /> : <SafeIcon icon={FiMessageSquare} />}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <div onClick={() => onSelectTicket(ticket.id)}>
                  <SLABadge breachAt={ticket.sla_breach_at} status={ticket.status} />
                </div>
                <div onClick={() => onSelectTicket(ticket.id)} className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.15em] ${style.color} ${style.border} ${style.bg}`}>
                  {ticket.status}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

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
