import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiCode, FiExternalLink, FiChevronDown, FiChevronRight, FiGitCommit, FiUser, FiCpu, FiFileText, FiMail, FiCheck, FiEye, FiAlertCircle, FiDatabase } from 'react-icons/fi';
import { useTicketStore } from '../../store/useTicketStore';

export default function MessageThread({ messages = [], ticketStatus, isLoading }) {
  const contributeToOnyxMemory = useTicketStore(state => state.contributeToOnyxMemory);
  const activeTicket = useTicketStore(state => state.activeTicket);

  const [expandedDiffs, setExpandedDiffs] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const toggleDiff = (msgId) => {
    setExpandedDiffs(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="space-y-4 my-4">
      {isLoading && messages.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-2xl border bg-black/40 border-zinc-800/60 relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-0"></div>
              <div className="relative z-10 space-y-4 w-full">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-zinc-900 animate-pulse"></div>
                      <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse"></div>
                   </div>
                   <div className="h-3 w-16 bg-zinc-900 rounded animate-pulse"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-zinc-800 rounded w-full animate-pulse"></div>
                  <div className="h-3 bg-zinc-800 rounded w-5/6 animate-pulse"></div>
                  <div className="h-3 bg-zinc-800 rounded w-4/6 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      ) : (
        messages.map((msg) => {
        const isGitOpsPatch = msg.metadata?.source_interlock === 'the_coding_lab' || msg.metadata?.patch_delta;
        const isEmailInbound = msg.metadata?.source === 'emailit_inbound_webhook';
        const hasParsedAttachments = msg.metadata?.has_parsed_attachments;
        const isSystem = msg.sender_id === 'onyx_system' || msg.sender_id === 'system' || isGitOpsPatch;

        return (
          <div
            key={msg.id || Math.random()}
            className={`p-4 rounded-2xl border transition-all ${
              isGitOpsPatch
                ? 'bg-purple-950/20 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                : isEmailInbound
                  ? 'bg-sky-950/20 border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.05)]'
                  : isSystem
                    ? 'bg-zinc-900/50 border-zinc-800'
                    : 'bg-black/40 border-zinc-800/60'
            }`}
          >
            {/* Header / Sender */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${
                  isGitOpsPatch ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                  isEmailInbound ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' :
                  isSystem ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {isGitOpsPatch ? <FiCode/> : isEmailInbound ? <FiMail/> : isSystem ? <FiCpu/> : <FiUser/>}
                </div>
                <span className="text-xs font-mono font-bold text-zinc-300">
                  {isGitOpsPatch ? 'The Coding Lab Interlock' : isEmailInbound ? `Inbound Email (\${msg.sender_id})` : msg.sender_id}
                </span>

                {msg.is_internal_note && (
                  <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase">
                    Internal Note
                  </span>
                )}

                {hasParsedAttachments && (
                  <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase flex items-center gap-1">
                    <FiFileText className="text-[9px]"/> Workers AI Doc Parsed
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                <span>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}</span>
                {(!isSystem && !isEmailInbound && (ticketStatus === "resolved" || activeTicket?.status === "resolved")) && (
                  msg.metadata?.onyx_saved ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold" title="Saved to KB">
                      <FiCheck /> Saved to KB
                    </span>
                  ) : (
                    <button
                      onClick={() => contributeToOnyxMemory(activeTicket?.id || msg.ticket_id, msg.message_body, msg.id)}
                      className="flex items-center gap-1 text-[10px] bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700 transition-colors"
                      title="Add to Onyx Knowledge Base"
                    >
                      <FiDatabase /> Add to Onyx
                    </button>
                  )
                )}
                {msg.metadata?.delivery_status === 'delivered' && (
                  <div className="flex -space-x-1 text-emerald-400" title="Delivered">
                    <FiCheck /><FiCheck />
                  </div>
                )}
                {msg.metadata?.delivery_status === 'opened' && (
                  <span className="text-sky-400" title="Opened"><FiEye /></span>
                )}
                {msg.metadata?.delivery_status === 'bounced' && (
                  <span className="text-red-400" title="Bounced"><FiAlertCircle /></span>
                )}
              </div>
            </div>

            {/* Message Body */}
            <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">
              {msg.message_body}
            </p>

            {/* GitOps Interactive Patch Card */}
            {isGitOpsPatch && (
              <div className="mt-3 p-3 bg-black/60 border border-purple-500/20 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2 text-purple-300">
                    <FiGitCommit className="text-purple-400"/>
                    <span>SHA: {msg.metadata?.commit_sha?.slice(0, 7) || 'HEAD'}</span>
                  </div>
                  {msg.metadata?.pr_url && (
                    <a
                      href={msg.metadata.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 underline font-bold"
                    >
                      View Pull Request <FiExternalLink/>
                    </a>
                  )}
                </div>

                {msg.metadata?.patch_delta && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <button
                      type="button"
                      onClick={() => toggleDiff(msg.id)}
                      className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {expandedDiffs[msg.id] ? <FiChevronDown/> : <FiChevronRight/>}
                      <span>{expandedDiffs[msg.id] ? 'Hide Code Diff' : 'Inspect Code Diff'}</span>
                    </button>

                    {expandedDiffs[msg.id] && (
                      <pre className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre break-words max-h-60">
                        {msg.metadata.patch_delta}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }) )}

      <div ref={messagesEndRef} />
    </div>
  );
}
