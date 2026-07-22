import React, { useState } from 'react';
import { FiFeather, FiCopy, FiCheck, FiCornerDownLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function AutoDraftWhisper({ draftText, onApplyDraft }) {
  const [copied, setCopied] = useState(false);

  if (!draftText) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(draftText);
    setCopied(true);
    toast.success("AI draft copied to clipboard!", {
      style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (onApplyDraft) {
      onApplyDraft(draftText);
      toast.success("AI draft inserted into composer!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="my-3 p-4 rounded-2xl border bg-indigo-950/20 border-indigo-500/30 relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.05)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FiFeather className="text-indigo-400 text-xs animate-bounce"/>
          <span className="text-[10px] font-mono font-black uppercase text-indigo-300 tracking-wider">
            Onyx AI Suggested Whisper Reply
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-all"
            title="Copy draft text"
          >
            {copied ? <FiCheck className="text-emerald-400"/> : <FiCopy/>}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-indigo-500 hover:bg-indigo-400 text-white border border-indigo-400/20 transition-all shadow-sm"
          >
            <FiCornerDownLeft/>
            <span>Apply to Composer</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-300 font-sans leading-relaxed whitespace-pre-wrap bg-black/40 p-3 rounded-xl border border-indigo-500/10">
        {draftText}
      </p>
    </div>
  );
}
