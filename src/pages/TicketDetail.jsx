import React, { useState, useEffect, useRef } from 'react';
import { useTicketStore } from '../store/useTicketStore';
import MessageThread from '../components/tickets/MessageThread';
import OnyxInvestigationPanel from '../components/tickets/OnyxInvestigationPanel';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import Customer360 from '../components/tickets/Customer360';
import KBSidebar from '../components/tickets/KBSidebar';
import SLABadge from '../components/tickets/SLABadge';
import AgentPresence from '../components/AgentPresence';
import { FiSend, FiPaperclip, FiRefreshCw, FiCommand, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

export default function TicketDetail({ ticketId }) {
  const { activeTicket, activeThreadMessages, selectTicket, isLoading, isCoreOnline } = useTicketStore();
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const composerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (ticketId) {
      selectTicket(ticketId);
    }
  }, [ticketId, selectTicket]);

  const handleApplyDraft = (draftText) => {
    setReplyText(prev => prev ? prev + '\n\n' + draftText : draftText);
    if (composerRef.current) {
      composerRef.current.focus();
    }
  };

  const handleTextChange = (e) => {
    setReplyText(e.target.value);

    // Broadcast typing state
    if (!isTyping) setIsTyping(true);

    // Debounce typing state timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2500);
  };

  const handleBlur = () => {
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || isSending) return;

    setIsSending(true);
    setIsTyping(false);
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
      toast.success('Response dispatched successfully!', {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } catch (err) {
      toast.error(`Failed to send message: ${err.message}`);
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
      <div className="h-full flex items-center justify-center p-8 bg-zinc-950/40 rounded-3xl border border-zinc-800/80">
        <FiRefreshCw className="animate-spin text-zinc-500 text-xl"/>
      </div>
    );
  }

  const sampleDraft = activeTicket.metadata?.auto_response_draft || null;
  const isIncomingThread = activeThreadMessages && activeThreadMessages.length > 0 && activeThreadMessages[activeThreadMessages.length - 1].sender_id !== 'operator';

  return (
    <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
      {/* Ticket Header & Presence Bar */}
      <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-zinc-400">#{activeTicket.id.slice(0, 8)}</span>
            <SLABadge priority={activeTicket.priority} status={activeTicket.status}/>
            {/* Live Co-pilot Presence & Typing Tracker */}
            <AgentPresence isTypingLocal={isTyping} ticketId={activeTicket.id}/>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            {new Date(activeTicket.created_at).toLocaleString()}
          </span>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">{activeTicket.subject}</h2>
        <p className="text-xs text-zinc-400 font-sans leading-relaxed">{activeTicket.description}</p>
      </div>

      {/* Main Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Investigation & Message Thread */}
        <div className="lg:col-span-8 space-y-6">
          <OnyxInvestigationPanel ticketId={activeTicket.id}/>

          {sampleDraft && (
            <AutoDraftWhisper draftText={sampleDraft} onApplyDraft={handleApplyDraft}/>
          )}

          <MessageThread messages={activeThreadMessages}/>

          {/* Reply Composer Form */}
          <form onSubmit={handleSendMessage} className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="font-bold uppercase tracking-wider">Reply Composer</span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                <FiCommand className="text-[9px]"/> + Enter to send
              </span>
            </div>

            {isIncomingThread && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-2">
                <FiAlertCircle />
                <span>Incoming message detected in thread. Review before replying.</span>
              </div>
            )}

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
                disabled={!replyText.trim() || isSending || (!isCoreOnline && !activeTicket)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400/20 transition-all disabled:opacity-50"
              >
                <FiSend/>
                <span>{isSending ? 'Dispatching...' : 'Send Reply'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Customer360 & KB Assistant */}
        <div className="lg:col-span-4 space-y-6">
          <Customer360 ticketId={activeTicket.id}/>
          <KBSidebar ticketId={activeTicket.id} onAttachPlaybook={handleApplyDraft}/>
        </div>
      </div>
    </div>
  );
}
