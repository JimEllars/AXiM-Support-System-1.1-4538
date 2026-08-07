import React from 'react';
import { FiUsers, FiEdit3 } from 'react-icons/fi';
import { useTicketStore } from '../store/useTicketStore';

export default function AgentPresence({ ticketId }) {
  const { activeAgents } = useTicketStore();

  // Filter for agents currently viewing this specific ticket
  const ticketAgents = activeAgents.filter(agent => agent.ticket_id === ticketId);
  const typingAgents = ticketAgents.filter(agent => agent.is_typing);

  if (ticketAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-2 mr-2">
        {ticketAgents.map((agent, index) => {
          const email = agent.email || 'O';
          const initial = email.charAt(0).toUpperCase();
          return (
            <div
              key={index}
              className="relative flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-white shadow-sm"
              title={agent.email}
            >
              {initial}
              <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border-[1.5px] border-zinc-900" />
            </div>
          );
        })}
      </div>

      {/* Viewers Count Badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono text-indigo-300">
        <FiUsers className="text-indigo-400 text-[11px] animate-pulse"/>
        <span>{ticketAgents.length} {ticketAgents.length === 1 ? 'Agent Viewing' : 'Agents Viewing'}</span>
      </div>

      {/* Typing Indicator Badge */}
      {typingAgents.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300 animate-pulse">
          <FiEdit3 className="text-amber-400 text-[11px]"/>
          <span>{typingAgents.length === 1 ? 'Co-pilot typing...' : `${typingAgents.length} Agents typing...`}</span>
        </div>
      )}
    </div>
  );
}
