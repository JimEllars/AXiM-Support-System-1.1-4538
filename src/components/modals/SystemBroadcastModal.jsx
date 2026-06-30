import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiRadio, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

export default function SystemBroadcastModal({ isOpen, onClose }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const fetchBroadcasts = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'status_broadcast')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) setBroadcasts(data);
      setIsLoading(false);
    };
    fetchBroadcasts();
  }, [isOpen]);

  const handleResolve = async (id) => {
    try {
      await supabase.from('events_ax2024').delete().eq('id', id);
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      toast.success('Broadcast cleared from public health page.');
    } catch (err) {
      toast.error('Failed to clear broadcast.');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-zinc-950 border border-amber-500/30 w-full max-w-2xl rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.1)]"
        >
          <div className="p-6 border-b border-zinc-900 flex justify-between items-center bg-amber-500/5">
            <div className="flex items-center gap-3 text-amber-500 font-black uppercase tracking-widest text-sm">
              <FiRadio className="animate-pulse" /> Public Health Broadcasts
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <FiX className="text-xl" />
            </button>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
            {isLoading ? (
               <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : broadcasts.length === 0 ? (
               <div className="text-center p-8 text-zinc-600 font-mono text-xs uppercase tracking-widest">No active public outages.</div>
            ) : (
              broadcasts.map(b => (
                <div key={b.id} className="bg-black/50 border border-zinc-800/80 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest flex items-center gap-1">
                        <FiAlertTriangle /> Investigating
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(b.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-zinc-200 font-medium">Ticket #{b.payload?.ticket_id?.split('-')[0]}: {b.payload?.subject}</p>
                  </div>
                  <button
                    onClick={() => handleResolve(b.id)}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    <FiCheckCircle /> Mark Resolved
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
