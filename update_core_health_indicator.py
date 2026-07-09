content = """import React, { useState, useEffect } from 'react';
import { FiActivity, FiDatabase, FiCpu } from 'react-icons/fi';
import { useTicketStore } from '../../store/useTicketStore';
import { supabase } from '../../lib/supabaseClient';

export default function CoreHealthIndicator() {
  const { realtimeSocketStatus } = useTicketStore();
  const [aiAdoptions, setAiAdoptions] = useState(0);
  const [isDbHealthy, setIsDbHealthy] = useState(true);

  useEffect(() => {
    const fetchAITelemetry = async () => {
      try {
        const { count, error } = await supabase
          .from('ticket_messages')
          .select('*', { count: 'exact', head: true })
          .eq('metadata->>ai_draft_adopted', 'true');

        if (!error && count !== null) setAiAdoptions(count);
      } catch (e) {}
    };

    const verifyDbHealth = async () => {
      try {
        const { error } = await supabase.from('support_tickets').select('id').limit(1);
        setIsDbHealthy(!error);
      } catch (e) { setIsDbHealthy(false); }
    };

    fetchAITelemetry();
    verifyDbHealth();
    const interval = setInterval(() => { fetchAITelemetry(); verifyDbHealth(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold tracking-widest text-zinc-500 uppercase select-none">

      {/* Edge Routing Node State */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950/60 border border-zinc-800/80 rounded-md">
        <span>EDGE</span>
        <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
      </div>

      {/* Database Node State */}
      <div className="flex items-center gap-2 px-2 py-1 bg-zinc-950/60 border border-zinc-800/80 rounded-md">
        <span>CORE DB</span>
        <span className={`w-1.5 h-1.5 rounded-full ${isDbHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500 animate-pulse'}`} />
      </div>

      {/* Multiplayer Socket State */}
      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-950/60 border border-zinc-800/50 rounded-md">
        <span>WSS FEED</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            realtimeSocketStatus === 'SUBSCRIBED' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-500 animate-pulse'
          }`} />
          <span className="text-zinc-400 truncate max-w-[45px]">
            {realtimeSocketStatus === 'SUBSCRIBED' ? 'LIVE' : 'CONN'}
          </span>
        </div>
      </div>

      {/* AI Adoption Telemetry Flag */}
      {aiAdoptions > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-fuchsia-950/20 border border-fuchsia-500/20 text-fuchsia-400 rounded-md shadow-[0_0_10px_rgba(217,70,239,0.05)] font-mono">
          <span>AI ROI:</span>
          <span className="font-black text-white">{aiAdoptions}</span>
        </div>
      )}
    </div>
  );
}"""

with open('src/components/layout/CoreHealthIndicator.jsx', 'w') as f:
    f.write(content)
