import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { supabase } from '../../lib/supabaseClient';
import { onyxService } from '../../services/onyxService';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    activeQueue: 0,
    escalations: 0,
    aiDeflectionRate: 0,
    volumeTrend: [0,0,0,0,0,0,0]
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchMetrics() {
      try {
        // Active Queue Size
        const { count: openCount } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');

        // Escalations
        const { count: escalatedCount } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('priority', 'escalated');

        // AI Deflection Rate
        // 1. Total tickets in last 24h
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIso = yesterday.toISOString();

        const { count: totalRecent } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', yesterdayIso);

        // 2. Deflected tickets in last 24h
        const { count: deflectedCount } = await supabase
          .from('ticket_ai_telemetry')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', yesterdayIso)
          .gt('confidence_score', 90);

        const aiRate = totalRecent > 0 && deflectedCount !== null
          ? ((deflectedCount / totalRecent) * 100).toFixed(1)
          : 0;

        if (isMounted) {
          setMetrics({
            activeQueue: openCount || 0,
            escalations: escalatedCount || 0,
            aiDeflectionRate: aiRate,
            volumeTrend: [10, 20, 15, 30, 25, openCount || 0, 5] // Mock trend for now
          });
        }
      } catch (error) {
        console.error("Failed to fetch live metrics:", error);
      }
    }

    fetchMetrics();

    return () => {
      isMounted = false;
    };
  }, []);

  const option = {
    backgroundColor: 'transparent',
    grid: { top: 10, right: 10, bottom: 20, left: 30 },
    xAxis: {
      type: 'category',
      data: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
      axisLine: { lineStyle: { color: '#27272a' } },
      axisLabel: { color: '#71717a', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#18181b' } },
      axisLabel: { color: '#71717a', fontSize: 10 }
    },
    series: [{
      data: metrics.volumeTrend,
      type: 'bar',
      itemStyle: {
        color: '#22d3ee',
        borderRadius: [2, 2, 0, 0],
        shadowBlur: 10,
        shadowColor: 'rgba(34, 211, 238, 0.3)'
      },
      barWidth: '50%'
    }],
    tooltip: { 
      trigger: 'axis',
      backgroundColor: '#09090b',
      borderColor: '#27272a',
      textStyle: { color: '#fafafa' }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="glass-panel p-6 rounded-2xl">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Active Queue</p>
        <h3 className="text-3xl font-black text-cyan-400 mt-2">{metrics.activeQueue}</h3>
        <div className="mt-2 text-[10px] text-cyan-500/80 font-medium tracking-widest">OPEN CASES</div>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-rose-500/50">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Escalations</p>
        <h3 className="text-3xl font-black text-rose-500 mt-2">{metrics.escalations}</h3>
        <div className="mt-2 text-[10px] text-rose-500/80 font-medium tracking-widest flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          REQUIRES ATTENTION
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-fuchsia-500/50">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">AI Deflection</p>
        <h3 className="text-3xl font-black text-fuchsia-400 mt-2">{metrics.aiDeflectionRate}%</h3>
        <div className="mt-2 text-[10px] text-fuchsia-400/80 font-bold flex items-center gap-1 tracking-widest">
          <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
          ONYX AUTOMATION 24H
        </div>
      </div>
    </div>
  );
}
