import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import ActionProposalBlock from './ActionProposalBlock';
import ReactMarkdown from 'react-markdown';

const { FiUser, FiCpu, FiLock, FiTerminal } = FiIcons;

import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect } from 'react';

export default function MessageThread({ ticketId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!ticketId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('* ')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };

    fetchMessages();

    const messageChannel = supabase.channel(`messages:${ticketId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` }, (payload) => {
        setMessages(prev => {
           if (prev.some(m => m.id === payload.new.id)) return prev;
           return [...prev, payload.new];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, [ticketId]);


  if (!messages || messages.length === 0) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-6 animate-pulse">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl shrink-0" />
            <div className="flex-1 p-6 rounded-[1.5rem] bg-zinc-900/40 border border-zinc-800">
              <div className="flex justify-between items-center mb-4">
                <div className="h-3 bg-zinc-800 rounded w-1/4" />
                <div className="h-3 bg-zinc-800 rounded w-1/6" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-zinc-800 rounded w-full" />
                <div className="h-4 bg-zinc-800 rounded w-5/6" />
                <div className="h-4 bg-zinc-800 rounded w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {messages.map((msg) => {
        const isAI = msg.sender_id === 'onyx_system';
        const isInternal = msg.is_internal_note;
        
        return (
          <div key={msg.id} className={`flex gap-6 ${isInternal ? 'opacity-90' : ''}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all shadow-lg ${
              isAI ? 'bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-500' :
              isInternal ? 'bg-amber-500/10 border-amber-500/40 text-amber-500' :
              'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <SafeIcon icon={isAI ? FiCpu : isInternal ? FiLock : FiUser} className="text-xl" />
            </div>
            
            <div className={`flex-1 p-6 rounded-[1.5rem] border transition-all relative overflow-hidden ${
              isAI ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(217,70,239,0.03)_10px,rgba(217,70,239,0.03)_20px)] border-fuchsia-500/30 neon-border-fuchsia' :
              isInternal ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.03)_10px,rgba(245,158,11,0.03)_20px)] border-amber-500/30' :
              'bg-zinc-900/40 border-zinc-800 shadow-xl'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
                    isAI ? 'text-fuchsia-400' : isInternal ? 'text-amber-400' : 'text-zinc-500'
                  }`}>
                    {isAI ? 'Onyx Intelligence' : isInternal ? 'Agent Internal' : 'Customer Relay'}
                  </span>
                  {(isInternal || isAI) && (
                    <span className="absolute top-4 right-4 px-2 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded border border-amber-500/30 shadow-sm backdrop-blur-sm">
                      👁️ Internal Note
                    </span>
                  )}
                  {isAI && <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />}
                </div>
                <span className="mono-font text-[10px] text-zinc-600 font-bold">
                  {formatDistanceToNow(new Date(msg.created_at))} AGO
                </span>
              </div>
              <div className={`prose prose-invert max-w-none text-zinc-300 leading-relaxed font-medium ${isAI ? 'mono-font text-sm' : ''}`}>
                <ReactMarkdown>{msg.message_body}</ReactMarkdown>
              </div>
              {msg.metadata?.hitl_log_id && (
                  <ActionProposalBlock hitlLog={{ id: msg.metadata.hitl_log_id }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
