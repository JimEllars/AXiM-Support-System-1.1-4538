import React, { useState } from 'react';
import { FiBookOpen, FiSearch, FiCpu, FiCornerDownLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function KBSidebar({ ticketId, onAttachPlaybook }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [provenance, setProvenance] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/kb/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
        setProvenance(data.provenance || 'text_matching');
      }
    } catch (err) {
      console.error('KB Vector search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttach = (content) => {
    if (onAttachPlaybook) {
      onAttachPlaybook(content);
      toast.success("Playbook steps attached to composer!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2 text-zinc-300 font-mono text-xs font-bold">
          <FiBookOpen className="text-indigo-400"/>
          <span className="uppercase tracking-wider">Knowledge Playbooks</span>
        </div>
        {provenance === 'cloudflare_vector_bge' && (
          <span className="text-[9px] font-mono text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/20 flex items-center gap-1">
            <FiCpu className="text-[9px]"/> VECTOR RAG
          </span>
        )}
      </div>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search semantic playbooks..."
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 font-sans"
        />
        <FiSearch className="absolute left-3 top-2.5 text-zinc-500 text-xs"/>
      </form>

      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center py-4 text-xs font-mono text-zinc-500 animate-pulse">
            Generating edge vector embeddings...
          </div>
        ) : articles.length > 0 ? (
          articles.map((art) => (
            <div key={art.id} className="p-3 rounded-xl bg-black/40 border border-zinc-800/60 space-y-2 hover:border-zinc-700 transition-colors">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-200 truncate pr-2">{art.title}</h4>
                <span className="text-[9px] font-mono text-indigo-400 uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                  {art.category || 'Docs'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2 font-sans leading-relaxed">
                {art.content}
              </p>
              <button
                type="button"
                onClick={() => handleAttach(art.content)}
                className="w-full flex items-center justify-center gap-1 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-indigo-300 border border-zinc-800 transition-all"
              >
                <FiCornerDownLeft className="text-[9px]"/> Insert Playbook into Reply
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-xs font-mono text-zinc-600">
            Enter keywords to query edge playbooks.
          </div>
        )}
      </div>
    </div>
  );
}
