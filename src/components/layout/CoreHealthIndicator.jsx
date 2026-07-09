import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTicketStore } from '../../store/useTicketStore';

export default function CoreHealthIndicator() {
  const { isCoreOnline: isOnline, setCoreOnlineStatus: setIsOnline, realtimeSocketStatus } = useTicketStore();
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        // CRITICAL FIX: Redirect fallback URL away from dead port 54321 to active edge port 8787
        const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:8787';
        const res = await fetch(`${workerUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const data = await res.json();
          setIsOnline(data.status === 'healthy' || data.status === 'degraded');
        } else {
          setIsOnline(false);
        }
      } catch (error) {
        setIsOnline(false);
      }
    };

    checkHealth();
    const healthInterval = setInterval(checkHealth, 30000); // Poll every 30 seconds

    // THE 5% FEATURE BLOCK: Lightweight telemetry session uptime tracker
    const uptimeInterval = setInterval(() => {
      setUptimeSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(uptimeInterval);
    };
  }, [setIsOnline]);

  const formatUptime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isWssHealthy = realtimeSocketStatus === 'SUBSCRIBED';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-6 right-8 flex items-center gap-4 px-4 py-2 bg-zinc-950/80 border border-zinc-800 backdrop-blur-md rounded-xl shadow-2xl z-50 font-mono text-[10px]"
    >
      {/* Edge Node Pipeline State */}
      <div className="flex items-center gap-2 border-r border-zinc-800 pr-3">
        <div className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>
        <span className={isOnline ? 'text-zinc-400 font-bold' : 'text-rose-400 font-black animate-pulse'}>
          {isOnline ? 'EDGE: OK' : 'EDGE: LOSS'}
        </span>
      </div>

      {/* Multiplayer Realtime WebSocket State */}
      <div className="flex items-center gap-2 border-r border-zinc-800 pr-3">
        <div className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isWssHealthy ? 'bg-cyan-400' : 'bg-amber-500 animate-ping'}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isWssHealthy ? 'bg-cyan-500' : 'bg-amber-500'}`} />
        </div>
        <span className={isWssHealthy ? 'text-zinc-400 font-bold' : 'text-amber-400 font-black'}>
          WSS: {isWssHealthy ? 'LIVE' : 'CONN'}
        </span>
      </div>

      {/* Polish Metric Clock */}
      <div className="text-zinc-500 font-mono text-[9px]">
        UP: <span className="text-zinc-300 font-bold">{formatUptime(uptimeSeconds)}</span>
      </div>
    </motion.div>
  );
}
