import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';

const { FiCircle, FiCheckCircle, FiClock, FiAlertCircle, FiSearch } = FiIcons;

const statusStyles = {
  open: { icon: FiCircle, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10' },
  pending: { icon: FiClock, color: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/10' },
  resolved: { icon: FiCheckCircle, color: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10' },
  closed: { icon: FiCheckCircle, color: 'text-zinc-500', border: 'border-zinc-500/30', bg: 'bg-zinc-500/5' },
};

export default function TicketList({ onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const searchQuery = useTicketStore((state) => state.searchQuery);

  useEffect(() => {
    const fetchTickets = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
      if (!error) {
        if (data.length === 0 && supabase.mock) {
          setTickets([
            { id: 'ax-8271-bf3a', subject: 'Node Authentication Failure', status: 'open', priority: 'urgent', created_at: new Date().toISOString() },
            { id: 'ax-9920-ca9b', subject: 'API Rate Limit Inconsistency', status: 'pending', priority: 'high', created_at: new Date().toISOString() },
            { id: 'ax-1044-dd2c', subject: 'Billing Tier Refresh', status: 'resolved', priority: 'medium', created_at: new Date().toISOString() }
          ]);
        } else {
          setTickets(data || []);
        }
      }
      setLoading(false);
    };
    fetchTickets();
  }, []);

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ticket.subject.toLowerCase().includes(q) ||
      ticket.id.toLowerCase().includes(q) ||
      ticket.priority.toLowerCase().includes(q) ||
      ticket.status.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="p-12 text-center text-zinc-700 font-black tracking-widest animate-pulse">SYNCHRONIZING QUEUE...</div>;
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
        {filteredTickets.map((ticket, idx) => {
          const style = statusStyles[ticket.status] || statusStyles.open;
          const priorityColor = ticket.priority === 'urgent' ? 'text-rose-500' : ticket.priority === 'high' ? 'text-amber-500' : 'text-zinc-500';
          
          return (
            <motion.div 
              key={ticket.id} 
              layout
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={() => onSelectTicket(ticket.id)}
              className="group flex items-center justify-between p-5 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all cursor-pointer hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-5">
                <div className={`w-12 h-12 rounded-xl ${style.bg} border-2 ${style.border} flex items-center justify-center transition-all group-hover:scale-110 shadow-lg shrink-0`}>
                  <SafeIcon icon={style.icon} className={`text-xl ${style.color}`} />
                </div>
                <div>
                  <h4 className="font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors tracking-tight">
                    {ticket.subject}
                  </h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="mono-font text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">#{ticket.id.slice(0, 8)}</span>
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${priorityColor}`}>
                      {ticket.priority}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.15em] shrink-0 ${style.color} ${style.border} ${style.bg}`}>
                {ticket.status}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}