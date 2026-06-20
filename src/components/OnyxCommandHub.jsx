import React, { useState, useEffect, useRef } from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';
import { onyxService } from '../services/onyxService';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

const { FiTerminal, FiSearch, FiZap, FiChevronRight, FiFilter, FiCpu } = FiIcons;

export default function OnyxCommandHub() {
  const { searchQuery, setSearchQuery } = useTicketStore();
  const [isFocused, setIsFocused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef(null);

  // Global CMD+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      setIsProcessing(true);

      try {

        const pathParts = window.location.pathname.split('/');
        const ticketId = pathParts[1] === 'ticket' ? pathParts[2] : null;
        const result = await onyxService.parseCommand(searchQuery, ticketId);

        if (result && result.intent === 'TOOL_PROPOSAL') {
            toast.success('Onyx proposed an action. Waiting for approval.', {
                style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' },
                icon: <SafeIcon icon={FiZap} />
            });
            setSearchQuery('');
            inputRef.current?.blur();
            setIsProcessing(false);
            return;
        }


        if (result.intent === 'SYSTEM_ACTION') {
            if (result.action === 'ASSIGN_TICKET') {
                const { error } = await supabase.from('support_tickets').update({ assignee_id: result.assignee === 'me' ? 'agent_user' : result.assignee }).eq('id', result.ticketId);
                if (error) throw error;
                toast.success(`SYSTEM_EXEC: Ticket #${result.ticketId.slice(0, 8)} assigned.`, {
                    style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' },
                    icon: <SafeIcon icon={FiTerminal} />
                });
            } else if (result.action === 'UPDATE_PRIORITY') {
                const { error } = await supabase.from('support_tickets').update({ priority: result.priority }).eq('id', result.ticketId);
                if (error) throw error;
                toast.success(`SYSTEM_EXEC: Ticket #${result.ticketId.slice(0, 8)} marked as ${result.priority}.`, {
                    style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' },
                    icon: <SafeIcon icon={FiTerminal} />
                });
            }
            setSearchQuery('');
            inputRef.current?.blur();
        } else if (result.intent === 'FILTER') {
            toast.success(`Applying Onyx Intelligence filter...`, {
                style: { background: '#18181b', color: '#d946ef', border: '1px solid #a21caf' },
                icon: <SafeIcon icon={FiCpu} />
            });
            setSearchQuery(result.value || result.action);
        } else {
             toast('Searching knowledge base and cases...', {
                style: { background: '#18181b', color: '#22d3ee', border: '1px solid #0891b2' }
            });
        }
      } catch (error) {
        toast.error('Command Execution Failed: ' + error.message, {
            style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handlePresetAction = (presetText) => {
    setSearchQuery(presetText);
    inputRef.current?.focus();
  };

  return (
    <div className="relative mb-10">



      <motion.div 
        animate={{ 
          borderColor: isFocused ? '#22d3ee' : '#27272a',
          boxShadow: isFocused ? '0 0 20px rgba(34, 211, 238, 0.1)' : 'none'
        }}
        className="flex items-center gap-4 bg-zinc-900 border-2 rounded-2xl px-6 py-4 transition-all relative z-50"
      >
        <SafeIcon icon={FiTerminal} className={`text-xl transition-colors ${isFocused ? 'text-cyan-400' : 'text-zinc-500'}`} />
        <div className="flex-1 flex items-center gap-1">
          <span className="mono-font text-cyan-500 font-bold text-lg opacity-70">onyx_</span>
          <input 
            ref={inputRef}
            type="text"
            placeholder={isProcessing ? "PROCESSING INTENT..." : "Invoke command or filter stream..."}
            className="flex-1 bg-transparent outline-none text-zinc-100 placeholder-zinc-700 font-medium mono-font text-lg disabled:opacity-50"
            value={searchQuery}
            disabled={isProcessing}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isFocused && !searchQuery && <span className="w-2.5 h-6 bg-cyan-500 cursor-blink ml-1" />}
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] font-black text-zinc-600 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg uppercase tracking-tighter">
          <SafeIcon icon={FiZap} className="text-amber-500" /> CMD + K
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2 mt-4 px-2">
        {['/filter urgent', '/assign me', '/show breached', '/status open'].map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              setSearchQuery(cmd);
              // Small delay to ensure state updates before firing
              setTimeout(() => handleKeyDown({ key: 'Enter', preventDefault: () => {} }), 50);
            }}
            className="px-3 py-1 text-[10px] font-mono border border-cyan-500/30 text-cyan-400 rounded-full hover:bg-cyan-500/10 cursor-pointer transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
      

      {/* AUTO-HEAL ACTION LOG (TIER 1 AUTOMATION STUBS) */}
      <div className="mt-4 bg-black border border-zinc-800/50 rounded-2xl p-4 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50"></div>
        <div className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
          Tier 1 Auto-Heal Feed
        </div>
        <div className="font-mono text-xs text-zinc-500 space-y-1.5">
          <div className="flex items-start gap-3">
            <span className="text-zinc-700 shrink-0">14:02:00</span>
            <span className="text-emerald-400">SUCCESS</span>
            <span>Token Cache Cleared for Node 4</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-zinc-700 shrink-0">14:05:12</span>
            <span className="text-fuchsia-400">AUTOMATED</span>
            <span>Auto-Draft sent for Ticket #992</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-zinc-700 shrink-0">14:08:45</span>
            <span className="text-cyan-400">ROUTING</span>
            <span>Anomaly tracked to vector_kb for Ticket #995</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFocused && searchQuery.length > 0 && !isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-3 glass-panel rounded-2xl shadow-2xl z-40 p-4 border-cyan-500/20"
          >
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 px-2">Prediction Engine - Active Filters</div>
            <div className="space-y-1">
              <div onClick={() => handlePresetAction(`urgent`)} className="flex items-center justify-between p-3 hover:bg-zinc-800/50 rounded-xl cursor-pointer group transition-all">
                <div className="flex items-center gap-3">
                  <SafeIcon icon={FiFilter} className="text-zinc-500 group-hover:text-cyan-400" />
                  <span className="text-sm font-medium text-zinc-300">Execute command for "<span className="text-cyan-400">{searchQuery}</span>"</span>
                </div>
                <div className="text-[10px] mono-font text-zinc-600 bg-zinc-950 px-2 py-1 rounded">ENTER</div>
              </div>
              <div className="flex items-center justify-between p-3 hover:bg-zinc-800/50 rounded-xl cursor-pointer group transition-all">
                <div className="flex items-center gap-3">
                  <SafeIcon icon={FiZap} className="text-zinc-500 group-hover:text-fuchsia-400" />
                  <span className="text-sm font-medium text-zinc-300">Generate Onyx summary for "<span className="text-fuchsia-400">{searchQuery}</span>"</span>
                </div>
                <SafeIcon icon={FiChevronRight} className="text-zinc-700 group-hover:text-fuchsia-400" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
