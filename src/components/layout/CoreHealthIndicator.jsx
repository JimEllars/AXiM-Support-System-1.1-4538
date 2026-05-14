import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function CoreHealthIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const CORE_URL = import.meta.env.VITE_CORE_API_URL || 'https://api.axim-core.internal';
        // Usually, edge functions are under /functions/v1/
        // But the prompt says "AXiM Core's gateway-heartbeat edge function"
        const url = `${CORE_URL}/functions/v1/gateway-heartbeat`;

        // Mock the fetch if we are in a purely local environment without a real core
        if (import.meta.env.VITE_MOCK_LLM_ENABLED === 'true') {
            setIsOnline(true);
            return;
        }

        const res = await fetch(url, { method: 'GET' });
        setIsOnline(res.ok);
      } catch (e) {
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
