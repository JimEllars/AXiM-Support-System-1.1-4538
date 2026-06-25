import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { FiCpu, FiCheck } from 'react-icons/fi';

export default function AutoDraftWhisper({ ticketId, onApplyDraft }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    const fetchDraft = async () => {
      const { data } = await supabase
        .from('ticket_ai_telemetry')
        .select('auto_response_draft, confidence_score')
        .eq('ticket_id', ticketId)
        .single();
      if (data && data.auto_response_draft) setDraft(data);
    };
    if (ticketId) fetchDraft();
  }, [ticketId]);

  if (!draft) return null;

  return (
    <div className="bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-2xl p-5 mb-6 relative overflow-hidden shadow-[0_0_20px_rgba(217,70,239,0.05)]">
      <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500"></div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-fuchsia-400 text-[10px] font-black uppercase tracking-widest">
          <FiCpu className="animate-pulse text-sm" />
          Onyx Suggested Response ({draft.confidence_score}% Confidence)
        </div>
        <button
          onClick={() => onApplyDraft(draft.auto_response_draft)}
          className="flex items-center gap-2 px-3 py-1.5 bg-fuchsia-500/20 hover:bg-fuchsia-500/40 text-fuchsia-300 rounded-lg text-xs font-bold uppercase transition-colors"
        >
          <FiCheck /> Apply to Editor
        </button>
      </div>
      <div className="text-zinc-300 text-sm font-mono whitespace-pre-wrap pl-2 border-l border-fuchsia-500/20">
        {draft.auto_response_draft}
      </div>
    </div>
  );
}
