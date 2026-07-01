import React, { useState } from 'react';
import { useTicketStore } from '../../store/useTicketStore';
import { FiAlertTriangle, FiRotateCw, FiTerminal } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function DLQMonitorBlock() {
  const { dlqEvents } = useTicketStore();
  const [isReplaying, setIsReplaying] = useState(false);

  const handleBulkReplay = async () => {
    if (dlqEvents.length === 0) return;
    setIsReplaying(true);

    try {
      const eventIds = dlqEvents.map(e => e.id);
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const secret = import.meta.env.VITE_AXIM_ONYX_SECRET || 'fallback';

      const res = await fetch(`${workerUrl}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
        body: JSON.stringify({ eventIds, operatorId: 'admin_dashboard' })
      });

      if (!res.ok) throw new Error("Gateway rejected DLQ replay.");

      toast.success(`Successfully queued ${eventIds.length} payloads for replay.`, {
        icon: <FiRotateCw className="text-cyan-400" />,
        style: { background: '#09090b', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }
      });
    } catch (err) {
      toast.error('DLQ Bulk Replay Failed.');
    } finally {
      setIsReplaying(false);
    }
  };

  if (!dlqEvents || dlqEvents.length === 0) {
    return (
      <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-3">
        <FiTerminal className="text-zinc-600" />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Dead Letter Queue: 0 Pending Exceptions</span>
      </div>
    );
  }

  return (
    <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(225,29,72,0.05)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-rose-400 text-[10px] font-black uppercase tracking-widest">
          <FiAlertTriangle className="animate-pulse text-sm" />
          DLQ Monitor: {dlqEvents.length} Pending Exceptions
        </div>
        <button
          onClick={handleBulkReplay}
          disabled={isReplaying}
          className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-[10px] font-bold uppercase tracking-widest transition-colors border border-rose-500/30 disabled:opacity-50"
        >
          <FiRotateCw className={isReplaying ? 'animate-spin' : ''} />
          {isReplaying ? 'Replaying...' : 'Replay Queue'}
        </button>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
        {dlqEvents.map(evt => (
          <div key={evt.id} className="bg-black/50 border border-rose-900/50 rounded-xl p-3 flex justify-between items-center group hover:border-rose-700/50 transition-colors">
             <div className="truncate flex-1">
                <span className="text-[10px] text-zinc-500 font-mono mr-3">{new Date(evt.created_at).toLocaleTimeString()}</span>
                <span className="text-xs text-rose-200 font-mono truncate">{evt.payload?.error || evt.payload?.reason || 'Unknown Payload Exception'}</span>
             </div>
             <span className="text-[9px] text-rose-500 font-black uppercase bg-rose-950 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                {evt.payload?.source || 'API_GATEWAY'}
             </span>
          </div>
        ))}
      </div>
    </div>
  );
}
