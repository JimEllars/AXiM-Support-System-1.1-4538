import re

with open("src/components/tickets/DLQMonitorBlock.jsx", "r") as f:
    content = f.read()

# Add useTicketStore import if not present
if "import { useTicketStore }" not in content:
    content = content.replace("import * as FiIcons from 'react-icons/fi';", "import * as FiIcons from 'react-icons/fi';\nimport { useTicketStore } from '../../store/useTicketStore';")

# Update destructuring
old_destructure = """  const {
    dlqEvents, setDlqEvents,
    isDlqLoading: isLoading, setDlqLoading: setIsLoading,
    selectedDlqEventIds: selectedEventIds, setSelectedDlqEventIds: setSelectedEventIds,
    fetchLiveDLQData
  } = useTicketStore();"""

new_destructure = """  const {
    dlqEvents, setDlqEvents,
    triggerDeepTraceInspection,
    isDlqLoading: isLoading, setDlqLoading: setIsLoading,
    selectedDlqEventIds: selectedEventIds, setSelectedDlqEventIds: setSelectedEventIds,
    fetchLiveDLQData
  } = useTicketStore();"""
content = content.replace(old_destructure, new_destructure)

# Add handleBulkReplay
bulk_replay_func = """  const handleBulkReplay = async () => {
    const ids = dlqEvents.map(e => e.id);
    if (!ids.length) return;

    setIsReplaying(prev => ({ ...prev, bulk: true }));
    try {
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const secret = import.meta.env.VITE_AXIM_ONYX_SECRET || 'fallback';

      const res = await fetch(`${workerUrl}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
        body: JSON.stringify({ eventIds: ids, operatorId: 'system_admin' })
      });

      if (!res.ok) throw new Error("Bulk replay rejected by Edge Gateway.");

      toast.success(`${ids.length} payloads re-injected into Edge processing stream.`, {
         style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchLiveDLQData();
    } catch (error) {
      toast.error('Bulk Replay failed: ' + error.message);
    } finally {
      setIsReplaying(prev => ({ ...prev, bulk: false }));
    }
  };

"""

if "const handleBulkReplay =" not in content:
    content = content.replace("  if (dlqEvents.length === 0) return null;", bulk_replay_func + "  if (dlqEvents.length === 0) return null;")

# Update header area
old_header = """      <div className="flex items-center justify-between mb-6">
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
      </div>"""

new_header = """      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
          <FiAlertOctagon className="text-rose-500" />
          Dead Letter Queue (DLQ)
          <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-[10px] uppercase tracking-widest animate-pulse">
             {dlqEvents.length} Faults
          </span>
        </h2>

        <div className="flex items-center gap-4">
          {dlqEvents.length > 0 && (
            <button
              onClick={handleBulkReplay}
              disabled={isReplaying.bulk}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              {isReplaying.bulk ? <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" /> : <FiRefreshCw />}
              Bulk Replay All
            </button>
          )}
          <button onClick={fetchLiveDLQData} className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors">
            <SafeIcon icon={FiRefreshCw} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>"""

content = content.replace(old_header, new_header)

# Update inspect/replay buttons
old_buttons = """                <button
                  onClick={(e) => { e.stopPropagation(); handleReplay(evt.id); }}
                  disabled={isReplaying[evt.id]}
                  className="px-3 py-1 bg-zinc-800 text-cyan-400 text-[10px] rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                  {isReplaying[evt.id] ? 'Replaying...' : 'Replay'}
                </button>"""

new_buttons = """                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); triggerDeepTraceInspection(evt.id); }}
                        className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5"
                      >
                        <FiTerminal /> Inspect
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReplay(evt.id); }}
                        disabled={isReplaying[evt.id]}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isReplaying[evt.id] ? <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /> : <FiRefreshCw />}
                        Replay
                      </button>
                    </div>"""

content = content.replace(old_buttons, new_buttons)

with open("src/components/tickets/DLQMonitorBlock.jsx", "w") as f:
    f.write(content)
