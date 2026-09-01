import React, { useState, useEffect, useRef } from 'react';
import { useTicketStore } from '../store/useTicketStore';
import MessageThread from '../components/tickets/MessageThread';
import OnyxInvestigationPanel from '../components/tickets/OnyxInvestigationPanel';
import RCADocumentBlock from '../components/tickets/RCADocumentBlock';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import Customer360 from '../components/tickets/Customer360';
import KBSidebar from '../components/tickets/KBSidebar';
import SLABadge from '../components/tickets/SLABadge';
import AgentPresence from '../components/AgentPresence';
import { FiSend, FiPaperclip, FiRefreshCw, FiCommand, FiBell, FiMail } from 'react-icons/fi';
import { showToast } from '../lib/toast';
import { supabase } from '../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';

export default function TicketDetail({ ticketId }) {
  const { activeTicket, activeThreadMessages, selectTicket, isLoading, trackPresence, untrackPresence, updateTypingStatus, activeAgents } = useTicketStore();



  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rcaRecord, setRcaRecord] = useState(null);
  const [hasNewIncoming, setHasNewIncoming] = useState(false);
  const prevMessageCountRef = useRef(activeThreadMessages?.length || 0);
  const composerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const fetchRcaRecord = async () => {
    if (!ticketId) return;
    try {
      const { data, error } = await supabase
        .from('hitl_audit_logs')
        .select('*')
        .eq('support_ticket_id', ticketId)
        .eq('tool_type', 'rca_report')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setRcaRecord(data[0]);
      } else {
        setRcaRecord(null);
      }
    } catch (e) {
      console.error("Failed to fetch RCA record:", e);
    }
  };

  useEffect(() => {
    if (ticketId) {
      selectTicket(ticketId);
      setHasNewIncoming(false);
      fetchRcaRecord();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          trackPresence(ticketId, user.email);
        }
      });
    }

    return () => {
       untrackPresence();
    }
  }, [ticketId, selectTicket, trackPresence, untrackPresence]);

  useEffect(() => {
    if (activeThreadMessages && activeThreadMessages.length > prevMessageCountRef.current) {
      if (replyText.trim().length > 0) {
        setHasNewIncoming(true);
      }
    }
    prevMessageCountRef.current = activeThreadMessages?.length || 0;
  }, [activeThreadMessages?.length, replyText]);

  const handleApplyDraft = (draftText) => {
    setReplyText((prev) => (prev ? `${prev}\n\n${draftText}` : draftText));
    if (composerRef.current) {
      composerRef.current.focus();
    }
  };

  const handleExportBriefing = async () => {
    if (isExporting || !activeTicket) return;
    setIsExporting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/executive/export-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticketId: activeTicket.id })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to export briefing.');

      showToast.success("Executive thread briefing emailed to james.ellars@axim.us.com!");
    } catch (err) {
      showToast.error(`Briefing Export Error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTextChange = (e) => {
    setReplyText(e.target.value);
    if (!isTyping) {
        setIsTyping(true);
        updateTypingStatus(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(false);
    }, 2500);
  };

  const handleBlur = () => {
    setIsTyping(false);
    updateTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || isSending) return;

    setIsSending(true);
    setIsTyping(false);
    updateTypingStatus(false);
    setHasNewIncoming(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: activeTicket.id,
        sender_id: user?.email || 'operator',
        message_body: replyText.trim(),
        is_internal_note: false
      });

      if (error) throw error;

      setReplyText('');
      showToast.success('Response dispatched successfully!');
    } catch (err) {
      showToast.error(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading || !activeTicket) {
    return (
      <div className="h-full flex flex-col p-6 bg-zinc-950/50 rounded-3xl border border-zinc-800/80 relative overflow-hidden">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-0"></div>
        <div className="relative z-10 w-full space-y-6">
          <div className="flex justify-between items-start">
             <div className="space-y-3 w-1/2">
                <div className="h-6 w-3/4 bg-zinc-800 rounded-lg animate-pulse"></div>
                <div className="flex gap-2">
                   <div className="h-4 w-20 bg-zinc-900 rounded animate-pulse"></div>
                   <div className="h-4 w-24 bg-zinc-900 rounded animate-pulse"></div>
                </div>
             </div>
             <div className="flex gap-2">
                <div className="h-8 w-24 bg-zinc-900 rounded-lg animate-pulse"></div>
                <div className="h-8 w-8 bg-zinc-900 rounded-lg animate-pulse"></div>
             </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
             <div className="h-24 bg-zinc-900/80 rounded-xl border border-zinc-800 animate-pulse"></div>
             <div className="h-24 bg-zinc-900/80 rounded-xl border border-zinc-800 animate-pulse"></div>
             <div className="h-24 bg-zinc-900/80 rounded-xl border border-zinc-800 animate-pulse"></div>
          </div>
          <div className="flex-1 space-y-4 mt-8">
             <div className="h-16 w-full bg-zinc-900/60 rounded-xl animate-pulse"></div>
             <div className="h-24 w-3/4 bg-zinc-900/60 rounded-xl animate-pulse"></div>
             <div className="h-20 w-5/6 bg-zinc-900/60 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  // Let React render conditionally if llmDraftText is defined below.
let llmDraftText = '';
const sampleDraft = llmDraftText || activeTicket.metadata?.auto_response_draft || null;

  return (
    <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
      {/* Ticket Header & Presence Bar */}
      <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-zinc-400">#{activeTicket.id.slice(0, 8)}</span>
            <SLABadge priority={activeTicket.priority} status={activeTicket.status} />
            <AgentPresence ticketId={activeTicket.id} />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportBriefing}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-mono font-bold uppercase text-sky-300 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-all disabled:opacity-50"
              title="Summarize and email thread briefing to Mr. Ellars"
            >
              <FiMail className={isExporting ? "animate-spin" : ""} />
              <span>{isExporting ? 'Exporting...' : 'Email Briefing'}</span>
            </button>
            <span className="text-[10px] font-mono text-zinc-500">
              {new Date(activeTicket.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">{activeTicket.subject}</h2>
        <p className="text-xs text-zinc-400 font-sans leading-relaxed">{activeTicket.description}</p>
      </div>

      {/* Main Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {rcaRecord && (
            <RCADocumentBlock
              rcaRecord={rcaRecord}
              onFinalized={() => {
                fetchRcaRecord();
                selectTicket(activeTicket.id);
              }}
            />
          )}
          <OnyxInvestigationPanel ticketId={activeTicket.id} />

          {sampleDraft && (
            <AutoDraftWhisper draftText={sampleDraft} onApplyDraft={handleApplyDraft} />
          )}

          <MessageThread messages={activeThreadMessages} />

          {hasNewIncoming && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-300 animate-pulse">
              <div className="flex items-center gap-2">
                <FiBell className="text-amber-400"/>
                <span>New activity received in thread while composing reply.</span>
              </div>
              <button
                type="button"
                onClick={() => setHasNewIncoming(false)}
                className="text-[10px] uppercase font-bold text-amber-400 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Collision Warning */}
          {(() => {
            const collisionAgents = activeAgents.filter(
              (agent) => agent.ticket_id === activeTicket.id && agent.is_typing && !isTyping
            );
            return collisionAgents.length > 0 ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-300 animate-pulse">
                <div className="flex items-center gap-2">
                  <FiBell className="text-amber-400"/>
                  <span>⚠️ {collisionAgents[0].email} is currently drafting a response...</span>
                </div>
              </div>
            ) : null;
          })()}

          {/* Reply Composer Form */}
          <form onSubmit={handleSendMessage} className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="font-bold uppercase tracking-wider">Reply Composer</span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                <FiCommand className="text-[9px]"/> + Enter to send
              </span>
            </div>
            <textarea
              ref={composerRef}
              value={replyText}
              onChange={handleTextChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Type your response or apply an AI draft whisper..."
              rows={4}
              className="w-full p-3 rounded-xl bg-black/50 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none font-sans"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 text-xs transition-colors"
                title="Attach file"
              >
                <FiPaperclip/>
              </button>
              <button
                type="submit"
                disabled={!replyText.trim() || isSending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400/20 transition-all disabled:opacity-50"
              >
                <FiSend/>
                <span>{isSending ? 'Dispatching...' : 'Send Reply'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Customer360 ticketId={activeTicket.id} />
          <KBSidebar onAttachPlaybook={handleApplyDraft} ticketId={activeTicket.id} />
        </div>
      </div>
    </div>
  );
}
