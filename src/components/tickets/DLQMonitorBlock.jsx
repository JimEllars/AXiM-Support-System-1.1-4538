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
    selectedDlqEventIds: selectedEventIds, setSelectedDlqEventIds: setSelectedEventIds
  } = useTicketStore();

  const [expandedId, setExpandedId] = React.useState(null);
  const [replayConfirmId, setReplayConfirmId] = React.useState(null);
  const [isReplaying, setIsReplaying] = React.useState(false);

  const fetchDLQ = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'dlq_payload')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setDlqEvents(data || []);
      setSelectedEventIds([]); // Clear selection buffer on refresh
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
    if (selectedEventIds.length === 0) return;
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
        body: JSON.stringify({ eventIds: selectedEventIds, operatorId }) // <-- Pass only surgically checked indices
      });

      if (!res.ok) throw new Error(`Bulk replay execution failed.`);
      toast.success(`Successfully flushed ${selectedEventIds.length} exceptions from queue.`);
      fetchDLQ();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsReplaying(false);
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
          <button
            disabled={isReplaying || selectedEventIds.length === 0}
            onClick={handleBulkReplay}
            className="relative flex items-center gap-2 px-4 py-2 text-xs font-mono font-black tracking-widest text-cyan-400 bg-zinc-950/80 border border-cyan-500/30 hover:border-cyan-400 rounded-xl disabled:opacity-40 disabled:pointer-events-none uppercase transition-all duration-200"
          >
            {isReplaying ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiRefreshCw className="w-3.5 h-3.5" />}
            <span>Bulk Replay Tasks ({selectedEventIds.length})</span>
          </button>
          <button onClick={fetchDLQ} className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors">
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
                <input
                  type="checkbox"
                  checked={selectedEventIds.includes(evt.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedEventIds(prev => [...prev, evt.id]);
                    else setSelectedEventIds(prev => prev.filter(id => id !== evt.id));
                  }}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer"
                />
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : evt.id)}>
                  <div className="flex items-center gap-3">
                     <span className="text-zinc-300 font-bold text-sm">{p.origin_node || 'Unknown Origin'}</span>
                     <span className="px-2 py-0.5 bg-rose-950/50 text-rose-400 border border-rose-900 text-[10px] uppercase font-bold rounded">Retry: {p.retry_count || 0}</span>
                  </div>
                  <div className="text-zinc-500 text-xs mt-1 truncate max-w-xl">{p.error_reason || 'No error reason provided'}</div>
                </div>
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
