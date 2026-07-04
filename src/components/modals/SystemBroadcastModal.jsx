import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiRadio, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

export default function SystemBroadcastModal({ isOpen, onClose }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    status: 'investigating',
    priority: 'minor',
    message: ''
  });

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

  const handleBroadcast = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Active session required for Edge actions.");

      // Route to Edge Worker to mutate the global Cloudflare KV
      const res = await fetch(`${workerUrl}/api/v1/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: formData.status,
          indicator: formData.priority === 'urgent' ? 'critical' : 'minor',
          description: formData.message
        })
      });

      if (!res.ok) throw new Error("Edge KV mutation rejected");

      // Log audit trail
      await supabase.from("events_ax2024").insert({
        type: "status_broadcast",
        payload: { source: 'dashboard_modal', subject: 'Global Alert', status: formData.status, timestamp: new Date().toISOString() }
      });

      toast.success('Ecosystem Status Updated', { icon: '📢', style: { background: '#09090b', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' } });
      onClose();
    } catch (err) {
      toast.error('Broadcast failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
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
          className="bg-zinc-950 border border-amber-500/30 w-full max-w-2xl rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.1)] flex flex-col max-h-[90vh]"
        >
          <div className="p-6 border-b border-zinc-900 flex justify-between items-center bg-amber-500/5 shrink-0">
            <div className="flex items-center gap-3 text-amber-500 font-black uppercase tracking-widest text-sm">
              <FiRadio className="animate-pulse" /> Public Health Broadcasts
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <FiX className="text-xl" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            <form onSubmit={handleBroadcast} className="bg-black/50 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">New Global Broadcast</h3>
              <div className="flex gap-4">
                <select
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block w-full p-2.5 outline-none"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  <option value="investigating">Investigating</option>
                  <option value="identified">Identified</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block w-full p-2.5 outline-none"
                  value={formData.priority}
                  onChange={(e) => setFormData({...formData, priority: e.target.value})}
                >
                  <option value="minor">Minor Incident</option>
                  <option value="urgent">Critical Outage</option>
                </select>
              </div>
              <textarea
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block w-full p-2.5 outline-none min-h-[80px]"
                placeholder="Incident details..."
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                required
              ></textarea>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-xl py-2 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Broadcasting...' : 'Broadcast to Edge'}
              </button>
            </form>

            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-800 pb-2">Active Broadcasts</h3>
              {isLoading ? (
                 <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : broadcasts.length === 0 ? (
                 <div className="text-center p-8 text-zinc-600 font-mono text-xs uppercase tracking-widest">No active public outages.</div>
              ) : (
                broadcasts.map(b => (
                  <div key={b.id} className="bg-black/50 border border-zinc-800/80 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest flex items-center gap-1 ${b.payload?.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                          <FiAlertTriangle /> {b.payload?.status || 'Active'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">{new Date(b.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-zinc-200 font-medium">Ticket #{b.payload?.ticket_id?.split('-')[0] || 'Global'}: {b.payload?.subject}</p>
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
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
