import React from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion } from 'framer-motion';

const { FiCpu, FiCopy, FiZap, FiCheck } = FiIcons;

export default function AutoDraftWhisper({ draft, onApply }) {
  if (!draft) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 p-6 rounded-3xl bg-fuchsia-500/5 border border-fuchsia-500/20 neon-border-fuchsia relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <SafeIcon icon={FiCpu} className="text-8xl text-fuchsia-500" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500 flex items-center justify-center text-black">
            <SafeIcon icon={FiZap} />
          </div>
          <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.2em]">
            Onyx AI Suggested Reply
          </span>
        </div>
        <button 
          onClick={() => onApply(draft)}
          className="flex items-center gap-2 px-4 py-1.5 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-fuchsia-500/20"
        >
          <SafeIcon icon={FiCheck} />
          Apply Draft
        </button>
      </div>

      <p className="text-zinc-300 mono-font text-sm leading-relaxed border-l-2 border-fuchsia-500/30 pl-4 py-1 italic">
        "{draft}"
      </p>
      
      <div className="mt-4 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
        <span className="text-[9px] font-black text-fuchsia-500/60 uppercase tracking-widest">
          Draft generated based on case context & KB match
        </span>
      </div>
    </motion.div>
  );
}