import React, { useState, useEffect } from 'react';
import { FiTrendingUp, FiCheckCircle, FiClock, FiStar, FiCpu, FiAlertTriangle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '../../store/useAuthStore';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    totalVolume: 0,
    previousVolume: 0,
    volumeChangePercent: 0,
    overallSlaCompliance: 100,
    avgResolutionTimeMinutes: 0,
    timeSeriesData: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const { session } = useAuthStore();

  useEffect(() => {
    const fetchMetricsData = async () => {
      if (!session?.access_token) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(import.meta.env.VITE_CORE_API_URL + '/api/v1/analytics/global', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
           throw new Error('Failed to fetch analytics');
        }

        const json = await response.json();
        if (json.success && json.data) {
           setMetrics(json.data);
        }
      } catch (err) {
        console.error('Failed to load support metrics:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetricsData();
  }, [session?.access_token]);

  // Custom tooltip for line chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-700 p-2 rounded-lg text-xs shadow-xl">
          <p className="text-zinc-400 mb-1">{label}</p>
          <p className="text-indigo-400 font-bold">Vol: {payload[0].value}</p>
          {payload[0].payload.slaCompliance !== undefined && (
            <p className="text-emerald-400 font-bold">SLA: {payload[0].payload.slaCompliance}%</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
      <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1 relative overflow-hidden group">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiTrendingUp className="text-indigo-400"/> 7d Volume
        </span>
        <span className="text-xl font-bold text-white block">
           {isLoading ? '...' : metrics.totalVolume}
        </span>
        {!isLoading && !error && (
            <div className="absolute bottom-0 right-0 w-24 h-12 opacity-40 group-hover:opacity-100 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.timeSeriesData}>
                  <Line type="monotone" dataKey="volume" stroke="#818cf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
        )}
        <div className="text-[10px] text-zinc-500 mt-2">
           {metrics.volumeChangePercent > 0 ? `+${metrics.volumeChangePercent}%` : `${metrics.volumeChangePercent}%`} vs prev 7d
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiCheckCircle className="text-emerald-400"/> SLA Compliance
        </span>
        <div className="flex items-end gap-2">
            <span className="text-xl font-bold text-emerald-400 block">{isLoading ? '...' : `${metrics.overallSlaCompliance}%`}</span>
        </div>
        <div className="w-full bg-zinc-900 rounded-full h-1.5 mt-3">
          <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${metrics.overallSlaCompliance}%` }}></div>
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1">
        <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
          <FiClock className="text-amber-400"/> Avg Resolution
        </span>
        <span className="text-xl font-bold text-amber-300 block">{isLoading ? '...' : `${metrics.avgResolutionTimeMinutes}m`}</span>
        <div className="text-[10px] text-zinc-500 mt-2">Past 7 days</div>
      </div>

      <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md space-y-1 flex flex-col justify-center items-center">
        {error ? (
          <div className="text-red-400 flex flex-col items-center gap-1 text-center">
             <FiAlertTriangle className="text-lg mb-1" />
             <span>Data Sync Error</span>
          </div>
        ) : (
          <div className="text-center">
            <FiCpu className="text-emerald-400 animate-pulse text-xl mx-auto mb-1"/>
            <span className="text-emerald-300 font-bold block">Live Stream Active</span>
          </div>
        )}
      </div>
    </div>
  );
}
