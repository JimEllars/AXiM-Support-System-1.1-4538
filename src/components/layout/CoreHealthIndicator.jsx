import React, { useState, useEffect } from 'react';
import { FiActivity, FiClock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function CoreHealthIndicator() {
  const [edgeStatus, setEdgeStatus] = useState('checking'); // 'healthy' | 'degraded' | 'checking'
  const [cronStatus, setCronStatus] = useState('checking'); // 'healthy' | 'pending_initial_run' | 'checking'
  const [lastCronRun, setLastCronRun] = useState(null);

  const checkHealth = async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();

      // 1. Check main edge worker health
      const edgeRes = await fetch(`${workerUrl}/health`);
      if (edgeRes.ok) {
        setEdgeStatus('healthy');
      } else {
        setEdgeStatus('degraded');
      }

      // 2. Check scheduled CRON heartbeat health
      const cronRes = await fetch(`${workerUrl}/api/v1/health/cron`);
      if (cronRes.ok) {
        const cronData = await cronRes.json();
        setCronStatus(cronData.status || 'healthy');
        if (cronData.last_cron_run) {
          setLastCronRun(new Date(cronData.last_cron_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (err) {
      setEdgeStatus('degraded');
      setCronStatus('degraded');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 45000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      {/* Edge Worker Health Indicator */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
        <FiActivity className={`text-xs ${edgeStatus === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`} />
        <span className="font-bold uppercase tracking-wider">Edge Worker</span>
        <span className={`px-1 rounded text-[9px] uppercase ${edgeStatus === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {edgeStatus}
        </span>
      </div>

      {/* Cloudflare CRON Schedule Pulse Indicator */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
        <FiClock className={`text-xs ${cronStatus === 'healthy' ? 'text-sky-400' : 'text-amber-400'}`} />
        <span className="font-bold uppercase tracking-wider">CRON 08:00 UTC</span>
        <span className={`px-1 rounded text-[9px] uppercase ${cronStatus === 'healthy' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {cronStatus === 'healthy' ? (lastCronRun ? `Run: ${lastCronRun}` : 'Active') : 'Pending'}
        </span>
      </div>
    </div>
  );
}