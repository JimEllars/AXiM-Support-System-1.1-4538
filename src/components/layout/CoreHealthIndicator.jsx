import React, { useState, useEffect } from 'react';
import SafeIcon from '../../common/SafeIcon';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import CoreHealthDiagnosticsModal from '../modals/CoreHealthDiagnosticsModal';
import { onyxService } from '../../services/onyxService';
import { FiChevronDown } from 'react-icons/fi';

export default function CoreHealthIndicator() {
  const [edgeStatus, setEdgeStatus] = useState('checking');
  const [cronStatus, setCronStatus] = useState('checking');
  const [shieldStatus, setShieldStatus] = useState('checking');
  const [onyxStatus, setOnyxStatus] = useState('checking');
  const [lastCronRun, setLastCronRun] = useState(null);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [latency, setLatency] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
      } else if (edgeRes.synthetic) {
        setEdgeStatus('degraded (edge-cached)');
        setLatency(Math.round(endTime - startTime));
        setFailures(f => f + 1);
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
         setOnyxStatus('degraded');
      }

      const onyxRes = await onyxService.checkOnyxHealth();
      if (onyxRes.isDegraded) {
          setOnyxStatus('degraded (edge-cached)');
      } else if (onyxRes.isHealthy) {
          setOnyxStatus('healthy');
      } else {
          setOnyxStatus('degraded');
      }

    } catch (err) {
      setEdgeStatus('degraded');
      setCronStatus('degraded');
      setShieldStatus('degraded');
      setOnyxStatus('degraded');
      setFailures(f => f + 1);
    }
  };

  useEffect(() => {
    checkHealth();
    let timeoutId;

    const scheduleNext = () => {
       if (document.hidden) {
           // Wait and try again if tab is backgrounded
           timeoutId = setTimeout(scheduleNext, 5000);
           return;
       }
       // Exponential backoff logic
       const baseInterval = 45000;
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

  // Determine global status
  const isAllHealthy = edgeStatus === 'healthy' && cronStatus === 'healthy' && shieldStatus === 'active' && onyxStatus === 'healthy';
  const hasDegraded = edgeStatus.includes('degraded') || cronStatus === 'degraded' || shieldStatus === 'degraded' || onyxStatus.includes('degraded');

  const globalStatusColor = isAllHealthy ? 'bg-emerald-500' : hasDegraded ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="relative">
      <div
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 font-mono text-[10px] cursor-pointer hover:opacity-90 transition-opacity px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-md"
      >
        <div className={`w-2 h-2 rounded-full ${globalStatusColor} ${isAllHealthy ? 'animate-pulse' : ''}`} />
        <span className="font-bold uppercase tracking-wider text-zinc-300">System Status</span>
        {latency !== null && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                latency < 150 ? 'bg-emerald-500/10 text-emerald-400' :
                latency <= 450 ? 'bg-amber-500/10 text-amber-400' :
                'bg-rose-500/10 text-rose-400'
            }`}>{latency}ms</span>
        )}
        <FiChevronDown className="text-zinc-500" />
      </div>

      {isDropdownOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 flex flex-col gap-2 z-50">

            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors border border-zinc-800/80">
              <SafeIcon icon={null} name="Activity" className={`text-xs ${edgeStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div className="flex flex-col flex-1">
                <span className="font-bold uppercase tracking-wider text-zinc-300 text-[10px]">Edge Worker</span>
                <span className={`text-[9px] uppercase ${edgeStatus === 'healthy' ? 'text-emerald-500' : 'text-amber-500'}`}>{edgeStatus}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors border border-zinc-800/80">
              <SafeIcon icon={null} name="Clock" className={`text-xs ${cronStatus === 'healthy' ? 'text-sky-400' : 'text-amber-400'}`} />
              <div className="flex flex-col flex-1">
                <span className="font-bold uppercase tracking-wider text-zinc-300 text-[10px]">CRON Schedule</span>
                <span className={`text-[9px] uppercase ${cronStatus === 'healthy' ? 'text-sky-500' : 'text-amber-500'}`}>
                  {cronStatus === 'healthy' ? (lastCronRun ? `Run: ${lastCronRun}` : 'Active') : 'Pending'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors border border-zinc-800/80">
              <SafeIcon icon={null} name="Shield" className={`text-xs ${shieldStatus === 'active' ? 'text-indigo-400' : 'text-amber-400'}`} />
              <div className="flex flex-col flex-1">
                <span className="font-bold uppercase tracking-wider text-zinc-300 text-[10px]">Edge Shield</span>
                <span className={`text-[9px] uppercase ${shieldStatus === 'active' ? 'text-indigo-500' : 'text-amber-500'}`}>
                  {shieldStatus === 'active' ? 'Active' : 'Degraded'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors border border-zinc-800/80">
              <SafeIcon icon={null} name="Activity" className={`text-xs ${onyxStatus === 'healthy' ? 'text-purple-400' : 'text-amber-400'}`} />
              <div className="flex flex-col flex-1">
                <span className="font-bold uppercase tracking-wider text-zinc-300 text-[10px]">Onyx Core</span>
                <span className={`text-[9px] uppercase ${onyxStatus === 'healthy' ? 'text-purple-500' : 'text-amber-500'}`}>
                  {onyxStatus === 'degraded (edge-cached)' ? 'DEGRADED (EDGE-CACHED)' : onyxStatus}
                </span>
              </div>
            </div>

            <button
               onClick={() => { setIsDiagOpen(true); setIsDropdownOpen(false); }}
               className="mt-1 p-2 text-[10px] uppercase font-bold text-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            >
               Open Detailed Diagnostics
            </button>
        </div>
      )}

      <CoreHealthDiagnosticsModal isOpen={isDiagOpen} onClose={() => setIsDiagOpen(false)} />
    </div>
  );
}
