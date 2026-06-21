import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

const { FiShield, FiX, FiSend, FiAlertCircle } = FiIcons;

export default function SystemBroadcastModal({ isOpen, onClose }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handlePushBroadcast = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    try {
      const { error } = await supabase.from('events_ax2024').insert({
        type: 'system_broadcast',
        payload: {
          active_outage: true,
          message: message.trim()
        }
      });
      if (error) throw error;
      toast.success('Global broadcast deployed.');
      setMessage('');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to send broadcast.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClearBroadcast = async () => {
    setIsSending(true);
    try {
      const { error } = await supabase.from('events_ax2024').insert({
        type: 'system_broadcast',
        payload: {
          active_outage: false,
          message: ''
        }
      });
      if (error) throw error;
      toast.success('Global broadcast cleared.');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to clear broadcast.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/80">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-panel rounded-[3rem] w-full max-w-lg overflow-hidden border-amber-500/30"
          >
            <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-amber-500/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/50 rounded-2xl flex items-center justify-center text-amber-400">
                  <SafeIcon icon={FiShield} className="text-2xl" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight uppercase">Emergency Broadcast</h2>
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mt-0.5">Global Agent Notification</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                <SafeIcon icon={FiX} />
              </button>
            </div>

            <div className="p-10 space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                  <SafeIcon icon={FiAlertCircle} className="text-amber-500" /> Alert_Payload
                </label>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="DEPLOY_SYSTEM_WIDE_MESSAGE..."
                  className="w-full px-6 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:border-amber-500/50 outline-none transition-all text-zinc-100 font-medium h-32 resize-none"
                />
              </div>

              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                <p className="text-[10px] text-amber-400/70 font-medium italic">
                  Note: This broadcast will be pushed to the real-time notification layer of all active support terminals.
                </p>
              </div>

              <button
                disabled={isSending || !message.trim()}
                onClick={handlePushBroadcast}
                className="w-full py-5 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.3)] disabled:opacity-50">
                {isSending ? 'Sending...' : 'Push Global Broadcast'}
              </button>
              <button
                disabled={isSending}
                onClick={handleClearBroadcast}
                className="w-full py-3 mt-2 bg-transparent border border-zinc-800 text-zinc-400 hover:text-white font-bold uppercase tracking-[0.1em] rounded-xl transition-all disabled:opacity-50">
                Clear Active Broadcast
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}