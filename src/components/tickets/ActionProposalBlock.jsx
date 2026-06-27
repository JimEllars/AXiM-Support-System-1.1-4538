import React, { useState, useEffect } from 'react';
import { FiZap, FiCheck } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';


export default function ActionProposalBlock({ hitlLogId, onComplete }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [logDetails, setLogDetails] = useState(null);

  useEffect(() => {
    const fetchLog = async () => {
      const { data } = await supabase.from('hitl_audit_logs').select('*').eq('id', hitlLogId).single();
      if (data) setLogDetails(data);
    };
    if (hitlLogId) fetchLog();
  }, [hitlLogId]);

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';

      const res = await fetch(`${workerUrl}/api/v1/actions/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_AXIM_ONYX_SECRET || 'fallback'}`,
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ hitlLogId })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Execution rejected: ${errText}`);
      }

      setLogDetails(prev => ({ ...prev, status: 'executed' }));
      toast.success(`Action executed securely via core gateway.`, {
         style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      if (onComplete) onComplete();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!logDetails) return <div className="animate-pulse h-10 bg-emerald-950/20 rounded-xl" />;

  const isExecuted = logDetails.status === 'executed';

  return (
    <div className={`my-2 border rounded-2xl p-4 transition-colors ${isExecuted ? 'bg-zinc-900/50 border-zinc-800' : 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'}`}>
      <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-3 ${isExecuted ? 'text-zinc-500' : 'text-emerald-400'}`}>
        <FiZap className={!isExecuted ? 'animate-pulse' : ''} /> Action Proposal: {logDetails.tool_type}
      </div>
      <pre className="bg-black/50 p-3 rounded-xl border border-zinc-800/50 text-[10px] text-zinc-400 font-mono overflow-x-auto mb-4 whitespace-pre-wrap break-words">
        {JSON.stringify(logDetails.payload, null, 2)}
      </pre>
      <div className="flex items-center gap-3">
        <button
          onClick={handleExecute}
          disabled={isExecuting || isExecuted}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50 ${isExecuted ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300'}`}
        >
          {isExecuting ? <div className="w-3 h-3 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" /> : <FiCheck />}
          {isExecuted ? 'Action Executed' : 'Authorize & Execute'}
        </button>
      </div>
    </div>
  );
}
