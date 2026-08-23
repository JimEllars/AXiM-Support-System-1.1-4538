import React, { useState } from 'react';
import { FiCpu, FiCheck, FiX, FiSend, FiEdit2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function AutoDraftWhisper({ draftText, onApplyDraft, ticketId }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(draftText);
  const [isSending, setIsSending] = useState(false);

  if (!draftText || isDismissed) return null;

  const sendFeedbackTelemetry = async (action) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const workerUrl = getEdgeWorkerUrl();
      fetch(`${workerUrl}/api/v1/telemetry/autodraft-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: ticketId || 'unknown',
          action,
          draftLength: editedText.length
        })
      }).catch((e) => console.warn('[FEEDBACK TELEMETRY BYPASS]', e));
    } catch (err) {
      console.warn('[FEEDBACK SESSION ERROR]', err);
    }
  };

  const handleApply = () => {
    sendFeedbackTelemetry('applied');
    if (onApplyDraft) onApplyDraft(editedText);
    toast.success("AI draft whisper applied to composer!", {
      style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
    });
  };

  const handleDismiss = () => {
    sendFeedbackTelemetry('dismissed');
    setIsDismissed(true);
  };

  const handleApproveAndSend = async () => {
    if (!ticketId) {
      toast.error("Cannot dispatch without a valid Ticket ID.");
      return;
    }

    setIsSending(true);
    sendFeedbackTelemetry('approved_and_dispatched');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const workerUrl = getEdgeWorkerUrl();
      const response = await fetch(`${workerUrl}/api/v1/actions/dispatch-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId,
          content: editedText
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to dispatch email');
      }

      toast.success("Response dispatched via EmailIt successfully!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });

      setIsDismissed(true);
    } catch (error) {
      toast.error(error.message || "Failed to dispatch. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 backdrop-blur-md space-y-3 font-mono text-xs shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-300 font-bold uppercase tracking-wider text-[11px]">
          <FiCpu className="text-indigo-400 animate-pulse"/>
          <span>Onyx AI Response Whisper</span>
        </div>

        <button
          onClick={handleDismiss}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Dismiss AI Suggestion"
        >
          <FiX className="text-xs"/>
        </button>
      </div>

      {isEditing ? (
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full bg-black/60 text-zinc-300 p-3 rounded-xl border border-indigo-500/30 focus:outline-none focus:border-indigo-400 font-sans text-xs min-h-[120px] resize-y"
        />
      ) : (
        <p className="text-zinc-300 font-sans leading-relaxed text-xs whitespace-pre-wrap bg-black/40 p-3 rounded-xl border border-indigo-500/10">
          {editedText}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase text-indigo-400 hover:bg-indigo-500/10 transition-colors"
        >
          <FiEdit2 className="text-xs" />
          <span>{isEditing ? 'Preview' : 'Edit Draft'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDismiss}
            disabled={isSending}
            className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            Dismiss
          </button>

          <button
            onClick={handleApply}
            disabled={isSending}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold uppercase text-[10px] transition-all shadow-md disabled:opacity-50"
          >
            <FiCheck className="text-xs"/>
            <span>Apply</span>
          </button>

          <button
            onClick={handleApproveAndSend}
            disabled={isSending || !editedText.trim()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold uppercase text-[10px] transition-all shadow-md disabled:opacity-50"
          >
            {isSending ? (
               <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
               <FiSend className="text-xs"/>
            )}
            <span>Approve & Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
