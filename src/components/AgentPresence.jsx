import React from 'react';
import { FiUsers, FiEdit3, FiMessageCircle, FiPower } from 'react-icons/fi';
import { useTicketStore } from '../store/useTicketStore';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

export default function AgentPresence({ ticketId }) {
  const { activeAgents } = useTicketStore();
  const { isChatOnline, setChatOnline, user } = useAuthStore();

  // Filter for agents currently viewing this specific ticket
  const ticketAgents = activeAgents.filter(agent => agent.ticket_id === ticketId);
  const typingAgents = ticketAgents.filter(agent => agent.is_typing);

  const toggleChatStatus = async () => {
    const newStatus = !isChatOnline;
    setChatOnline(newStatus);

    try {
      // Optional: Broadcast the status change via Realtime
      if (user) {
         const channel = supabase.channel('chat_presence');
         await channel.send({
           type: 'broadcast',
           event: 'status_change',
           payload: { user: user.email, status: newStatus ? "chat_ready" : "offline" }
         });
      }

      toast.success(`Live Chat is now ${newStatus ? 'Online' : 'Offline'}`, {
        style: {
          background: '#09090b',
          color: newStatus ? '#10b981' : '#f43f5e',
          border: `1px solid ${newStatus ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`
        }
      });
    } catch (err) {
      console.warn("Failed to broadcast chat status", err);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 lg:gap-4">
      {/* Viewers/Typing Info Block */}
      {ticketAgents.length > 0 && (
        <div className="flex items-center gap-2 border-r border-zinc-800 pr-4">
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

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono text-indigo-300">
            <FiUsers className="text-indigo-400 text-[11px] animate-pulse"/>
            <span>{ticketAgents.length} {ticketAgents.length === 1 ? 'Agent Viewing' : 'Agents Viewing'}</span>
          </div>

          {typingAgents.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300 animate-pulse">
              <FiEdit3 className="text-amber-400 text-[11px]"/>
              <span>{typingAgents.length === 1 ? 'Co-pilot typing...' : `${typingAgents.length} Agents typing...`}</span>
            </div>
          )}
        </div>
      )}

      {/* Live Chat Toggle */}
      <button
        onClick={toggleChatStatus}
        className={`flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-mono font-bold transition-all
          ${isChatOnline
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
            : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}`}
      >
        <FiMessageCircle className={isChatOnline ? 'animate-pulse' : ''} />
        <span>Chat: {isChatOnline ? 'ON' : 'OFF'}</span>
        <div className={`w-2 h-2 rounded-full ${isChatOnline ? 'bg-emerald-500' : 'bg-zinc-700'}`}></div>
      </button>
    </div>
  );
}
