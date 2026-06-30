import React, { useEffect, useState, useRef } from 'react';
import { FiCpu, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';

export default function OnyxInvestigationPanel({ ticketId }) {
  const [streamData, setStreamData] = useState([]);
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!ticketId || retryCount > 3 || streamStatus === 'complete') return;

    const connectStream = () => {
      setStreamStatus(retryCount > 0 ? 'reconnecting' : 'connecting');
      const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';
      const secret = import.meta.env.VITE_AXIM_ONYX_SECRET || 'fallback';

      const es = new EventSource(`${workerUrl}/api/v1/onyx-bridge/stream?ticket_id=${ticketId}&token=${secret}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'start') {
            setStreamStatus('streaming');
          } else if (data.type === 'log') {
            setStreamData(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: data.message }]);
          } else if (data.type === 'complete') {
            setStreamStatus('complete');
            setAnalysisResult(data.analysis);
            es.close();
          }
        } catch (e) {
          console.error("Stream parse error", e);
        }
      };

      es.onerror = () => {
        es.close();
        if (streamStatus !== 'complete') {
          setStreamStatus('disconnected');
          // Exponential backoff auto-reconnect
          setTimeout(() => setRetryCount(c => c + 1), 2000 * (retryCount + 1));
        }
      };
    };

    connectStream();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [ticketId, retryCount]);

  const handleManualRetry = () => {
    setRetryCount(0);
    setStreamStatus('connecting');
  };

  return (
    <div className="bg-zinc-950/80 border border-zinc-800 rounded-3xl p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <FiCpu className={streamStatus === 'streaming' ? 'text-fuchsia-400 animate-pulse' : 'text-zinc-600'} />
          Onyx Triage Matrix
        </h3>
        <div className="flex items-center gap-3">
          {streamStatus === 'disconnected' && (
            <button onClick={handleManualRetry} className="flex items-center gap-1.5 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold uppercase tracking-widest bg-fuchsia-500/10 px-2 py-1 rounded transition-colors">
              <FiRefreshCw /> Restart Matrix
            </button>
          )}
          <span className={`px-2 py-1 rounded text-[9px] uppercase font-black tracking-widest ${
            streamStatus === 'streaming' ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30' :
            streamStatus === 'complete' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            streamStatus === 'disconnected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {streamStatus}
          </span>
        </div>
      </div>

      <div className="bg-black/50 border border-zinc-800/80 rounded-xl p-4 font-mono text-[11px] h-32 overflow-y-auto space-y-2">
        {streamData.length === 0 && streamStatus !== 'disconnected' && (
           <span className="text-zinc-600">Awaiting edge handshake...</span>
        )}
        {streamStatus === 'disconnected' && streamData.length === 0 && (
           <span className="text-rose-400 flex items-center gap-2"><FiAlertTriangle /> Cloudflare connection dropped. Retrying...</span>
        )}
        {streamData.map((log, i) => (
          <div key={i} className="flex gap-3 text-zinc-300">
            <span className="text-zinc-600 shrink-0">[{log.time}]</span>
            <span className="text-fuchsia-200">{log.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
