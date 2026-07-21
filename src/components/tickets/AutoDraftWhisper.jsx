import React, { useState } from 'react';
import { FiZap, FiCheck, FiCopy, FiMessageSquare } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';

export default function AutoDraftWhisper({ ticketId, draftText, onApplyDraft }) {
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  const handleApply = async () => {
    if (!draftText || isApplying) return;
    setIsApplying(true);

    try {
      // 1. Pass draft content upward to the ticket reply composer
      if (onApplyDraft) {
        onApplyDraft(draftText);
      }

      // 2. Fetch operator session to bind telemetry identity
      const { data: { session } } = await supabase.auth.getSession();
      const operatorId = session?.user?.id || 'anonymous_operator';

      // 3. Log explicit AI draft acceptance telemetry event
      await supabase.from('events_ax2024').insert({
        type: 'autodraft_accepted',
        payload: {
          ticket_id: ticketId,
          operator_id: operatorId,
          draft_length: draftText.length,
          timestamp: new Date().toISOString()
        }
      });

      setHasApplied(true);
      toast.success('AI Draft applied to composer!', {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } catch (err) {
      console.error('Failed to log autodraft telemetry:', err);
      // Still apply draft even if telemetry logging encounters network jitter
      if (onApplyDraft) onApplyDraft(draftText);
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draftText);
    toast.success('Draft copied to clipboard!');
  };

  if (!draftText) return null;

  return (
    <div className="my-3 p-4 rounded-2xl border bg-purple-950/20 border-purple-500/30 relative overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
          <FiZap className="animate-pulse"/> Onyx AI Response Suggestion
        </div>
        <span className="text-[9px] font-mono bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">
          Confidence Verified
        </span>
      </div>

      <p className="text-xs text-zinc-300 font-sans leading-relaxed my-2 bg-black/40 p-3 rounded-xl border border-purple-500/10 whitespace-pre-wrap">
        {draftText}
      </p>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 transition-all"
        >
          <FiCopy/> Copy Text
        </button>

        <button
          onClick={handleApply}
          disabled={isApplying || hasApplied}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase border transition-all ${
            hasApplied
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-purple-500 hover:bg-purple-400 text-black border-purple-400/20 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
          }`}
        >
          {hasApplied ? <FiCheck/> : <FiMessageSquare/>}
          {hasApplied ? 'Applied to Reply' : 'Apply Draft to Reply'}
        </button>
      </div>
    </div>
  );
}
