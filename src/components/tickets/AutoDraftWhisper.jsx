import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { FiCpu, FiCheck, FiZap } from 'react-icons/fi';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function AutoDraftWhisper({ ticketId, onApplyDraft }) {
  const [draft, setDraft] = useState(null);
  const [provenanceTag, setProvenanceTag] = useState("unknown");

  useEffect(() => {
    const fetchDraft = async () => {
      try {
        const { data: ticketData } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('id', ticketId)
          .single();
        if (!ticketData) return;

        const workerUrl = getEdgeWorkerUrl();
        const { data: { session } } = await supabase.auth.getSession();

        // Use user session JWT as required by the new backend implementation
        const token = session?.access_token || "";

        const res = await fetch(`${workerUrl}/api/v1/onyx/generate-suggestion`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            subject: ticketData.subject,
            description: ticketData.description,
            context_messages: []
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.draft) {
            setDraft(data.draft);
            setProvenanceTag(data.model_provenance || "Claude-Legacy");
          }
        }
      } catch (err) {
        console.error("Failed to fetch suggestion", err);
      }
    };
    if (ticketId) fetchDraft();
  }, [ticketId]);

  if (!draft) return null;

  return (
    <div className="bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-2xl p-5 mb-6 relative overflow-hidden shadow-[0_0_20px_rgba(217,70,239,0.05)]">
      <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500"></div>
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800/50 pb-2">
        <div className="flex items-center gap-2 text-fuchsia-400 font-black uppercase tracking-widest text-[10px]">
          <FiZap className="animate-pulse" /> Onyx Auto-Draft Whisper
          {provenanceTag !== "unknown" && (
            <span className="ml-2 px-1.5 py-0.5 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 font-mono text-[8px] rounded uppercase tracking-wider">
              {provenanceTag}
            </span>
          )}
        </div>
        <button
          onClick={() => onApplyDraft(draft)}
          className="flex items-center gap-2 px-3 py-1.5 bg-fuchsia-500/20 hover:bg-fuchsia-500/40 text-fuchsia-300 rounded-lg text-xs font-bold uppercase transition-colors"
        >
          <FiCheck /> Apply to Editor
        </button>
      </div>
      <div className="text-zinc-300 text-sm font-mono whitespace-pre-wrap pl-2 border-l border-fuchsia-500/20">
        {draft}
      </div>
    </div>
  );
}
