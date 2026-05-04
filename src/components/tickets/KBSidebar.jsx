import React, { useEffect, useState } from 'react';
import { onyxService } from '../../services/onyxService';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiCpu, FiExternalLink, FiTarget, FiCopy } = FiIcons;

export default function KBSidebar({ subject, description, onCopySolution }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!subject && !description) return;
      const data = await onyxService.getKBSuggestions(subject, description);
      setSuggestions(data);
      setLoading(false);
    };
    load();
  }, [subject, description]);

  return (
    <div className="glass-panel p-8 rounded-[2rem] border-fuchsia-500/20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-fuchsia-500/10 rounded-lg">
          <SafeIcon icon={FiCpu} className="text-fuchsia-500 text-xl" />
        </div>
        <h2 className="font-black text-zinc-100 uppercase tracking-widest text-sm">Onyx Resolution Engine</h2>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-20 bg-zinc-800/50 rounded-2xl" />)}
          </div>
        ) : (
          suggestions.map((item) => (
            <div key={item.id} className="group p-5 bg-zinc-950/50 hover:bg-fuchsia-500/5 rounded-2xl border border-zinc-800 hover:border-fuchsia-500/40 transition-all cursor-pointer relative">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <SafeIcon icon={FiTarget} className="text-fuchsia-500 text-xs" />
                  <span className="mono-font text-[10px] font-black text-fuchsia-400 uppercase tracking-widest">
                    {item.relevance}% Confidence
                  </span>
                </div>
                <div className="flex gap-2">
                    {onCopySolution && (
                         <button
                         onClick={(e) => { e.stopPropagation(); onCopySolution(item.content); }}
                         className="p-1.5 bg-zinc-900 rounded-lg text-zinc-400 hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-all"
                         title="Copy Solution to Reply"
                       >
                         <SafeIcon icon={FiCopy} className="text-xs" />
                       </button>
                    )}
                   <SafeIcon icon={FiExternalLink} className="text-zinc-700 group-hover:text-fuchsia-400 group-hover:rotate-45 transition-all" />
                </div>
              </div>
              <h4 className="text-sm font-bold text-zinc-300 group-hover:text-zinc-100 leading-snug tracking-tight">
                {item.title}
              </h4>
              <p className="mt-2 text-xs text-zinc-500 line-clamp-2">{item.content}</p>
            </div>
          ))
        )}
      </div>
      
      <div className="mt-8 p-4 bg-fuchsia-500/5 rounded-xl border border-fuchsia-500/10">
        <p className="text-[10px] text-fuchsia-400/70 leading-relaxed font-medium italic">
          Onyx is currently indexing new documentation regarding AXiM Core v2.4. Suggestions may update in real-time.
        </p>
      </div>
    </div>
  );
}
