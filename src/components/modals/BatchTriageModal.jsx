import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useTicketStore } from '../../store/useTicketStore';
import { useAuthStore } from '../../store/useAuthStore';
import { onyxService } from '../../services/onyxService';
import toast from 'react-hot-toast';

const { FiCpu, FiX, FiCheck, FiAlertTriangle, FiLoader } = FiIcons;

export default function BatchTriageModal({ isOpen, onClose }) {
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const { selectedTicketIds, setSelectedTicketIds, fetchTickets } = useTicketStore();
  const { activeOrganization } = useAuthStore();

  const handleStart = async () => {
    if (selectedTicketIds.length === 0) {
        toast.error('No tickets selected for triage.');
        return;
    }

    setProcessing(true);
    try {
        const result = await onyxService.executeBatchTriage(selectedTicketIds);
        if (result.success) {
            setCompleted(true);
            await fetchTickets(activeOrganization); // Refresh queue
            setSelectedTicketIds([]); // Clear selection
        } else {
            throw new Error(result.error || "Batch triage failed.");
        }
    } catch (e) {
        toast.error("Onyx failed to process batch triage.");
        onClose();
    } finally {
        setProcessing(false);
    }
  };

  const handleClose = () => {
      setCompleted(false);
      onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/80">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass-panel rounded-[3rem] w-full max-w-xl overflow-hidden border-fuchsia-500/30 shadow-[0_0_50px_rgba(217,70,239,0.1)]"
          >
            <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-fuchsia-500/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-fuchsia-500/20 border border-fuchsia-500/50 rounded-2xl flex items-center justify-center text-fuchsia-400">
                  <SafeIcon icon={FiCpu} className="text-2xl" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight uppercase">Batch Triage Engine</h2>
                  <p className="text-[9px] font-black text-fuchsia-400 uppercase tracking-widest mt-0.5">Onyx Neural Processing v4.2</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                <SafeIcon icon={FiX} />
              </button>
            </div>

            <div className="p-10 text-center">
              {completed ? (
                <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="space-y-6">
                  <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/50 rounded-full flex items-center justify-center text-emerald-400 mx-auto">
                    <SafeIcon icon={FiCheck} className="text-4xl" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">TRIAGE_COMPLETE</h3>
                    <p className="text-zinc-500 mt-2 font-medium">{selectedTicketIds.length} pending tickets have been analyzed and prioritized by Onyx.</p>
                  </div>
                  <button onClick={handleClose} className="w-full py-4 bg-zinc-900 border border-zinc-800 rounded-2xl font-black text-white uppercase tracking-widest hover:bg-zinc-800 transition-all">
                    Return to Queue
                  </button>
                </motion.div>
              ) : (
                <div className="space-y-8">
                  <div className="p-6 bg-zinc-950 rounded-[2rem] border border-zinc-900 text-left">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Target Payload</span>
                      <span className="px-2 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded text-[10px] font-black">{selectedTicketIds.length} TICKETS</span>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Onyx will perform sentiment analysis, technical categorization, and urgency mapping across all selected tickets in the current buffer.
                    </p>
                  </div>

                  {processing ? (
                    <div className="space-y-4">
                      <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                          className="h-full bg-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.5)]"
                        />
                      </div>
                      <p className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.3em] animate-pulse">Analyzing_Neural_Patterns...</p>
                    </div>
                  ) : (
                    <button 
                      onClick={handleStart}
                      disabled={selectedTicketIds.length === 0}
                      className="w-full py-5 bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-fuchsia-500 text-black font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_0_30px_rgba(217,70,239,0.3)]"
                    >
                      Initialize Batch Triage
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
