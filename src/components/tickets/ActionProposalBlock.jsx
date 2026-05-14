import React, { useState } from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

const { FiZap, FiCheck, FiX } = FiIcons;

export default function ActionProposalBlock({ hitlLogId }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    async function fetchLog() {
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
  }, [hitlLogId]);

  const handleAction = async (action) => {
    if (!log) return;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Optimistic update
    setLog({ ...log, status: newStatus });

    try {
        const { error } = await supabase
            .from('hitl_audit_logs')
            .update({ status: newStatus, updated_at: new Date() })
            .eq('id', hitlLogId);

        if (error) throw error;

        if (action === 'approve') {
            const ONYX_WORKER_URL = import.meta.env.VITE_ONYX_WORKER_URL;
            const ONYX_SECRET = "onyx_local_dev_secret";

            const res = await fetch(`${ONYX_WORKER_URL}/api/v1/actions/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
                body: JSON.stringify({ hitlLogId: hitlLogId })
            });
            const resultData = await res.json();

            toast.success(`Action Executed: ${log.tool_type}`, {
                style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
            });

            // Insert system message about action completion
            await supabase.from('support_messages').insert({
                ticket_id: log.ticket_id,
                sender_id: 'system',
                sender_type: 'system',
                content: `ACTION LOG: [${log.tool_type}] approved by [Greta] and executed successfully. Transaction ID: ${resultData.transaction_id || 'TX-N/A'}`,
                is_internal: true
            });

            setLog(prev => ({ ...prev, execution_result: resultData }));

        } else {
            toast('Action Rejected', {
                style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
            });
        }
    } catch (e) {
        console.error(e);
        toast.error('Failed to update action');
        setLog({ ...log, status: 'pending' }); // Revert
    }
  };

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
        <div className="text-zinc-400 text-sm font-mono bg-black/40 p-2 rounded overflow-x-auto">
          {JSON.stringify(log.payload, null, 2)}
        </div>
        {isCompleted && log.execution_result && (
           <div className="mt-2 text-emerald-400 text-xs font-mono bg-emerald-950/30 p-2 border border-emerald-900/50 rounded">
             Result: {JSON.stringify(log.execution_result.result || log.execution_result, null, 2)}
           </div>
        )}
      </div>

      {log.status === 'pending' ? (
        <div className="flex gap-3 mt-4">
            <button
                onClick={() => handleAction('approve')}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-lg transition-colors text-sm"
            >
                <SafeIcon icon={FiCheck} /> Approve & Execute
            </button>
            <button
                onClick={() => handleAction('reject')}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors text-sm"
            >
                <SafeIcon icon={FiX} /> Reject
            </button>
        </div>
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
