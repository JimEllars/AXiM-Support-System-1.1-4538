import React, { useState, useEffect } from 'react';
import { FiActivity, FiClock, FiShield } from 'react-icons/fi';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import CoreHealthDiagnosticsModal from '../modals/CoreHealthDiagnosticsModal';
import { onyxService } from '../../services/onyxService';

export default function CoreHealthIndicator() {
  const [edgeStatus, setEdgeStatus] = useState('checking');
  const [cronStatus, setCronStatus] = useState('checking');
  const [shieldStatus, setShieldStatus] = useState('checking');
  const [lastCronRun, setLastCronRun] = useState(null);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [latency, setLatency] = useState(null);

  // Track consecutive failures to apply exponential backoff
  const [failures, setFailures] = useState(0);

  const checkHealth = async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();

      const startTime = performance.now();
      const edgeRes = await onyxService.fetchWithTimeout(`${workerUrl}/health`);
      const endTime = performance.now();

      if (edgeRes.success) {
        setEdgeStatus('healthy');
        setLatency(Math.round(endTime - startTime));
        setFailures(0);
      } else {
        setEdgeStatus('degraded');
        setFailures(f => f + 1);
      }

      const cronRes = await onyxService.fetchWithTimeout(`${workerUrl}/api/v1/health/cron`);
      if (cronRes.success) {
        const cronData = cronRes.data;
        setCronStatus(cronData.status || 'healthy');
        if (cronData.last_cron_run) {
          setLastCronRun(new Date(cronData.last_cron_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } else {
         setCronStatus('degraded');
      }

      const secRes = await onyxService.fetchWithTimeout(`${workerUrl}/api/v1/health/security`);
      if (secRes.success) {
        const secData = secRes.data;
        setShieldStatus(secData.status === 'shield_active' ? 'active' : 'degraded');
      } else {
         setShieldStatus('degraded');
      }
    } catch (err) {
      setEdgeStatus('degraded');
      setCronStatus('degraded');
      setShieldStatus('degraded');
      setFailures(f => f + 1);
    }
  };

  useEffect(() => {
    checkHealth();
    let timeoutId;

    const scheduleNext = () => {
       // Exponential backoff logic
       const baseInterval = 30000;
       const maxInterval = 300000; // 5 mins
       // if failures > 0, we do baseInterval * (2 ^ (failures - 1))
       const currentFailures = failures;
       let nextInterval = baseInterval;

       if (currentFailures > 0) {
          nextInterval = Math.min(baseInterval * Math.pow(2, currentFailures - 1), maxInterval);
       }

       timeoutId = setTimeout(() => {
          checkHealth().finally(() => scheduleNext());
       }, nextInterval);
    };

    scheduleNext();

    return () => clearTimeout(timeoutId);
  }, [failures]); // Re-run effect if failures state changes so next schedule reflects backoff

  return (
    <>
      <div
        onClick={() => setIsDiagOpen(true)}
        className="flex flex-wrap items-center gap-2 font-mono text-[10px] cursor-pointer hover:opacity-90 transition-opacity p-2"
        title="Click to open interactive system diagnostics & telemetry modal"
      >
        {/* Edge Worker Health Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
          <FiActivity className={`text-xs ${edgeStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="font-bold uppercase tracking-wider">Edge Worker</span>
          <span className={`px-1 rounded text-[9px] uppercase ${edgeStatus === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {edgeStatus}
          </span>
          {latency !== null && edgeStatus === 'healthy' && (
            <span className="text-[9px] text-zinc-500 ml-1">{latency}ms</span>
          )}
        </div>

        {/* Cloudflare CRON Schedule Pulse Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
          <FiClock className={`text-xs ${cronStatus === 'healthy' ? 'text-sky-400' : 'text-amber-400'}`} />
          <span className="font-bold uppercase tracking-wider">CRON 08:00 UTC</span>
          <span className={`px-1 rounded text-[9px] uppercase ${cronStatus === 'healthy' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {cronStatus === 'healthy' ? (lastCronRun ? `Run: ${lastCronRun}` : 'Active') : 'Pending'}
          </span>
        </div>

        {/* Edge Shield Rate-Limiting & HMAC Guard Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
          <FiShield className={`text-xs ${shieldStatus === 'active' ? 'text-indigo-400' : 'text-amber-400'}`} />
          <span className="font-bold uppercase tracking-wider">Edge Shield</span>
          <span className={`px-1 rounded text-[9px] uppercase ${shieldStatus === 'active' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {shieldStatus === 'active' ? 'Active' : 'Degraded'}
          </span>
        </div>
      </div>

      <CoreHealthDiagnosticsModal isOpen={isDiagOpen} onClose={() => setIsDiagOpen(false)} />
    </>
  );
}
