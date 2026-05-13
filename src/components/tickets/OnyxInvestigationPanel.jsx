import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useTicketStore } from '../../store/useTicketStore';

const { FiTerminal, FiCpu, FiCheck, FiLoader } = FiIcons;

export default function OnyxInvestigationPanel({ ticketId }) {
  const [logs, setLogs] = useState([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!ticketId) return;

    let eventSource;
    try {
      // Connect to the edge worker SSE endpoint for "thinking" events
      const workerUrl = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:54321/functions/v1/onyx-bridge';
      // Pass the request without the secret since EventSource doesn't do auth headers natively.
      // Instead, in a real scenario we'd do a fetch to get a short lived token first.
      // For this demo, we can just omit the secret requirement for the SSE stream or use a mock non-secret param.
      const token = 'demo_token_only';
      const url = `${workerUrl}/api/v1/onyx-bridge/stream?ticket_id=${ticketId}&token=${token}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'start') {
             setIsActive(true);
             setLogs([{ id: Date.now(), msg: 'Onyx sub-agents spawned.', type: 'info' }]);
          } else if (data.type === 'log') {
             setLogs(prev => [...prev, { id: Date.now(), msg: data.message, type: 'process' }]);
          } else if (data.type === 'complete') {
             setLogs(prev => [...prev, { id: Date.now(), msg: 'Investigation complete.', type: 'success' }]);
             setTimeout(() => setIsActive(false), 5000); // Hide after a while
          }
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };

      eventSource.onerror = (err) => {
        // SSE often errors on close, ignore or handle reconnect logic here
        eventSource.close();
      };

    } catch (err) {
      console.error("Failed to connect to Onyx SSE", err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [ticketId]);

  if (!isActive && logs.length === 0) return null;

  return (
    <div className="bg-zinc-950 border border-fuchsia-900/50 rounded-[2rem] overflow-hidden mb-8 shadow-[0_0_30px_rgba(217,70,239,0.1)]">
      <div className="bg-fuchsia-950/20 px-6 py-4 border-b border-fuchsia-900/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
            <SafeIcon icon={FiCpu} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-widest">Onyx Sub-Agent Analysis</h3>
            <div className="flex items-center gap-2 mt-0.5">
               <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
               <span className="text-[10px] text-fuchsia-400 font-bold tracking-widest uppercase">Live Telemetry Active</span>
            </div>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <SafeIcon icon={FiLoader} className="animate-spin" /> Processing
          </div>
        )}
      </div>

      <div className="p-6 font-mono text-xs bg-[#09090b] min-h-[120px] max-h-[240px] overflow-y-auto space-y-3">
        <AnimatePresence>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-3"
            >
              <span className="text-zinc-600 shrink-0">[{new Date(log.id).toISOString().split('T')[1].slice(0, -1)}]</span>
              {log.type === 'success' ? (
                <span className="text-emerald-400 flex items-center gap-2"><SafeIcon icon={FiCheck} /> {log.msg}</span>
              ) : log.type === 'info' ? (
                <span className="text-fuchsia-400">{log.msg}</span>
              ) : (
                <span className="text-zinc-300">
                  <span className="text-cyan-400 mr-2">➜</span>
                  {log.msg}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="w-2 h-4 bg-fuchsia-500 mt-2"
          />
        )}
      </div>
    </div>
  );
}
