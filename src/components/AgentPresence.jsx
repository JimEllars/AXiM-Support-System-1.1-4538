import React, { useEffect, useState } from 'react';
import { FiUsers, FiEdit3 } from 'react-icons/fi';
import { supabase } from '../lib/supabaseClient';

export default function AgentPresence({ ticketId, isTypingLocal = false }) {
  const [presenceAgents, setPresenceAgents] = useState([]);
  const [typingAgents, setTypingAgents] = useState([]);
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    if (!ticketId) return;

    let presenceChannel;

    const initPresence = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'operator@axim.internal';

      presenceChannel = supabase.channel(`presence:ticket:${ticketId}`, {
        config: { presence: { key: userEmail } }
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const allAgents = [];
          const currentlyTyping = [];

          Object.keys(state).forEach((key) => {
            const presences = state[key];
            if (presences && presences.length > 0) {
              const latest = presences[presences.length - 1];
              allAgents.push(latest);
              // Filter typing agents excluding self
              if (latest.isTyping && latest.email !== userEmail) {
                currentlyTyping.push(latest.email);
              }
            }
          });

          setPresenceAgents(allAgents);
          setTypingAgents(currentlyTyping);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await presenceChannel.track({
              online_at: new Date().toISOString(),
              email: userEmail,
              isTyping: isTypingLocal
            });
          }
        });

      setChannel(presenceChannel);
    };

    initPresence();

    return () => {
      if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
      }
    };
  }, [ticketId]);

  // Update presence track whenever local typing status changes
  useEffect(() => {
    if (channel && channel.state === 'joined') {
      supabase.auth.getUser().then(({ data: { user } }) => {
        channel.track({
          online_at: new Date().toISOString(),
          email: user?.email || 'operator@axim.internal',
          isTyping: isTypingLocal
        });
      });
    }
  }, [isTypingLocal, channel]);

  if (presenceAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Viewers Count Badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono text-indigo-300">
        <FiUsers className="text-indigo-400 text-[11px] animate-pulse"/>
        <span>{presenceAgents.length} {presenceAgents.length === 1 ? 'Agent Viewing' : 'Agents Viewing'}</span>
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
