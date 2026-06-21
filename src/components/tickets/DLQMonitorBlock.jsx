import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiAlertOctagon, FiRefreshCw, FiChevronDown, FiChevronRight, FiCode, FiX, FiCheck } = FiIcons;

export default function DLQMonitorBlock() {
  const [dlqEvents, setDlqEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [replayConfirmId, setReplayConfirmId] = useState(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const fetchDLQ = async () => {
    setIsLoading(true);
    try {
      // Mocking fetching from a generic job queue or events table
      // Since it's not explicitly defined which table holds DLQ specifically,
      // we query events_ax2024 for 'dlq_event' or 'error' type for now
      const { data, error } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'dlq_payload')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // If empty for dev, mock some data
      if (data.length === 0 && import.meta.env.DEV) {
        setDlqEvents([
           {
              id: 'test-1',
              payload: {
                 origin_node: 'Demand Letter Gen App',
                 error_reason: 'Database lock timeout on document insertion',
                 retry_count: 3,
                 tenant_id: 'org-123',
                 raw_data: { user: 'jim', action: 'generate' }
              },
              created_at: new Date().toISOString()
           }
        ]);
      } else {
        setDlqEvents(data || []);
      }
    } catch (error) {
      toast.error('Failed to load DLQ: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQ();
  }, []);


  const handleBulkReplay = async () => {
    setIsReplaying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorId = user?.id;

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:54321/functions/v1/onyx-bridge'}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_AXIM_ONYX_SECRET || 'onyx_local_dev_secret'}`
        },
        body: JSON.stringify({ eventIds: dlqEvents.map(e => e.id), operatorId })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Bulk replay failed: ${res.status} ${text}`);
      }

      toast.success('Bulk payload replayed successfully');
      fetchDLQ();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsReplaying(false);
    }
  };

  const handleReplay = async (event) => {
    setIsReplaying(true);
    try {
      const idempotencyKey = uuidv4();
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:54321/functions/v1/onyx-bridge'}/api/dlq/replay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_AXIM_ONYX_SECRET || 'onyx_local_dev_secret'}`,
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ eventId: event.id, payload: event.payload })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Replay failed: ${res.status} ${text}`);
      }

      toast.success('Payload replayed successfully');
      setReplayConfirmId(null);
      fetchDLQ();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsReplaying(false);
    }
  };

  if (dlqEvents.length === 0) return null;

  return (
    <div className="glass-panel border-rose-900/30 bg-zinc-950/80 rounded-[2rem] p-6 mb-10 shadow-[0_0_30px_rgba(225,29,72,0.1)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-center text-rose-500">
            <SafeIcon icon={FiAlertOctagon} className="text-xl" />
          </div>
          <div>
            <h3 className="text-rose-400 font-black tracking-tight text-lg">Dead Letter Queue (DLQ)</h3>
            <p className="text-rose-500/60 text-[10px] uppercase font-bold tracking-widest">Unhandled Edge Payloads</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            disabled={isReplaying || dlqEvents.length === 0}
            onClick={() => handleBulkReplay()}
            className="relative flex items-center gap-2 px-4 py-2 text-xs font-mono font-black tracking-widest text-cyan-400 bg-zinc-950/80 border border-cyan-500/30 hover:border-cyan-400 rounded-xl disabled:opacity-40 disabled:pointer-events-none uppercase transition-all duration-200 shadow-[0_0_15px_rgba(6,182,212,0.05)] hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] group"
          >
            {isReplaying ? (
              <FiIcons.FiLoader className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            ) : (
              <FiIcons.FiRefreshCw className="w-3.5 h-3.5 text-cyan-500/70 group-hover:text-cyan-400 group-hover:rotate-180 transition-transform duration-500" />
            )}
            <span>Bulk Replay Tasks ({dlqEvents.length})</span>
          </button>

          <button onClick={fetchDLQ} className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors">
            <SafeIcon icon={FiRefreshCw} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {dlqEvents.map(evt => {
          const isExpanded = expandedId === evt.id;
          const isConfirming = replayConfirmId === evt.id;
          const p = evt.payload || {};

          return (
            <div key={evt.id} className="border border-rose-900/30 bg-zinc-900/50 rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : evt.id)}>
                  <div className="flex items-center gap-3">
                     <span className="text-zinc-300 font-bold text-sm">{p.origin_node || 'Unknown Origin'}</span>
                     <span className="px-2 py-0.5 bg-rose-950/50 text-rose-400 border border-rose-900 text-[10px] uppercase font-bold rounded">Retry: {p.retry_count || 0}</span>
                  </div>
                  <div className="text-zinc-500 text-xs mt-1 truncate max-w-xl">{p.error_reason || 'No error reason provided'}</div>
                </div>
                <div>
                   {!isConfirming ? (
                      <button
                         onClick={() => setReplayConfirmId(evt.id)}
                         className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                         Replay Transaction
                      </button>
                   ) : (
                      <div className="flex items-center gap-2">
                         <span className="text-rose-400 text-xs font-bold uppercase tracking-widest mr-2">Confirm?</span>
                         <button onClick={() => handleReplay(evt)} disabled={isReplaying} className="p-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 rounded-xl transition-all">
                            <SafeIcon icon={FiCheck} />
                         </button>
                         <button onClick={() => setReplayConfirmId(null)} className="p-2 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 rounded-xl transition-all">
                            <SafeIcon icon={FiX} />
                         </button>
                      </div>
                   )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-rose-900/20 pt-4 bg-zinc-950/50">
                   <div className="flex items-center gap-2 mb-2 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                      <SafeIcon icon={FiCode} /> Raw Payload
                   </div>
                   <pre className="text-[10px] font-mono text-zinc-400 bg-black/50 p-4 rounded-xl overflow-x-auto">
                      {JSON.stringify(p, null, 2)}
                   </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
