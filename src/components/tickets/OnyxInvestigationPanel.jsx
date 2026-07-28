import React, { useState, useEffect } from 'react';
import { FiCpu, FiClock, FiCheckCircle, FiMail } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function OnyxInvestigationPanel({ ticketId }) {
  const [telemetry, setTelemetry] = useState(null);
  const [lastBriefedAt, setLastBriefedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInvestigationData = async () => {
    if (!ticketId) return;
    setIsLoading(true);
    try {
      const { data: telemetryData } = await supabase
        .from('ticket_ai_telemetry')
        .select('*')
        .eq('ticket_id', ticketId)
        .maybeSingle();

      setTelemetry(telemetryData || null);

      const { data: briefingEvent } = await supabase
        .from('events_ax2024')
        .select('timestamp')
        .eq('type', 'thread_executive_briefing_exported')
        .eq('payload->>ticket_id', ticketId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (briefingEvent?.timestamp) {
        setLastBriefedAt(new Date(briefingEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } else {
        setLastBriefedAt(null);
      }
    } catch (err) {
      console.error('Failed to load investigation telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestigationData();

    // Listen for live briefing export events from WebSocket channel
    const handleLiveBriefing = (e) => {
      if (e.detail?.payload?.ticket_id === ticketId) {
        setLastBriefedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    };

    window.addEventListener('axim:briefing_exported', handleLiveBriefing);
    return () => window.removeEventListener('axim:briefing_exported', handleLiveBriefing);
  }, [ticketId]);

  if (isLoading) {
    return (
      <div className="p-5 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 font-mono text-xs text-zinc-500 animate-pulse">
        Analyzing neural telemetry & investigation vectors...
      </div>
    );
  }

  return (
    <div className="p-5 rounded-3xl bg-gradient-to-tr from-zinc-950/90 to-zinc-900/60 border border-zinc-800/80 backdrop-blur-lg shadow-xl shadow-indigo-900/10 space-y-4 font-mono transition-all duration-300 hover:shadow-indigo-900/20">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
          <FiCpu className="text-sm animate-pulse"/>
          <span className="uppercase tracking-wider">Onyx Edge Neural Investigation</span>
        </div>

        <div className="flex items-center gap-2">
          {lastBriefedAt && (
            <span className="text-[9px] text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 flex items-center gap-1">
              <FiMail className="text-[9px]"/> Briefed: {lastBriefedAt}
            </span>
          )}

          {telemetry?.is_curated && (
            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
              <FiCheckCircle className="text-[9px]"/> Curated Analysis
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 backdrop-blur-sm shadow-inner transition-colors duration-300 hover:bg-zinc-800/60">
          <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Sentiment</span>
          <span className={`font-bold ${
            telemetry?.sentiment === 'positive' ? 'text-emerald-400' :
            telemetry?.sentiment === 'negative' ? 'text-rose-400' : 'text-amber-400'
          }`}>
            {telemetry?.sentiment || 'Neutral'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 backdrop-blur-sm shadow-inner transition-colors duration-300 hover:bg-zinc-800/60">
          <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Category</span>
          <span className="text-zinc-200 font-bold uppercase">{telemetry?.category || 'General'}</span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 backdrop-blur-sm shadow-inner transition-colors duration-300 hover:bg-zinc-800/60">
          <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Confidence</span>
          <span className="text-indigo-400 font-bold">{telemetry?.confidence ? `${telemetry.confidence}%` : '85%'} </span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 backdrop-blur-sm shadow-inner transition-colors duration-300 hover:bg-zinc-800/60">
          <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Triage Latency</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <FiClock className="text-[10px]"/> {telemetry?.generation_latency_ms || '42'}ms
          </span>
        </div>
      </div>
    </div>
  );
}
