import React, { useState, useEffect } from 'react';
import { FiBookOpen, FiSearch } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function KBSidebar({ ticketId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCognitiveContext = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch ticket subject/description for context
        const { data: ticket } = await supabase.from('support_tickets').select('subject, description').eq('id', ticketId).single();
        if (!ticket) return;

        // 2. Generate a lightweight embedding via edge (or fallback to text search if edge unavailable)
        // For phase 92, we will execute a semantic text search fallback to prevent edge dependency bottlenecks
        const { data, error } = await supabase
          .from('memory_banks')
          .select('id, title, content')
          .textSearch('content', ticket.subject.split(' ').join(' | '))
          .limit(3);

        if (!error && data) setSuggestions(data);
      } catch (err) {
        console.error('KB Retrieval Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (ticketId) fetchCognitiveContext();
  }, [ticketId]);

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-6 border-b border-zinc-800/50 pb-4">
        <div className="w-8 h-8 rounded-xl bg-fuchsia-500/20 flex items-center justify-center border border-fuchsia-500/30">
          <FiBookOpen className="text-fuchsia-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Knowledge Base</h3>
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Auto-Context Active</p>
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
            <div key={item.id} className="p-3 bg-black/40 border border-zinc-800/50 rounded-xl hover:border-fuchsia-500/30 transition-colors cursor-pointer group">
              <h4 className="text-xs font-bold text-zinc-300 mb-1 group-hover:text-fuchsia-400 transition-colors">{item.title}</h4>
              <p className="text-[10px] text-zinc-500 line-clamp-2">{item.content}</p>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-zinc-600 text-xs font-mono">
            <FiSearch className="mx-auto mb-2 text-zinc-700 text-lg" />
            No semantic playbooks found for this incident.
          </div>
        )}
      </div>
    </div>
  );
}
