import React, { useEffect, useMemo } from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useTicketStore } from '../store/useTicketStore';
import { motion, AnimatePresence } from 'framer-motion';

const { FiActivity, FiEdit2 } = FiIcons;

export default function AgentPresence({ ticketId, currentAgent }) {
  const joinTicketPresence = useTicketStore((state) => state.joinTicketPresence);
  const leaveTicketPresence = useTicketStore((state) => state.leaveTicketPresence);
  const activeAgents = useTicketStore((state) => state.activeAgents);

  useEffect(() => {
    if (ticketId && currentAgent) {
      joinTicketPresence(ticketId, currentAgent);
    }
    return () => {
      leaveTicketPresence();
    };
  }, [ticketId, currentAgent, joinTicketPresence, leaveTicketPresence]);

  const typingAgents = useMemo(() => {
    return activeAgents.filter(a => a.isTyping && a.agentId !== currentAgent?.agentId);
  }, [activeAgents, currentAgent]);

  if (!activeAgents.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-6">
        <div className="flex -space-x-3">
          <AnimatePresence>
            {activeAgents.map((agent) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, scale: 0.8, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -10 }}
                className={`w-10 h-10 rounded-xl border-2 border-zinc-950 flex items-center justify-center text-black font-black text-xs relative group cursor-pointer ${agent.color || 'bg-cyan-500'}`}
              >
                {agent.name[0]}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-zinc-950 rounded-full border-2 border-zinc-950 flex items-center justify-center">
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.isAI ? 'bg-fuchsia-400 animate-pulse' : 'bg-emerald-400'}`} />
                </div>

                {/* Tooltip */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
                  <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap">
                    <p className="text-white text-xs font-black tracking-tight">{agent.name}</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{agent.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-zinc-800">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
            <SafeIcon icon={FiActivity} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Active Hubs</p>
            <p className="text-xs font-black text-white">{activeAgents.length} Agents Syncing</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {typingAgents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="flex items-center gap-2 text-cyan-400 text-xs font-medium py-1 px-3 bg-cyan-950/30 rounded-lg border border-cyan-900/50 w-fit"
          >
            <SafeIcon icon={FiEdit2} className="w-3 h-3 animate-pulse" />
            <span>
              {typingAgents.length === 1
                ? `⚠️ ${typingAgents[0].name} is currently drafting a response...`
                : `⚠️ ${typingAgents.length} agents are currently drafting responses...`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
