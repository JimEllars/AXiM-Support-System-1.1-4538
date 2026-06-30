import React, { useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useTicketStore } from '../../store/useTicketStore';

const { FiAlertOctagon, FiRefreshCw, FiCode, FiX, FiCheck, FiLoader } = FiIcons;

export default function DLQMonitorBlock() {
  const {
    dlqEvents, setDlqEvents,
    isDlqLoading: isLoading, setDlqLoading: setIsLoading,
    selectedDlqEventIds: selectedEventIds, setSelectedDlqEventIds: setSelectedEventIds,
    fetchLiveDLQData
  } = useTicketStore();

  const [expandedId, setExpandedId] = React.useState(null);
  const [replayConfirmId, setReplayConfirmId] = React.useState(null);
  const [isReplaying, setIsReplaying] = React.useState({});

  useEffect(() => {
    fetchLiveDLQData();
  }, []);

  const handleReplay = async (id) => {
    setIsReplaying(prev => ({ ...prev, [id]: true }));
    try {
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const secret = import.meta.env.VITE_AXIM_ONYX_SECRET || 'fallback';

      // CRITICAL FIX: Route DLQ replays exclusively through the Edge Gateway
      const res = await fetch(`${workerUrl}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`
        },
        body: JSON.stringify({ eventIds: [id], operatorId: 'system_admin' })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Edge rejected replay: ${errText}`);
      }

      toast.success('Payload re-injected into Edge processing stream.', {
         style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });

      // Refresh the local DLQ table
      useTicketStore.getState().fetchLiveDLQData();
    } catch (error) {
      toast.error('Replay execution failed: ' + error.message);
    } finally {
      setIsReplaying(prev => ({ ...prev, [id]: false }));
    }
  };

  if (dlqEvents.length === 0) return null;

  return (
    <div id="dlq-monitor-block" className="glass-panel border-rose-900/30 bg-zinc-950/80 rounded-[2rem] p-6 mb-10 shadow-[0_0_30px_rgba(225,29,72,0.1)]">
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
          <button onClick={fetchLiveDLQData} className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors">
            <SafeIcon icon={FiRefreshCw} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {dlqEvents.map(evt => {
          const isExpanded = expandedId === evt.id;
          const p = evt.payload || {};

          return (
            <div key={evt.id} className="border border-rose-900/30 bg-zinc-900/50 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 flex items-center gap-4 justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : evt.id)}>
                  <div className="flex items-center gap-3">
                     <span className="text-zinc-300 font-bold text-sm">{p.origin_node || 'Unknown Origin'}</span>
                     <span className="px-2 py-0.5 bg-rose-950/50 text-rose-400 border border-rose-900 text-[10px] uppercase font-bold rounded">Retry: {p.retry_count || 0}</span>
                  </div>
                  <div className="text-zinc-500 text-xs mt-1 truncate max-w-xl">{p.error_reason || 'No error reason provided'}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReplay(evt.id); }}
                  disabled={isReplaying[evt.id]}
                  className="px-3 py-1 bg-zinc-800 text-cyan-400 text-[10px] rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                  {isReplaying[evt.id] ? 'Replaying...' : 'Replay'}
                </button>
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-rose-900/20 pt-4 bg-zinc-950/50">
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
