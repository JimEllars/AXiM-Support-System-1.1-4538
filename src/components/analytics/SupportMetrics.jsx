import React from 'react';
import ReactECharts from 'echarts-for-react';

export default function SupportMetrics() {
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
      data: [120, 200, 150, 80, 70, 110, 130],
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
        <h3 className="text-3xl font-black text-emerald-400 mt-2">94.2%</h3>
        <div className="mt-2 text-[10px] text-zinc-500 font-medium">SYSTEM OPTIMIZED</div>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-fuchsia-500/50">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Avg Response</p>
        <h3 className="text-3xl font-black text-fuchsia-500 mt-2">14<span className="text-lg">m</span></h3>
        <div className="mt-2 text-[10px] text-fuchsia-400/80 font-bold flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
          ONYX ACTIVE
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