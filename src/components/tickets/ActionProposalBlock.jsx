import React, { useState } from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import { useTicketStore } from '../../store/useTicketStore';
import { useAuthStore } from '../../store/useAuthStore';

const { FiZap, FiCheck, FiX } = FiIcons;

export default function ActionProposalBlock({ hitlLog }) {
  const hitlLogId = hitlLog?.id;
  const [log, setLog] = useState(hitlLog || null);
  const [loading, setLoading] = useState(!hitlLog);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { isCoreOnline } = useTicketStore();
  const { user } = useAuthStore();
  const agentName = user?.email?.split('@')[0] || 'System Agent';

  React.useEffect(() => {
    if (hitlLog) {
      setLog(hitlLog);
      setLoading(false);
      return;
    }

    async function fetchLog() {
      if (!hitlLogId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('hitl_audit_logs')
        .select('*')
        .eq('id', hitlLogId)
        .single();
      if (!error && data) {
        setLog(data);
      }
      setLoading(false);
    }
    fetchLog();
  }, [hitlLogId, hitlLog]);

  const handleExecute = async () => {
  setIsExecuting(true);
  try {
    // Direct call to the securely routed Onyx Edge Worker
    const workerUrl = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:8787';
    const response = await fetch(`${workerUrl}/api/v1/actions/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_AXIM_ONYX_SECRET}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ hitlLogId: hitlLog.id })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Action execution failed at the edge');
    }

    toast.success("Action executed successfully via Core Proxy.");
    // The MessageThread subscription will auto-refresh the UI with the execution confirmation
  } catch (err) {
    console.error(err);
    toast.error(`Execution Error: ${err.message}`);
  } finally {
    setIsExecuting(false);
  }
};


const handleReject = async () => {
    setIsExecuting(true);
    try {
        const { error } = await supabase
            .from('hitl_audit_logs')
            .update({ status: 'rejected', updated_at: new Date() })
            .eq('id', hitlLogId);

        if (error) throw error;
        toast('Action Rejected', {
            style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
        });
        setLog(prev => ({ ...prev, status: 'rejected' }));
    } catch (e) {
        toast.error('Failed to update action');
    } finally {
        setIsExecuting(false);
    }
}

  if (loading || !log) return null;

  const isCompleted = log.status === 'approved';
  const blockColor = isCompleted ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'border-cyan-500/30 bg-cyan-950/20 shadow-[0_0_15px_rgba(34,211,238,0.15)]';
  const textColor = isCompleted ? 'text-emerald-400' : 'text-cyan-400';
  const accentColor = isCompleted ? 'bg-emerald-500' : 'bg-cyan-500';

  return (
    <div className={`mt-4 p-4 rounded-xl border-2 transition-all relative overflow-hidden group ${blockColor}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />

      <div className="flex items-center gap-3 mb-3">
        <SafeIcon icon={isCompleted ? FiCheck : FiZap} className={`${textColor} text-lg`} />
        <span className={`${textColor} font-bold uppercase tracking-widest text-xs mono-font`}>
           {isCompleted ? 'Onyx Action Completed' : 'Onyx Action Proposal'}
        </span>
        {log.status === 'pending' && <span className="ml-auto flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>}
      </div>

      <div className="mb-4 space-y-1">
        <div className="text-zinc-200 font-medium">
           Tool: <span className={`${isCompleted ? 'text-emerald-300' : 'text-cyan-300'} font-mono text-sm`}>{log.tool_type}</span>
        </div>

        <div className="text-zinc-400 text-sm font-mono bg-black/40 p-2 rounded overflow-x-auto relative">
          {log.tool_type === 'apply_git_patch' && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(log.payload.patch || JSON.stringify(log.payload));
                toast.success("Patch copied to clipboard", {
                    style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
                });
              }}
              className="absolute top-2 right-2 text-zinc-500 hover:text-cyan-400 transition-colors p-1 bg-black/50 rounded"
              title="Copy Patch"
            >
              <SafeIcon icon={FiIcons.FiCopy} />
            </button>
          )}
          <code>
  {typeof log.payload === 'string'
    ? log.payload.split('\n').map((line, i) => {
        let colorClass = 'text-zinc-300';
        if (line.startsWith('+') && !line.startsWith('+++')) colorClass = 'text-emerald-400 bg-emerald-400/10';
        else if (line.startsWith('-') && !line.startsWith('---')) colorClass = 'text-rose-400 bg-rose-400/10';
        else if (line.startsWith('@@')) colorClass = 'text-cyan-400';

        return (
          <div key={i} className={`px-2 ${colorClass} whitespace-pre-wrap min-h-[1.2em]`}>
            {line}
          </div>
        );
      })
    : JSON.stringify(log.payload, null, 2)
  }
</code>
        </div>
        {isCompleted && log.execution_result && (
           <div className="mt-2 text-emerald-400 text-xs font-mono bg-emerald-950/30 p-2 border border-emerald-900/50 rounded">
             Result: {JSON.stringify(log.execution_result.result || log.execution_result, null, 2)}
           </div>
        )}
      </div>

      {log.status === 'pending' ? (
        <>
        {!isCoreOnline && (
            <div className="mt-4 mb-2 p-3 bg-rose-500/10 border border-rose-500/50 rounded-lg flex items-center gap-2 text-rose-400 text-sm font-mono">
                <SafeIcon icon={FiZap} className="animate-pulse" /> ⚠️ AXiM Core Offline: Action execution suspended.
            </div>
        )}
        {/* Action Buttons */}
<div className="mt-4 flex justify-end gap-3">
  {showConfirm ? (
    <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-300">
      <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Confirm Execution?</span>
      <button onClick={() => setShowConfirm(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-lg text-xs font-bold transition-colors">
        Cancel
      </button>
      <button onClick={handleExecute} disabled={isExecuting} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 rounded-lg text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2">
        {isExecuting ? <><SafeIcon icon={FiIcons.FiLoader} className="animate-spin" /> Executing...</> : "Yes, Execute"}
      </button>
    </div>
  ) : (
    <button onClick={() => setShowConfirm(true)} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
      <SafeIcon icon={FiIcons.FiPlay} />
      Execute Action
    </button>
  )}
</div>
        </>
      ) : (
          <div className="flex items-center gap-2 text-sm font-bold mono-font mt-4">
              <span className={log.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}>
                  STATUS: {log.status.toUpperCase()}
              </span>
          </div>
      )}
    </div>
  );
}
