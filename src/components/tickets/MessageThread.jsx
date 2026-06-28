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
        const isCustomer = msg.sender_id === 'customer';
        const isInternal = msg.is_internal_note;

        return (
          <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'} mb-6`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${
              isCustomer
                ? 'bg-zinc-800/80 border border-zinc-700 text-zinc-200 shadow-md'
                : isInternal
                  ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.02)_10px,rgba(245,158,11,0.02)_20px)] bg-amber-950/10 border-amber-500/30 text-amber-100/90 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                  : 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black tracking-widest uppercase ${isCustomer ? 'text-zinc-400' : isInternal ? 'text-amber-500' : 'text-cyan-500'}`}>
                  {isCustomer ? 'Public Intake / Customer' : isInternal ? 'System Telemetry' : 'Support Team'}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap">
                <ReactMarkdown>{msg.message_body}</ReactMarkdown>
              </div>

              {/* CRITICAL INTEGRATION: Surface Action Proposals */}
              {msg.metadata?.hitl_log_id && (
                <div className="mt-4 border-t border-black/20 pt-4">
                  <ActionProposalBlock
                    hitlLogId={msg.metadata.hitl_log_id}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
