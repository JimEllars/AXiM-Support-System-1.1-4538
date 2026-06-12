import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { supabase } from '../../lib/supabaseClient';
import { onyxService } from '../../services/onyxService';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    activeQueue: 0,
    escalations: 0,
    aiDeflectionRate: 0,
    volumeTrend: [0, 0, 0, 0, 0, 0, 0]
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;


    async function fetchMetrics() {
      try {
        // Active Queue Size
        const { count: openCount, error: openError } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'pending']);

        if (openError) console.error("Active Queue Error:", openError);

        // Escalations
        const { count: escalatedCount, error: escError } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('priority', 'urgent');

        if (escError) console.error("Escalations Error:", escError);

        // SLA breach rate
        const { count: breachedCount, error: breachError } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'pending'])
          .lt('sla_breach_at', new Date().toISOString());

        if (breachError) console.error("Breach Error:", breachError);

        const slaBreachRate = (openCount && breachedCount) ? ((breachedCount / openCount) * 100).toFixed(1) : 0;
        // AI Deflection Rate & Confidence Score
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIso = yesterday.toISOString();

        const { data: telemetryData, error: totError } = await supabase
          .from('ticket_ai_telemetry')
          .select('confidence_score, created_at')
          .gte('created_at', yesterdayIso);

        if (totError) console.error("Total Telemetry Error:", totError);

        let totalRecent = 0;
        let deflectedCount = 0;
        let sumConfidence = 0;

        if (telemetryData) {
          totalRecent = telemetryData.length;
          telemetryData.forEach(item => {
            const score = item.confidence_score || 0;
            sumConfidence += score;
            if (score > 90) {
              deflectedCount++;
            }
          });
        }

        const aiRate = totalRecent > 0
          ? ((deflectedCount / totalRecent) * 100).toFixed(1)
          : 0;

        const avgConfidence = totalRecent > 0
          ? (sumConfidence / totalRecent).toFixed(1)
          : 0;

        // Fetch volume trend for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const { data: trendData, error: trendError } = await supabase
          .from('support_tickets')
          .select('created_at')
          .gte('created_at', sevenDaysAgo.toISOString());

        let volumeTrend = [0, 0, 0, 0, 0, 0, 0];
        if (trendData && !trendError) {
          trendData.forEach(ticket => {
            const ticketDate = new Date(ticket.created_at);
            const diffTime = Math.abs(new Date().setHours(0,0,0,0) - ticketDate.setHours(0,0,0,0));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 7) {
              volumeTrend[6 - diffDays]++; // 6 is today, 0 is 6 days ago
            }
          });
        }

        if (isMounted) {
          setMetrics({
            activeQueue: openCount || 0,
            escalations: escalatedCount || 0,
            aiDeflectionRate: aiRate,
            avgConfidence: avgConfidence,
            volumeTrend: volumeTrend
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch live metrics:", error);
        if (isMounted) setIsLoading(false);
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

  // SVG Progress Ring logic
  const circleRadius = 24;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const dashOffset = circleCircumference - (metrics.aiDeflectionRate / 100) * circleCircumference;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>}
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Active Queue</p>
        <h3 className="text-3xl font-black text-cyan-400 mt-2">{metrics.activeQueue}</h3>
        <div className="mt-2 text-[10px] text-cyan-500/80 font-medium tracking-widest">OPEN & PENDING</div>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-rose-500/50 relative overflow-hidden">
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div></div>}
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Urgent Escalations</p>
        <h3 className="text-3xl font-black text-rose-500 mt-2">{metrics.escalations}</h3>
        <div className="mt-2 text-[10px] text-rose-500/80 font-medium tracking-widest flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          REQUIRES IMMEDIATE ATTENTION
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-fuchsia-500/50 relative overflow-hidden flex justify-between items-center">
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div></div>}

        <div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">AI Deflection</p>
          <h3 className="text-3xl font-black text-fuchsia-400 mt-2">{metrics.aiDeflectionRate}%</h3>
          <div className="mt-2 text-[10px] text-fuchsia-400/80 font-bold flex items-center gap-1 tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
            ONYX AUTOMATION 24H
          </div>
        </div>

        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={circleRadius}
              fill="transparent"
              stroke="#27272a"
              strokeWidth="6"
            />
            <circle
              cx="32"
              cy="32"
              r={circleRadius}
              fill="transparent"
              stroke="#d946ef"
              strokeWidth="6"
              strokeDasharray={circleCircumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000 ease-out"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
