import React, { useState } from 'react';
import { FiCpu, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function AutoDraftWhisper({ draftText, onApplyDraft, ticketId }) {
  const [isDismissed, setIsDismissed] = useState(false);

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
          draftLength: draftText.length
        })
      }).catch((e) => console.warn('[FEEDBACK TELEMETRY BYPASS]', e));
    } catch (err) {
      console.warn('[FEEDBACK SESSION ERROR]', err);
    }
  };

  const handleApply = () => {
    sendFeedbackTelemetry('applied');
    if (onApplyDraft) onApplyDraft(draftText);
    toast.success("AI draft whisper applied to composer!", {
      style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
    });
  };

  const handleDismiss = () => {
    sendFeedbackTelemetry('dismissed');
    setIsDismissed(true);
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

      <p className="text-zinc-300 font-sans leading-relaxed text-xs whitespace-pre-wrap bg-black/40 p-3 rounded-xl border border-indigo-500/10">
        {draftText}
      </p>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleDismiss}
          className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={handleApply}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold uppercase text-[10px] transition-all shadow-md"
        >
          <FiCheck className="text-xs"/>
          <span>Apply to Composer</span>
        </button>
      </div>
    </div>
  );
}
