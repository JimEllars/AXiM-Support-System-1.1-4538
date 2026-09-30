import { sanitizePayload } from '../../lib/sanitize';
import React, { useState } from 'react';
import { FiCpu, FiCheck, FiX, FiSend, FiEdit2 } from 'react-icons/fi';
import { showToast as toast } from '../../lib/toast';
import { trackEvent, trackAiTelemetry } from '../../lib/telemetry';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function AutoDraftWhisper({ draftText, onApplyDraft, ticketId, metadata, onInsertReply }) {
  const abortControllerRef = React.useRef(null);
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
         abortControllerRef.current.abort();
      }
    };
  }, [ticketId]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false); // added loading state

  // Use localStorage or persist the state safely so re-renders don't blast the edit
  const [editedText, setEditedText] = useState(() => {
    const saved = localStorage.getItem(`draft_${ticketId}`);
    return saved !== null ? saved : draftText;
  });

  React.useEffect(() => {
    localStorage.setItem(`draft_${ticketId}`, editedText);
  }, [editedText, ticketId]);

  const [isSending, setIsSending] = useState(false);

  // Keyboard shortcut hint (Alt + Enter)
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key === 'Enter' && !isDismissed && draftText) {
        handleApply();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDismissed, draftText, editedText]); // Added editedText dependency since handleApply uses it


  if (!draftText || isDismissed) return null;

  const sendFeedbackTelemetry = (action) => {
    trackEvent('autodraft_feedback', {
        ticketId: ticketId || 'unknown',
        action,
        draftLength: editedText.length
    });
  };

  const handleApply = async () => {
    const wasModified = editedText !== draftText;
    const startTime = performance.now();
    try {
      if (onInsertReply) {
          onInsertReply(editedText);
      } else if (onApplyDraft) {
          onApplyDraft(editedText); // fallback just in case
      }

      const latency = Math.round(performance.now() - startTime);

      await trackAiTelemetry({
        ticketId: ticketId,
        actionType: 'autodraft_applied',
        modelProvider: metadata?.provider || 'gemini-1.5-flash',
        isCurated: wasModified,
        latencyMs: latency,
        metadata: {
          originalLength: draftText?.length || 0,
          appliedLength: editedText.length,
          wasModified,
          confidence: metadata?.confidence
        }
      });

      toast.success(wasModified ? 'Curated draft applied' : 'AI draft inserted into reply');
    } catch (err) {
      console.error('Telemetry logging failed:', err);
    }
    localStorage.removeItem(`draft_${ticketId}`);
    // setIsDismissed(true); // Don't dismiss immediately, let them see it applied or maybe they want to send directly
  };


  const handleDismiss = () => {
    sendFeedbackTelemetry('dismissed');
    localStorage.removeItem(`draft_${ticketId}`);
    setIsDismissed(true);
  };

  const handleApproveAndSend = async () => {
    if (!ticketId) {
      toast.error("Cannot dispatch without a valid Ticket ID.");
      return;
    }

    setIsSending(true);
    sendFeedbackTelemetry('approved_and_dispatched');

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

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
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          ticketId,
          content: editedText
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to dispatch email');
      }

      toast.success("Response dispatched via EmailIt successfully!");
      localStorage.removeItem(`draft_${ticketId}`);
      setIsDismissed(true);
    } catch (error) {
      if (error.name !== 'AbortError') {
         toast.error(error.message || "Failed to dispatch. Please try again.");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 backdrop-blur-md space-y-3 font-mono text-xs shadow-lg ${isGenerating ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between">

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-indigo-300 font-bold uppercase tracking-wider text-[11px]">
            <FiCpu className="text-indigo-400 animate-pulse"/>
            <span>Onyx AI Response Whisper</span>
          </div>
          {metadata && metadata.provider && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] border ${metadata.provider === 'deepseek' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : metadata.provider === 'anthropic' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' : 'border-blue-500/30 text-blue-400 bg-blue-500/10'}`}>
              {metadata.provider === 'deepseek' ? 'DeepSeek V3' : metadata.provider === 'anthropic' ? 'Anthropic Backup' : metadata.provider}
              {metadata.latencyMs && <span className="opacity-60 ml-1 text-[8px] tracking-tighter">{metadata.latencyMs}ms</span>}
            </div>
          )}
          {metadata && metadata.confidence && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] border border-cyan-500/30 text-cyan-400 bg-cyan-500/10" title="Confidence Score">
                  Confidence: {metadata.confidence}%
              </div>
          )}
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
          {typeof editedText === 'string' ? sanitizePayload({ text: editedText }).text : editedText}
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
            title="Alt + Enter"
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold uppercase text-[10px] transition-all shadow-md disabled:opacity-50"
          >
            <FiCheck className="text-xs"/>
            <span>Insert into Reply</span>
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
