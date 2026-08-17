import React, { useState } from 'react';
import { FiFileText, FiLock, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';

const getEdgeWorkerUrl = () => {
    return import.meta.env.VITE_EDGE_WORKER_URL || "http://127.0.0.1:54321/functions/v1/onyx-edge-worker";
};

export default function RCADocumentBlock({ rcaRecord, onFinalized }) {
  const [notes, setNotes] = useState(rcaRecord?.payload?.notes || '');
  const [isFinalizing, setIsFinalizing] = useState(false);

  const isDraft = rcaRecord.status === 'draft';

  const handleFinalize = async () => {
    if (!notes.trim()) {
      toast.error('Investigation notes are required before finalizing.');
      return;
    }

    setIsFinalizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error("Active session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/actions/rca/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rcaLogId: rcaRecord.id, notes })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to finalize RCA.');

      toast.success("RCA document successfully finalized and locked.", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });

      if (onFinalized) onFinalized();
    } catch (err) {
      toast.error(`RCA Finalization Error: ${err.message}`);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-4 shadow-lg shadow-indigo-900/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-400">
          <FiFileText className="text-lg" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest">Root Cause Analysis</h3>
        </div>
        <div>
          {isDraft ? (
            <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider border border-amber-500/30">
              Draft
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30">
              <FiLock className="text-[10px]" /> Finalized
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
         <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Breach Type</div>
         <div className="text-sm font-semibold text-zinc-200">{rcaRecord.payload?.breach_type || 'Unknown'}</div>
      </div>

      <div className="space-y-2 pt-2 border-t border-indigo-500/20">
        <label className="text-[11px] font-mono text-indigo-300 uppercase tracking-widest font-bold">
          Human-in-the-Loop Investigation Notes
        </label>
        {isDraft ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isFinalizing}
            placeholder="Document your findings, root cause verification, and long-term resolution here..."
            className="w-full p-3 rounded-xl bg-black/50 border border-indigo-500/30 text-xs text-zinc-200 placeholder-indigo-500/40 focus:outline-none focus:border-indigo-400/60 transition-all resize-none font-sans min-h-[100px]"
          />
        ) : (
          <div className="w-full p-3 rounded-xl bg-black/30 border border-indigo-500/20 text-xs text-zinc-300 font-sans min-h-[80px] whitespace-pre-wrap">
            {rcaRecord.payload?.notes || 'No notes provided.'}
          </div>
        )}
      </div>

      {isDraft && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleFinalize}
            disabled={isFinalizing || !notes.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 shadow-md shadow-indigo-900/50"
          >
            {isFinalizing ? 'Locking...' : <><FiCheck /> Finalize RCA</>}
          </button>
        </div>
      )}
    </div>
  );
}
