import React, { useState } from 'react';
import { useTicketStore } from '../store/useTicketStore';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { onyxService } from '../services/onyxService';

const { FiX, FiSend, FiLoader, FiCpu, FiTerminal, FiPlus } = FiIcons;

export default function CreateTicketModal({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onyxService.createTicket({
        ...form,
        customer_id: '00000000-0000-0000-0000-000000000000'
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="glass-panel rounded-[2.5rem] w-full max-w-2xl overflow-hidden border-zinc-800 shadow-2xl"
          >
            <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/50 rounded-2xl flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                  <SafeIcon icon={FiPlus} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Ingest Case</h2>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-0.5">Manual Neural Ingestion</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors"
              >
                <SafeIcon icon={FiX} className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                  <SafeIcon icon={FiTerminal} className="text-cyan-500" /> Subject_Header
                </label>
                <input 
                  required 
                  className="w-full px-6 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:border-cyan-500/50 outline-none transition-all text-white font-bold placeholder-zinc-800"
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  placeholder="IDENTIFY_ISSUE_TYPE"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                  <SafeIcon icon={FiCpu} className="text-fuchsia-500" /> Context_Payload
                </label>
                <textarea 
                  required 
                  rows={5}
                  className="w-full px-6 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:border-fuchsia-500/50 outline-none transition-all text-zinc-300 font-medium placeholder-zinc-800 resize-none"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="PROVIDE_DETAILED_LOGS_OR_CONTEXT..."
                />
              </div>

              <button 
                disabled={loading}
                className="w-full group relative overflow-hidden bg-cyan-600 hover:bg-cyan-500 text-black font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] disabled:opacity-50"
              >
                <div className="relative z-10 flex items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <SafeIcon icon={FiLoader} className="animate-spin text-xl" />
                      <span>ONYX_TRIAGING...</span>
                    </>
                  ) : (
                    <>
                      <SafeIcon icon={FiSend} className="text-xl" />
                      <span>INITIALIZE_TICKET</span>
                    </>
                  )}
                </div>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}