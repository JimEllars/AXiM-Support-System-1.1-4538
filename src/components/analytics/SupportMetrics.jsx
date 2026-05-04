import React, { useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTicketStore } from '../../store/useTicketStore';
import { onyxService } from '../../services/onyxService';

export default function SupportMetrics() {
  const { tickets } = useTicketStore();

  const metrics = useMemo(() => {
    if (!tickets || tickets.length === 0) return { resolutionRate: 0, avgHandleTime: 0, volumeTrend: [0,0,0,0,0,0,0] };

    const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');
    const resolutionRate = (resolvedTickets.length / tickets.length) * 100;

    // Mock avg handle time logic - in real app, we'd subtract closed_at from created_at
    const avgHandleTime = resolvedTickets.length > 0 ? 14 : 0;

    // Mock trend
    const volumeTrend = [
        Math.floor(Math.random() * 50) + 50,
        Math.floor(Math.random() * 50) + 100,
        Math.floor(Math.random() * 50) + 120,
        Math.floor(Math.random() * 50) + 80,
        Math.floor(Math.random() * 50) + 90,
        tickets.length,
        Math.floor(Math.random() * 50) + 110,
    ];

    return {
        resolutionRate: resolutionRate.toFixed(1),
        avgHandleTime,
        volumeTrend,
        onyxAutomationPercentage: 85.4 // Simulated Onyx contribution
    };
  }, [tickets]);

  // Sync to Core daily (simulated on mount for demo purposes)
  useEffect(() => {
    if (metrics.resolutionRate > 0) {
        onyxService.syncTelemetryToCore(metrics).catch(console.error);
    }
  }, [metrics]);

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
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Resolution Rate</p>
        <h3 className="text-3xl font-black text-emerald-400 mt-2">{metrics.resolutionRate}%</h3>
        <div className="mt-2 text-[10px] text-zinc-500 font-medium">SYSTEM OPTIMIZED</div>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-fuchsia-500/50">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Avg Response</p>
        <h3 className="text-3xl font-black text-fuchsia-500 mt-2">{metrics.avgHandleTime}<span className="text-lg">m</span></h3>
        <div className="mt-2 text-[10px] text-fuchsia-400/80 font-bold flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
          ONYX ACTIVE ({metrics.onyxAutomationPercentage}%)
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Volume Trend</p>
        <div className="h-[60px]">
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
