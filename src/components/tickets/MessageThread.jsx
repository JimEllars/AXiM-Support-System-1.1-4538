import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import ActionProposalBlock from './ActionProposalBlock';
import ReactMarkdown from 'react-markdown';

const { FiUser, FiCpu, FiLock, FiTerminal } = FiIcons;

import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect, useRef } from 'react';

export default function MessageThread({ ticketId, messages: overrideMessages, currentTicketStatus }) {
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div className="flex-1 flex items-center justify-center text-zinc-500 font-mono text-xs border-2 border-dashed border-zinc-800/50 rounded-2xl m-6">
        No messages in this thread.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
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

              {/* GITOPS METADATA VISUALIZATION BLOCK */}
              {msg.metadata?.source_interlock === "the_coding_lab" && msg.metadata?.patch_delta && (
                <div className="mt-4 border-t border-cyan-500/20 pt-4">
                  <div className="bg-black/40 rounded-xl p-4 border border-cyan-500/10 shadow-inner">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <SafeIcon icon={FiTerminal} className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-widest">GitOps Code Patch Delta</span>
                      </div>
                      {msg.metadata?.pr_url && (
                        <a
                          href={msg.metadata.pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/20 transition-colors"
                        >
                          View Pull Request &rarr;
                        </a>
                      )}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto rounded-lg bg-[#0d1117] border border-zinc-800 p-3 custom-scrollbar">
                      <pre className="text-[11px] font-mono leading-relaxed text-zinc-300 whitespace-pre">
                        <code>{msg.metadata.patch_delta}</code>
                      </pre>
                    </div>
                    {msg.metadata?.commit_sha && (
                      <div className="mt-3 text-[10px] text-zinc-500 font-mono text-right flex items-center justify-end gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse"></span>
                        Branch Compiled: {msg.metadata.commit_sha}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} className="h-1" />
    </div>
  );
}
