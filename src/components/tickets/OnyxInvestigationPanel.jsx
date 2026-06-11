import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SafeIcon from "../../common/SafeIcon";
import * as FiIcons from "react-icons/fi";
import { useTicketStore } from "../../store/useTicketStore";
import { supabase } from "../../lib/supabaseClient";

const { FiTerminal, FiCpu, FiCheck, FiLoader, FiX } = FiIcons;

export default function OnyxInvestigationPanel({
  ticketId,
  isInvestigating,
  onClose,
}) {
  const [logs, setLogs] = useState([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!ticketId || !isInvestigating) {
      setLogs([]);
      setIsActive(false);
      return;
    }

    // Subscribe to events_ax2024 for onyx_presence logs
    const channel = supabase
      .channel(`onyx-presence-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events_ax2024",
          filter: `type=eq.onyx_presence`,
        },
        (payload) => {
          const newEvent = payload.new;
          if (newEvent.payload && newEvent.payload.ticket_id === ticketId) {
            if (newEvent.payload.status === "Thinking") {
              setIsActive(true);
              setLogs((prev) => [
                ...prev,
                {
                  id: Date.now(),
                  msg: newEvent.payload.message || "Onyx sub-agents spawned.",
                  type: "info",
                },
              ]);
            } else if (newEvent.payload.status === "Complete") {
              setLogs((prev) => [
                ...prev,
                {
                  id: Date.now(),
                  msg: newEvent.payload.message || "Investigation complete.",
                  type: "success",
                },
              ]);
              setTimeout(() => setIsActive(false), 5000);
            } else {
              setLogs((prev) => [
                ...prev,
                {
                  id: Date.now(),
                  msg: newEvent.payload.message || "Processing...",
                  type: "process",
                },
              ]);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setLogs([]);
      setIsActive(false);
    };
  }, [ticketId, isInvestigating]);

  if (!isActive && logs.length === 0) return null;

  return (
    <div className="bg-zinc-950 border border-fuchsia-900/50 rounded-[2rem] overflow-hidden mb-8 shadow-[0_0_30px_rgba(217,70,239,0.1)]">
      <div className="bg-fuchsia-950/20 px-6 py-4 border-b border-fuchsia-900/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
            <SafeIcon icon={FiCpu} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-widest">
              Onyx Sub-Agent Analysis
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
              <span className="text-[10px] text-fuchsia-400 font-bold tracking-widest uppercase">
                Live Telemetry Active
              </span>
            </div>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <SafeIcon icon={FiLoader} className="animate-spin" /> Processing
          </div>
        )}
        <button
          onClick={() => {
            setIsActive(false);
            if (onClose) onClose();
          }}
          className="ml-4 p-2 hover:bg-fuchsia-500/10 rounded-lg text-zinc-500 hover:text-fuchsia-400 transition-colors"
        >
          <SafeIcon icon={FiX} />
        </button>
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
              <span className="text-zinc-600 shrink-0">
                [{new Date(log.id).toISOString().split("T")[1].slice(0, -1)}]
              </span>
              {log.type === "success" ? (
                <span className="text-emerald-400 flex items-center gap-2">
                  <SafeIcon icon={FiCheck} /> {log.msg}
                </span>
              ) : log.type === "info" ? (
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
