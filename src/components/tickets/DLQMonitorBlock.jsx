import React, { useState } from 'react';
import { useTicketStore } from '../../store/useTicketStore';
import { FiAlertTriangle, FiRotateCw, FiTerminal, FiShield } from 'react-icons/fi';
import PayloadTraceInspectorModal from '../modals/PayloadTraceInspectorModal';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';

export default function DLQMonitorBlock() {
  const { dlqEvents, threatEvents, clearDLQEvents } = useTicketStore();
  const [isReplaying, setIsReplaying] = useState(false);
  const [inspectPayload, setInspectPayload] = useState(null);
  const [viewMode, setViewMode] = useState('dlq'); // 'dlq' | 'threats'

  const handleBulkReplay = async () => {
    if (dlqEvents.length === 0) return;
    setIsReplaying(true);

    try {
      const eventIds = dlqEvents.map(e => e.id);
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${workerUrl}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ eventIds, operatorId: 'admin_dashboard' })
      });

      if (!res.ok) throw new Error("Gateway rejected DLQ replay.");

      clearDLQEvents();
      toast.success(`Queued ${eventIds.length} payloads.`, {
        icon: <FiRotateCw className="text-cyan-400" />,
        style: { background: '#09090b', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }
      });
    } catch (err) {
      toast.error('DLQ Bulk Replay Failed.');
    } finally {
      setIsReplaying(false);
    }
  };

  if (dlqEvents.length === 0 && threatEvents.length === 0) {
    return (
      <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-3">
        <FiShield className="text-zinc-600" />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Edge Perimeter Clear</span>
      </div>
    );
  }

  return (
    <div className={`bg-black/40 border rounded-2xl p-5 shadow-2xl transition-colors ${viewMode === 'dlq' ? 'border-rose-500/30 bg-rose-950/10' : 'border-amber-500/30 bg-amber-950/10'}`}>

      {/* Header & Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 bg-black/50 p-1 rounded-lg border border-zinc-800/50">
          <button
            onClick={() => setViewMode('dlq')}
            className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-colors ${viewMode === 'dlq' ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Exceptions ({dlqEvents.length})
          </button>
          <button
            onClick={() => setViewMode('threats')}
            className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-colors ${viewMode === 'threats' ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Threats ({threatEvents.length})
          </button>
        </div>

        {viewMode === 'dlq' && dlqEvents.length > 0 && (
          <button onClick={handleBulkReplay} disabled={isReplaying} className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-[9px] font-bold uppercase tracking-widest transition-colors border border-rose-500/30 disabled:opacity-50">
            <FiRotateCw className={isReplaying ? 'animate-spin' : ''} /> {isReplaying ? 'Replaying...' : 'Bulk Replay'}
          </button>
        )}
      </div>

      {/* Matrix Display */}
      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
        {viewMode === 'dlq' ? (
          dlqEvents.map(evt => (
            <div key={evt.id} onClick={() => setInspectPayload(evt)} className="bg-black/50 border border-rose-900/50 rounded-xl p-3 flex justify-between items-center group hover:border-rose-500/50 transition-colors cursor-pointer">
               <div className="truncate flex-1">
                  <span className="text-[10px] text-zinc-500 font-mono mr-3">{new Date(evt.created_at).toLocaleTimeString()}</span>
                  <span className="text-xs text-rose-200 font-mono truncate">{evt.payload?.error || evt.payload?.reason || 'Unknown Payload Exception'}</span>
               </div>
               <span className="text-[9px] text-rose-500 font-black uppercase bg-rose-950 px-2 py-0.5 rounded transition-colors group-hover:bg-rose-500 group-hover:text-black">Inspect</span>
            </div>
          ))
        ) : (
          threatEvents.map(evt => (
            <div key={evt.id} className="bg-black/50 border border-amber-900/50 rounded-xl p-3 flex justify-between items-center group hover:border-amber-500/50 transition-colors">
               <div className="truncate flex-1">
                  <span className="text-[10px] text-zinc-500 font-mono mr-3">{new Date(evt.created_at).toLocaleTimeString()}</span>
                  <span className="text-xs text-amber-200 font-mono truncate mr-2">[{evt.payload?.ip || '0.0.0.0'}]</span>
                  <span className="text-[10px] text-zinc-400 font-mono truncate uppercase">{evt.payload?.reason || 'Access Denied'}</span>
               </div>
               {evt.payload?.cf_ray && <span className="text-[9px] text-amber-500/50 font-mono uppercase truncate max-w-[80px]">{evt.payload.cf_ray.split('-')[0]}</span>}
            </div>
          ))
        )}
      </div>

      {inspectPayload && <PayloadTraceInspectorModal isOpen={true} payloadData={inspectPayload} onClose={() => setInspectPayload(null)} />}
    </div>
  );
}
