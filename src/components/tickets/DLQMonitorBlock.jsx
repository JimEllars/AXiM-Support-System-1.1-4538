import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiRefreshCw, FiCheckCircle2, FiShield, FiZap } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import toast from 'react-hot-toast';

export default function DLQMonitorBlock() {
  const [dlqItems, setDlqItems] = useState([]);
  const [recoveredCount24h, setRecoveredCount24h] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  const fetchDLQData = async () => {
    setIsLoading(true);
    try {
      const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count: recovered } = await supabase
        .from('events_ax2024')
        .select('id', { count: 'exact', head: true })
        .gte('timestamp', past24h)
        .eq('type', 'dlq_retry_executed');

      setRecoveredCount24h(recovered || 0);

      const { data } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'dlq_queue_inserted')
        .order('timestamp', { ascending: false })
        .limit(5);

      setDlqItems(data || []);
    } catch (err) {
      console.error('Failed to load DLQ monitor data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQData();
  }, []);

  const handleFlushAll = async () => {
    if (isFlushing) return;
    setIsFlushing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/dlq/flush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Batch DLQ flush failed.");

      toast.success(`DLQ batch flush completed! Re-queued ${data.flushed_count || 0} payloads.`, {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDLQData();
    } catch (err) {
      toast.error(`Flush Error: ${err.message}`);
    } finally {
      setIsFlushing(false);
    }
  };

  const handleRetryPayload = async (itemId, payload) => {
    setRetryingId(itemId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/dlq/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ payload })
      });

      if (!res.ok) throw new Error("DLQ payload re-ingestion failed.");

      toast.success("DLQ payload successfully re-queued!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDLQData();
    } catch (err) {
      toast.error(`Retry Failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-4 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
          <FiAlertTriangle className="text-sm animate-pulse"/>
          <span className="uppercase tracking-wider">Dead-Letter Queue Monitor</span>
        </div>

        <div className="flex items-center gap-2">
          {dlqItems.length > 0 && (
            <button
              onClick={handleFlushAll}
              disabled={isFlushing}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50"
              title="Re-process all pending dead-letter queue items in a single batch"
            >
              <FiZap className={isFlushing ? 'animate-spin' : ''} />
              <span>{isFlushing ? 'Flushing...' : 'Flush All'}</span>
            </button>
          )}

          <span className="text-[9px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
            <FiCheckCircle2 className="text-[9px]"/> 24h Recoveries: {recoveredCount24h}
          </span>
          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
            <FiShield className="text-[9px]"/> DLQ Guard Active
          </span>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center py-4 text-xs text-zinc-500 animate-pulse">
            Scanning edge dead-letter queues...
          </div>
        ) : dlqItems.length > 0 ? (
          dlqItems.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-black/50 border border-zinc-900 flex items-center justify-between text-xs">
              <div className="space-y-0.5 truncate pr-2">
                <div className="font-bold text-zinc-300 truncate">Event #{item.id.slice(0, 8)}</div>
                <div className="text-[10px] text-zinc-500 font-sans truncate">{item.payload?.error_reason || 'Transient ingestion fault'}</div>
              </div>

              <button
                onClick={() => handleRetryPayload(item.id, item.payload)}
                disabled={retryingId === item.id}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[10px] text-indigo-300 border border-zinc-800 transition-all flex-shrink-0 disabled:opacity-50"
              >
                <FiRefreshCw className={retryingId === item.id ? 'animate-spin' : ''} />
                <span>{retryingId === item.id ? 'Retrying...' : 'Re-queue'}</span>
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-xs text-zinc-600">
            Zero active dead-letter faults detected. Edge pipelines operating nominal.
          </div>
        )}
      </div>
    </div>
  );
}
