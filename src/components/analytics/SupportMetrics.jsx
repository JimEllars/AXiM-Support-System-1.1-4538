import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ReactECharts from 'echarts-for-react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useTicketStore } from '../../store/useTicketStore';

export default function SupportMetrics() {
  const {
    supportMetrics: metrics,
    setSupportMetrics,
    isMetricsLoading: isLoading,
    setMetricsLoading: setIsLoading,
    metricsError: error,
    setMetricsError: setError
  } = useTicketStore();

  useEffect(() => {
    let isMounted = true;

    async function fetchMetrics() {
      if (!isMounted) return;
      setIsLoading(true);
      setError(false);

      try {
        const { data: tickets, error: ticketErr } = await supabase
          .from('support_tickets')
          .select('status');

        if (ticketErr) throw ticketErr;

        const openCount = tickets?.filter(t => t.status === 'open' || t.status === 'pending').length || 0;
        const escalatedCount = tickets?.filter(t => t.status === 'escalated').length || 0;

        const { data: dlqData, error: dlqErr } = await supabase
          .from('events_ax2024')
          .select('id', { count: 'exact' })
          .eq('type', 'dlq_payload');

        if (dlqErr) throw dlqErr;
        const dlqCount = dlqData?.length || 0;


        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        const cutoffDateString = twentyFourHoursAgo.toISOString();


        const { data: telemetry, error: telemetryErr } = await supabase
          .from('ticket_ai_telemetry')
          .select('confidence_score, deflected, processing_time_ms, tokens_used')
          .gte('created_at', cutoffDateString);

        if (telemetryErr) throw telemetryErr;

        let deflectedCount = 0;
        let totalRecent = telemetry?.length || 0;
        let sumConfidence = 0;
        let sumLatency = 0;
        let totalTokens = 0;

        telemetry?.forEach(t => {
          if (t.deflected) deflectedCount++;
          sumConfidence += (t.confidence_score || 0);
          sumLatency += (t.processing_time_ms || 0);
          totalTokens += (t.tokens_used || 0);
        });

        const avgLatency = totalRecent > 0 ? Math.round(sumLatency / totalRecent) : 0;

        const { data: allTickets, error: allTicketsErr } = await supabase
          .from('support_tickets')
          .select('status, created_at, sla_breach_at')
          .gte('created_at', cutoffDateString);

        if (allTicketsErr) throw allTicketsErr;

        let breachedCount = 0;
        allTickets?.forEach(ticket => {
          if (ticket.sla_breach_at && new Date(ticket.sla_breach_at) < new Date()) {
            breachedCount++;
          }
        });

        const slaBreachRate = allTickets && allTickets.length > 0
          ? ((breachedCount / allTickets.length) * 100).toFixed(1)
          : 0;


        const { data: feedbackData, error: feedbackErr } = await supabase
          .from('product_feedback')
          .select('satisfaction_score')
          .gte('created_at', cutoffDateString);

        let sumCsat = 0;
        let csatCount = feedbackData?.length || 0;
        if (!feedbackErr && feedbackData) {
            feedbackData.forEach(f => sumCsat += (f.satisfaction_score || 0));
        }
        const avgCsat = csatCount > 0 ? (sumCsat / csatCount).toFixed(1) : 0;

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
          setSupportMetrics({
            activeQueue: openCount || 0,
            escalations: escalatedCount || 0,
            aiDeflectionRate: aiRate,
            slaBreachRate: slaBreachRate || 0,
            dlqExceptions: dlqCount || 0,
            avgConfidence: avgConfidence,
            csatScore: avgCsat, // Not sure where avgSat came from, original code has avgCsat
            volumeTrend: volumeTrend,
            avgLatency: avgLatency,
            totalTokens: totalTokens
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch live metrics:", error);
        setError(true);
        if (isMounted) setIsLoading(false);
      }
    }


    fetchMetrics();

    const telemetryChannel = supabase.channel('public:telemetry_metrics')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_ai_telemetry' }, () => {
        fetchMetrics();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events_ax2024' }, () => {
        fetchMetrics();
      })
      .subscribe();




    return () => {
      supabase.removeChannel(telemetryChannel);
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

  if (error) {
    return (
      <div className="glass-panel p-6 rounded-2xl flex items-center justify-center border-rose-500/30">
        <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">
          ⚠️ Telemetry offline. Retrying...
        </p>
      </div>
    );
  }

  // SVG Progress Ring logic
  const circleRadius = 24;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const dashOffset = circleCircumference - (metrics.aiDeflectionRate / 100) * circleCircumference;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8 bg-[#09090b]/80 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl p-4 flex-wrap">
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
      {/* Phase 37: Added SLA Breach Rate metric display */}
      <div className={`glass-panel p-6 rounded-2xl border-l-2 relative overflow-hidden ${metrics.slaBreachRate > 10 ? 'border-l-rose-500/50' : 'border-l-amber-500/50'}`}>
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>}
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">SLA Breach Rate</p>
        <h3 className={`text-3xl font-black mt-2 ${metrics.slaBreachRate > 10 ? 'text-rose-500' : 'text-amber-400'}`}>{metrics.slaBreachRate}%</h3>
        <div className={`mt-2 text-[10px] font-medium tracking-widest ${metrics.slaBreachRate > 10 ? 'text-rose-500/80' : 'text-amber-500/80'}`}>OVER 24H SLA</div>
      </div>

      <div
        className={`glass-panel p-6 rounded-2xl border-l-2 relative overflow-hidden cursor-pointer hover:ring-2 ring-rose-500/50 transition-all ${metrics.dlqExceptions > 0 ? 'border-l-rose-500/50' : 'border-l-emerald-500/50'}`}
        onClick={() => {
          const el = document.getElementById('dlq-monitor-block');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          } else {
            window.location.hash = '#dlq-monitor';
          }
        }}
      >
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Unhandled Exceptions (DLQ)</p>
        <h3 className={`text-3xl mt-2 ${metrics.dlqExceptions > 0 ? 'animate-pulse text-rose-500 font-black' : 'text-emerald-400 font-bold'}`}>{metrics.dlqExceptions}</h3>
        <div className={`mt-2 text-[10px] font-medium tracking-widest ${metrics.dlqExceptions > 0 ? 'text-rose-500/80' : 'text-emerald-500/80'}`}>DEAD LETTER QUEUE</div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-fuchsia-500/50 bg-fuchsia-950/15 relative overflow-hidden">
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center z-10"><div className="w-5 h-5 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div></div>}
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Onyx Engine Health</p>
        <h3 className="text-3xl font-black text-fuchsia-400 mt-2">{metrics.avgLatency || 0}<span className="text-xs font-normal text-zinc-500 ml-1">ms</span></h3>
        <div className="mt-2 text-[10px] text-fuchsia-300/70 font-mono tracking-tighter uppercase">
          24H VOL: {metrics.totalTokens ? `${(metrics.totalTokens / 1000).toFixed(1)}k` : '0'} TOKENS
        </div>
      </div>
    </div>
  );
}
