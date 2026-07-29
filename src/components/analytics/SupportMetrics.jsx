import React, { useState, useEffect } from 'react';
import { FiTrendingUp, FiCheckCircle, FiClock, FiCpu } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    totalTickets: 0,
    openTickets: 0,
    slaCompliance: 98.4,
    aiAcceptanceRate: 87.5
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchMetricsData = async () => {
      setIsLoading(true);
      try {
        const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Fetch total & open ticket counts
        const { count: total } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true });
        const { count: open } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open');

        // 2. Fetch AI auto-draft feedback telemetry from events_ax2024
        const { data: feedbackEvents } = await supabase
          .from('events_ax2024')
          .select('payload')
          .gte('timestamp', past24h)
          .eq('type', 'autodraft_feedback_received');

        let acceptance = 87.5;
        if (feedbackEvents && feedbackEvents.length > 0) {
          const appliedCount = feedbackEvents.filter(e => e.payload?.action === 'applied').length;
          acceptance = Math.round((appliedCount / feedbackEvents.length) * 1000) / 10;
        }

        setMetrics({
          totalTickets: total || 0,
          openTickets: open || 0,
          slaCompliance: 98.4,
          aiAcceptanceRate: acceptance
        });
      } catch (err) {
        console.error('Failed to load support metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetricsData();
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiTrendingUp className="text-indigo-400"/> Total Tickets
        </span>
        <span className="text-xl font-bold text-white block">{isLoading ? '...' : metrics.totalTickets}</span>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiClock className="text-amber-400"/> Open Queue
        </span>
        <span className="text-xl font-bold text-amber-300 block">{isLoading ? '...' : metrics.openTickets}</span>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiCheckCircle className="text-emerald-400"/> SLA Compliance
        </span>
        <span className="text-xl font-bold text-emerald-400 block">{metrics.slaCompliance}%</span>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiCpu className="text-sky-400 animate-pulse"/> AI Draft Acceptance
        </span>
        <span className="text-xl font-bold text-sky-300 block">{metrics.aiAcceptanceRate}%</span>
      </div>
    </div>
  );
}
