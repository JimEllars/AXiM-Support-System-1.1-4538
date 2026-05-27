import React, { useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';

const { FiCircle, FiCheckCircle, FiClock, FiAlertCircle, FiSearch, FiCheckSquare, FiSquare } = FiIcons;

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

  useEffect(() => {
    fetchTickets();
    const unsubscribe = subscribeToTickets();

  if (isLoading && tickets.length === 0) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="animate-pulse glass-panel rounded-[2rem] p-6 border border-white/5 bg-white/5">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-zinc-800/50 rounded-2xl" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-zinc-800/50 rounded w-3/4" />
                <div className="h-3 bg-zinc-800/50 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
) => {
      unsubscribe();
    };
  }, [fetchTickets, subscribeToTickets]);

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const customerName = ticket.contacts_ax2024?.name?.toLowerCase() || '';
    return (
      ticket.subject.toLowerCase().includes(q) ||
      ticket.id.toLowerCase().includes(q) ||
      ticket.priority.toLowerCase().includes(q) ||
      ticket.status.toLowerCase().includes(q) ||
      customerName.includes(q)
    );
  });

  if (isLoading && tickets.length === 0) {
    return (
      <div className="space-y-3">
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

  if (filteredTickets.length === 0) {
    return (
      <div className="p-16 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-[2rem] bg-zinc-950/50">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-4">
          <SafeIcon icon={FiSearch} className="text-2xl" />
        </div>
        <h3 className="text-white font-black text-xl tracking-tight">No Cases Match Protocol</h3>
        <p className="text-zinc-500 font-medium text-sm mt-2">Adjust your Onyx Command Hub query.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {filteredTickets.map((ticket) => {
          const style = statusStyles[ticket.status] || statusStyles.open;
          const priorityColor = ticket.priority === 'urgent' ? 'text-rose-500' : ticket.priority === 'high' ? 'text-amber-500' : 'text-zinc-500';
          const customerName = ticket.contacts_ax2024?.name || 'Unknown Contact';

          let slaBreaching = false;
          if (ticket.sla_breach_at && ticket.status !== 'resolved' && ticket.status !== 'closed') {
              const breachDate = new Date(ticket.sla_breach_at);
              const oneHourFromNow = new Date();
              oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
              if (breachDate < oneHourFromNow) {
                  slaBreaching = true;
              }
          }
          const isSelected = selectedTicketIds.includes(ticket.id);
          
          return (
            <motion.div 
              key={ticket.id} 
              layout
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`group flex items-center justify-between p-5 border rounded-2xl transition-all cursor-pointer ${slaBreaching ? 'animate-pulse text-rose-500 border-rose-500/50' : ''} ${
                  isSelected ? 'bg-fuchsia-500/10 border-fuchsia-500/50' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/40'
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
                    <span className="text-[10px] font-bold text-zinc-500 tracking-wider">
                      {customerName}
                    </span>
                  </div>
                </div>
              </div>
              
              <div onClick={() => onSelectTicket(ticket.id)} className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.15em] shrink-0 ${style.color} ${style.border} ${style.bg}`}>
                {ticket.status}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
