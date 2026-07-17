import React, { useState, useEffect } from 'react';
import { FiCpu, FiClock, FiActivity, FiLayers, FiHelpCircle, FiGlobe } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function OnyxInvestigationPanel({ ticketId }) {
  const [telemetry, setTelemetry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAITelemetryMatrix = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('ticket_ai_telemetry')
          .select('*')
          .eq('ticket_id', ticketId)
          .maybeSingle();

        if (!error && data) {
          setTelemetry(data);
        }
      } catch (err) {
        console.error('System failed to extract edge telemetry metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (ticketId) fetchAITelemetryMatrix();
  }, [ticketId]);

  if (isLoading) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-6 animate-pulse space-y-4">
        <div className="h-4 bg-zinc-900 rounded w-1/3" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-12 bg-zinc-900/60 rounded-2xl" />
          <div className="h-12 bg-zinc-900/60 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-6 text-center text-zinc-500 font-mono text-xs">
        <FiHelpCircle className="mx-auto mb-2 text-lg text-zinc-700" />
        No telemetry footprints recorded for this operational tracking frame.
      </div>
    );
  }

  const providerProvenance = telemetry.metadata?.provider_provenance || "Unknown Cluster";
  const latencyDuration = telemetry.metadata?.generation_latency_ms || null;

  // THE 5% NOTIFICATION ELEMENT: Safely extract and fallback the processed edge locator node parameter
  const cloudflareEdgeColo = telemetry.metadata?.edge_colo || "IAD_POP";

  return (
    <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between mb-6 border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Onyx Diagnostics Node</h3>
        </div>

        {/* Render Cloudflare Edge Colo trace indicator box */}
        <span className="text-[10px] font-mono text-fuchsia-400 bg-fuchsia-500/5 px-2 py-0.5 rounded-md border border-fuchsia-500/20 flex items-center gap-1">
          <FiGlobe className="text-[9px]" /> Node: {cloudflareEdgeColo}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-black/30 border border-zinc-900 rounded-2xl p-4 hover:border-zinc-800 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono mb-1">
            <FiCpu className="text-zinc-400" /> Infrastructure
          </div>
          <p className="text-xs font-bold text-white tracking-tight truncate">
            {providerProvenance}
          </p>
        </div>

        <div className="bg-black/30 border border-zinc-900 rounded-2xl p-4 hover:border-zinc-800 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono mb-1">
            <FiClock className="text-zinc-400" /> Core Latency
          </div>
          <p className="text-xs font-mono font-black text-emerald-400">
            {latencyDuration ? `${latencyDuration}ms` : 'In-Flight/Cached'}
          </p>
        </div>

        <div className="bg-black/30 border border-zinc-900 rounded-2xl p-4 hover:border-zinc-800 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono mb-1">
            <FiActivity className="text-zinc-400" /> Customer Tone
          </div>
          <p className={`text-xs font-black uppercase tracking-wider ${
            telemetry.analyzed_sentiment === 'negative' ? 'text-rose-400' :
            telemetry.analyzed_sentiment === 'positive' ? 'text-emerald-400' : 'text-zinc-400'
          }`}>
            {telemetry.analyzed_sentiment || 'Neutral'}
          </p>
        </div>

        <div className="bg-black/30 border border-zinc-900 rounded-2xl p-4 hover:border-zinc-800 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono mb-1">
            <FiLayers className="text-zinc-400" /> Core Confidence
          </div>
          <p className="text-xs font-mono font-black text-white">
            {telemetry.confidence_score}%
          </p>
        </div>
      </div>

      <div className="relative rounded-2xl border border-zinc-900 bg-black/20 p-4">
        <label className="absolute -top-2 left-4 px-2 bg-zinc-950 text-[9px] font-black uppercase tracking-widest text-zinc-500">
          Autonomous Response Blueprint
        </label>
        <p className="text-xs text-zinc-300 leading-relaxed font-sans pt-1 whitespace-pre-wrap">
          {telemetry.auto_response_draft || "No response generation cached for this log reference context."}
        </p>
      </div>
    </div>
  );
}