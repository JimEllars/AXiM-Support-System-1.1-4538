import React, { useState } from 'react';
import { FiShield, FiAlertTriangle, FiCheckCircle, FiPlay, FiLoader, FiXCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function ActionProposalBlock({ proposalData, ticketId, onActionExecuted }) {
  const [executionState, setExecutionState] = useState('idle'); // 'idle' | 'executing' | 'success' | 'rejected' | 'failed'
  const [errorMessage, setErrorMessage] = useState('');

  const processRemedyDisposition = async (targetDisposition) => {
    if (executionState === 'executing' || executionState === 'success' || executionState === 'rejected') return;
    setExecutionState('executing');
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Active technician session security token invalid or missing');

      const workerUrl = getEdgeWorkerUrl();

      const res = await fetch(`${workerUrl}/api/v1/actions/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Idempotency-Key': `hitl_exec_${proposalData.id}`
        },
        body: JSON.stringify({
          hitlLogId: proposalData.id,
          disposition: targetDisposition // "approved" or "rejected"
        })
      });

      const outcome = await res.json();
      if (!res.ok) throw new Error(outcome.error || 'Upstream vault network handshake declined.');

      if (targetDisposition === 'rejected') {
        setExecutionState('rejected');
        toast.error('Proposed remedy successfully dismissed and archived.', {
          style: { background: '#09090b', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }
        });
      } else {
        setExecutionState('success');
        toast.success(`Action successfully executed.\nTrace ID: ${outcome.cf_ray || 'edge_cache'}`, {
          style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
        });
      }

      if (onActionExecuted) onActionExecuted(proposalData.id);
    } catch (err) {
      setExecutionState('failed');
      setErrorMessage(err.message);
      toast.error(`Execution failed: ${err.message}`);
    }
  };

  if (executionState === 'rejected') return null;

  return (
    <div className={`border rounded-2xl p-5 mb-4 relative overflow-hidden transition-all duration-300 ${
      executionState === 'success' ? 'bg-emerald-950/10 border-emerald-500/30' :
      executionState === 'failed' ? 'bg-rose-950/10 border-rose-500/30' : 'bg-zinc-950/60 border-zinc-800'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border flex-shrink-0 ${
            executionState === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            executionState === 'failed' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}>
            {executionState === 'success' ? <FiCheckCircle /> : <FiShield />}
          </div>
          <div>
            <h4 className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Proposed Structural Remedy</h4>
            <p className="text-xs font-mono font-bold text-white mt-1">{proposalData.tool_type || 'Custom Core Operation'}</p>
            <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">{proposalData.action_required || 'Review data parameters before manual clearance.'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* THE 5% UI FEATURE: Gated Dismissal Control Button */}
          {executionState === 'idle' && (
            <button
              onClick={() => processRemedyDisposition('rejected')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-zinc-800 transition-all duration-200"
            >
              <FiXCircle /> Dismiss
            </button>
          )}

          <button
            onClick={() => processRemedyDisposition('approved')}
            disabled={executionState === 'executing' || executionState === 'success'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              executionState === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-not-allowed' :
              executionState === 'executing' ? 'bg-zinc-900 text-zinc-500 border-zinc-800 cursor-wait' :
              'bg-amber-500 hover:bg-amber-400 text-black border-amber-400/20 font-black shadow-[0_0_20px_rgba(245,158,11,0.15)]'
            }`}
          >
            {executionState === 'executing' ? <FiLoader className="animate-spin" /> : executionState === 'success' ? <FiCheckCircle /> : <FiPlay />}
            {executionState === 'executing' ? 'Authorizing...' : executionState === 'success' ? 'Completed' : 'Approve & Dispatch'}
          </button>
        </div>
      </div>

      {executionState === 'failed' && (
        <div className="mt-3 flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-300 font-mono text-[10px]">
          <FiAlertTriangle className="flex-shrink-0 text-sm" />
          <span><strong>HANDSHAKE FAULT:</strong> {errorMessage}</span>
        </div>
      )}
    </div>
  );
}