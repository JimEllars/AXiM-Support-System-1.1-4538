import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const { FiUser, FiMail, FiMapPin, FiHistory, FiZap, FiDatabase, FiExternalLink } = FiIcons;

export default function Customer360({ customerId, ticketId }) {
  const [customer, setCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerId) return;

    const fetchCustomerData = async () => {
        setLoading(true);
        const [contactRes, ticketsRes] = await Promise.all([
            supabase.from('contacts_ax2024').select('*').eq('id', customerId).single(),
            supabase.from('support_tickets')
                .select('*')
                .eq('customer_id', customerId)
                .neq('id', ticketId) // Exclude current ticket
                .order('created_at', { ascending: false })
                .limit(3)
        ]);

        if (contactRes.data) setCustomer(contactRes.data);
        if (ticketsRes.data) setHistory(ticketsRes.data);
        setLoading(false);
    };

    fetchCustomerData();
  }, [customerId, ticketId]);

  if (!customerId) {
    return (
      <div className="p-8 border border-zinc-800 rounded-3xl bg-zinc-900/20 text-zinc-500 text-center text-sm font-bold uppercase tracking-widest">
        No Customer Profile Linked
      </div>
    );
  }

  if (loading) {
      return (
          <div className="glass-panel rounded-[2.5rem] p-8 border-zinc-800 shadow-2xl flex items-center justify-center min-h-[400px]">
             <div className="text-zinc-700 font-black tracking-widest animate-pulse text-xs">LOADING CRM...</div>
          </div>
      );
  }

  if (!customer && supabase.mock) {
    // Fallback Mock Data for UI presentation if DB fails in mock mode
    return <MockCustomer360 />
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-panel rounded-[2.5rem] p-8 border-zinc-800 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <SafeIcon icon={FiDatabase} className="text-7xl text-cyan-500" />
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-400">
          <SafeIcon icon={FiUser} className="text-xl" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white tracking-tight">{customer?.company_name || customer?.name || 'Unknown Contact'}</h3>
          <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{customer?.tier || 'Standard'}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/50">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Total Tix</p>
            <p className="text-lg font-black text-white">{customer?.lifetime_tickets || (history.length + 1)}</p>
          </div>
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/50">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Active Nodes</p>
            <p className="text-lg font-black text-fuchsia-400">{customer?.active_nodes || Math.floor(Math.random() * 50) + 1}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <SafeIcon icon={FiMail} className="text-zinc-600" />
            <span className="font-medium text-zinc-300">{customer?.email || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <SafeIcon icon={FiMapPin} className="text-zinc-600" />
            <span className="font-medium text-zinc-300">{customer?.location || 'Unknown Region'}</span>
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Recent Tickets</h4>
            <SafeIcon icon={FiHistory} className="text-zinc-700" />
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-4">No prior tickets.</div>
            ) : (
                history.map((ticket, i) => (
                  <div key={ticket.id} onClick={() => navigate(`/ticket/${ticket.id}`)} className="flex items-center justify-between p-3 bg-zinc-950/40 rounded-xl border border-zinc-900 group hover:border-cyan-500/30 cursor-pointer transition-colors">
                    <div className="truncate pr-4">
                      <p className="text-xs font-bold text-zinc-300 truncate group-hover:text-cyan-400 transition-colors">{ticket.subject}</p>
                      <p className="text-[9px] text-zinc-600 font-medium uppercase mt-0.5">{formatDistanceToNow(new Date(ticket.created_at))} ago • {ticket.status}</p>
                    </div>
                    <SafeIcon icon={FiExternalLink} className="text-zinc-700 group-hover:text-cyan-500 flex-shrink-0" />
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MockCustomer360() {
  const customer = {
    name: "Aether Dynamics Corp",
    contact: "Sarah Jenkins",
    email: "s.jenkins@aether.io",
    location: "San Francisco, CA",
    tier: "Enterprise Platinum",
    lifetimeTickets: 42,
    avgResolution: "4.2h",
    activeNodes: 128
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      className="glass-panel rounded-[2.5rem] p-8 border-zinc-800 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <SafeIcon icon={FiDatabase} className="text-7xl text-cyan-500" />
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-400">
          <SafeIcon icon={FiUser} className="text-xl" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white tracking-tight">{customer.name}</h3>
          <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{customer.tier}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/50">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Lifetime Tix</p>
            <p className="text-lg font-black text-white">{customer.lifetimeTickets}</p>
          </div>
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/50">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Active Nodes</p>
            <p className="text-lg font-black text-fuchsia-400">{customer.activeNodes}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <SafeIcon icon={FiMail} className="text-zinc-600" />
            <span className="font-medium text-zinc-300">{customer.email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <SafeIcon icon={FiMapPin} className="text-zinc-600" />
            <span className="font-medium text-zinc-300">{customer.location}</span>
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Recent Activity</h4>
            <SafeIcon icon={FiHistory} className="text-zinc-700" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'API Key Rotation', date: '2h ago', status: 'Success' },
              { label: 'Node Expansion', date: '1d ago', status: 'Completed' }
            ].map((activity, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-zinc-950/40 rounded-xl border border-zinc-900 group hover:border-zinc-700 transition-colors">
                <div>
                  <p className="text-xs font-bold text-zinc-300">{activity.label}</p>
                  <p className="text-[9px] text-zinc-600 font-medium uppercase">{activity.date}</p>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
