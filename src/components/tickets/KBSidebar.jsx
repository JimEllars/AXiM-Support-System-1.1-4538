import React, { useState, useEffect } from 'react';
import { FiBookOpen, FiSearch, FiTarget } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function KBSidebar({ ticketId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCognitiveContext = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch ticket subject/description for context parameters mapping
        const { data: ticket } = await supabase
          .from('support_tickets')
          .select('subject, description')
          .eq('id', ticketId)
          .single();

        if (!ticket) return;

        // 2. Resolve live session token attributes via Supabase Auth
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || "";

        // 3. Connect cockpit interface to our Cloudflare KV-backed edge vector engine
        const workerUrl = getEdgeWorkerUrl();
        const res = await fetch(`${workerUrl}/vector-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query: `${ticket.subject} ${ticket.description || ""}` })
        });

        if (res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data) ? data : []);
        } else {
          console.warn("[EDGE RAG UNREACHABLE: Falling back to silent baseline matrix channel]");
        }
      } catch (err) {
        console.error('Edge RAG Retrieval Handshake Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (ticketId) fetchCognitiveContext();
  }, [ticketId]);

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
      <div className="flex items-center gap-3 mb-6 border-b border-zinc-800/50 pb-4">
        <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 flex items-center justify-center border border-fuchsia-500/20">
          <FiBookOpen className="text-fuchsia-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Knowledge Base</h3>
          <p className="text-[10px] text-fuchsia-400 font-mono uppercase tracking-widest flex items-center gap-1">
            <FiTarget className="animate-pulse" /> Edge-RAG Caching Active
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-zinc-900/50 rounded-xl" />
            <div className="h-16 bg-zinc-900/50 rounded-xl" />
          </div>
        ) : suggestions.length > 0 ? (
          suggestions.map((item) => (
            <div key={item.id} className="p-4 bg-black/40 border border-zinc-800/40 rounded-xl hover:border-fuchsia-500/30 transition-all duration-300 cursor-pointer group relative">
              <div className="flex justify-between items-start gap-2 mb-1">
                <h4 className="text-xs font-bold text-zinc-300 group-hover:text-fuchsia-400 transition-colors line-clamp-1">
                  {item.title}
                </h4>

                {/* THE 5% TELEMETRY FEATURE: Surface active cosine similarity match relevance metrics */}
                {item.relevance && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 font-mono text-[8px] rounded uppercase font-black tracking-wider">
                    {item.relevance}% Match
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-3 pl-0.5 border-l border-zinc-800 group-hover:border-fuchsia-500/20 transition-colors">
                {item.content}
              </p>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-zinc-600 text-xs font-mono">
            <FiSearch className="mx-auto mb-2 text-zinc-700 text-lg" />
            No semantic playbooks found for this incident.
          </div>
        )}
      </div>
    </div>
  );
}
