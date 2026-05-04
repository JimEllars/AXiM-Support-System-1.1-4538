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
            // Trigger the edge worker to execute the action
            const ONYX_WORKER_URL = import.meta.env.VITE_ONYX_WORKER_URL;
            const ONYX_SECRET = "onyx_local_dev_secret";

            await fetch(`${ONYX_WORKER_URL}/execute-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ONYX_SECRET}` },
                body: JSON.stringify({ hitlLogId })
            });

            toast.success(`Action Executed: ${log.tool_type}`, {
                style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
            });
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

  return (
    <div className="mt-4 p-4 rounded-xl border-2 border-cyan-500/30 bg-cyan-950/20 shadow-[0_0_15px_rgba(34,211,238,0.15)] relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />

      <div className="flex items-center gap-3 mb-3">
        <SafeIcon icon={FiZap} className="text-cyan-400 text-lg" />
        <span className="text-cyan-400 font-bold uppercase tracking-widest text-xs mono-font">Onyx Action Proposal</span>
        {log.status === 'pending' && <span className="ml-auto flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>}
      </div>

      <div className="mb-4 space-y-1">
        <div className="text-zinc-200 font-medium">
           Tool: <span className="text-cyan-300 font-mono text-sm">{log.tool_type}</span>
        </div>
        <div className="text-zinc-400 text-sm font-mono bg-black/40 p-2 rounded overflow-x-auto">
          {JSON.stringify(log.payload, null, 2)}
        </div>
      </div>

      {log.status === 'pending' ? (
        <div className="flex gap-3">
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
          <div className="flex items-center gap-2 text-sm font-bold mono-font">
              <span className={log.status === 'approved' ? 'text-green-400' : 'text-red-400'}>
                  STATUS: {log.status.toUpperCase()}
              </span>
          </div>
      )}
    </div>
  );
}
