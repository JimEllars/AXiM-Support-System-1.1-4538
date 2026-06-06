import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTicketStore } from '../../store/useTicketStore';

export default function CoreHealthIndicator() {
  const { isCoreOnline: isOnline, setCoreOnlineStatus: setIsOnline } = useTicketStore();

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const workerUrl = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:54321/functions/v1/onyx-bridge';
        const res = await fetch(`${workerUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json();
          setIsOnline(data.status === 'healthy' || data.status === 'degraded');

          if (data.status === 'degraded') { /* silent block */ }
        } else {
          setIsOnline(false);
        }
      } catch (error) {
        setIsOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const colorClasses = isOnline
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
    : 'text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse';

  const dotClasses = isOnline
    ? 'bg-emerald-400'
    : 'bg-rose-500 animate-ping';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed top-6 right-8 flex items-center gap-3 px-4 py-2 rounded-full border ${colorClasses} backdrop-blur-md z-50`}
    >
      <div className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClasses}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest">
        {isOnline ? 'Ecosystem Online' : 'Core Connectivity Issues'}
      </span>
    </motion.div>
  );
}
