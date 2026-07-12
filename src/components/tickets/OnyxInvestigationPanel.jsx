import React, { useState, useEffect, useRef } from 'react';
import { FiCpu, FiPlay, FiRefreshCw, FiCheckCircle, FiActivity, FiServer } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function OnyxInvestigationPanel({ ticket }) {
  const [loading, setLoading] = useState(false);
  const [streamedAnalysis, setStreamedAnalysis] = useState("");
  const [metrics, setMetrics] = useState({ latency: 0, provider: "Deepseek-V3" });
  const abortControllerRef = useRef(null);

  // CRITICAL FIX: Enforce component unmount and view state reset containment loops
  useEffect(() => {
    setStreamedAnalysis("");
    setLoading(false);
    setMetrics({ latency: 0, provider: "Deepseek-V3" });

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [ticket?.id]);

  const triggerLiveInquestStream = async () => {
    if (loading) return;
    setLoading(true);
    setStreamedAnalysis("");
    const startTime = performance.now();

    try {
      const workerUrl = getEdgeWorkerUrl();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      abortControllerRef.current = new AbortController();

      const response = await fetch(`${workerUrl}/api/v1/onyx-bridge/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: ticket.subject,
          description: ticket.description
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error("Upstream real-time stream channel connection rejected.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Render step typewriter updates cleanly into state view container
        setStreamedAnalysis(buffer);

        // Dynamically compute runtime stream latency markers
        setMetrics(prev => ({
          ...prev,
          latency: Math.round(performance.now() - startTime)
        }));
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        setStreamedAnalysis(prev => prev + `\n\n[INQUEST FAULT]: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6">
      {/* Header Container Area Layout */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
            <FiCpu className={loading ? "animate-spin text-fuchsia-400" : ""} />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Onyx Diagnostic Triage Inquest</h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Ecosystem Vault Isolation Mode</p>
          </div>
        </div>

        <button
          onClick={triggerLiveInquestStream}
          disabled={loading || !ticket}
          className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border rounded-xl transition-all ${
            loading
              ? 'bg-zinc-900 border-zinc-800 text-zinc-500 cursor-wait'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200 shadow-lg'
          }`}
        >
          {loading ? <FiRefreshCw className="animate-spin" /> : <FiPlay />}
          {loading ? "Streaming Analytica..." : "Run Inquest"}
        </button>
      </div>

      {/* Code Text Window Block Area Layout */}
      {streamedAnalysis ? (
        <div className="bg-zinc-950 border border-zinc-900 font-mono rounded-xl p-4 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto shadow-inner relative">
          {streamedAnalysis}
        </div>
      ) : (
        <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-[11px] text-zinc-500 font-mono">
          Ready to initialize decentralized V8 isolate ingestion sequence threads.
        </div>
      )}

      {/* Hardened Telemetry Dashboard Strip (95% Project Metric Execution Block) */}
      {streamedAnalysis && (
        <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-4 font-mono text-[9px]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <FiServer className="text-xs text-zinc-400" />
              ENGINE: <span className="text-zinc-300 font-bold uppercase">{metrics.provider}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <FiActivity className="text-xs text-zinc-400" />
              LATENCY: <span className="text-fuchsia-400 font-bold">{metrics.latency}ms</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/5 px-2 py-0.5 border border-emerald-500/10 rounded">
            <FiCheckCircle className="text-xs" /> Telemetry Synced
          </div>
        </div>
      )}
    </div>
  );
}
