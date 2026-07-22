import React, { useState, useEffect, useRef } from 'react';
import { useTicketStore } from '../store/useTicketStore';
import MessageThread from '../components/tickets/MessageThread';
import OnyxInvestigationPanel from '../components/tickets/OnyxInvestigationPanel';
import ActionProposalBlock from '../components/tickets/ActionProposalBlock';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import Customer360 from '../components/tickets/Customer360';
import KBSidebar from '../components/tickets/KBSidebar';
import SLABadge from '../components/tickets/SLABadge';
import DLQMonitorBlock from '../components/tickets/DLQMonitorBlock';
import { FiSend, FiPaperclip, FiCornerDownLeft, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

export default function TicketDetail({ ticketId }) {
  const { activeTicket, activeThreadMessages, selectTicket, isLoading } = useTicketStore();
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const composerRef = useRef(null);

  useEffect(() => {
    if (ticketId) {
      selectTicket(ticketId);
    }
  }, [ticketId, selectTicket]);

  const handleApplyDraft = (draftText) => {
    setReplyText(draftText);
    if (composerRef.current) {
      composerRef.current.focus();
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || isSending) return;

    setIsSending(true);
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

  if (isLoading || !activeTicket) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-zinc-950/40 rounded-3xl border border-zinc-800/80">
        <FiRefreshCw className="animate-spin text-zinc-500 text-xl"/>
      </div>
    );
  }

  // Extract draft if available in telemetry/messages
  const sampleDraft = activeTicket.metadata?.auto_response_draft || null;

  return (
    <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
      {/* Ticket Header & Metadata Bar */}
      <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-zinc-400">#{activeTicket.id.slice(0, 8)}</span>
            <SLABadge priority="{activeTicket.priority}" status="{activeTicket.status}"/>
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
          <OnyxInvestigationPanel ticketId="{activeTicket.id}"/>

          {/* AI Auto-Draft Whisper Component with Inject Handler */}
          {sampleDraft && (
            <AutoDraftWhisper draftText="{sampleDraft}" onApplyDraft="{handleApplyDraft}"/>
          )}

          {/* Interactive Message Thread */}
          <MessageThread messages="{activeThreadMessages}"/>

          {/* Reply Composer Form */}
          <form onSubmit={handleSendMessage} className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="font-bold uppercase tracking-wider">Reply Composer</span>
              <span className="text-[10px] text-zinc-500">Press Enter or click Send</span>
            </div>
            <textarea
              ref={composerRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
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

        {/* Right Column: Customer360 & KB Assistant */}
        <div className="lg:col-span-4 space-y-6">
          <Customer360 ticketId="{activeTicket.id}"/>
          <KBSidebar ticketId="{activeTicket.id}"/>
        </div>
      </div>
    </div>
  );
}
