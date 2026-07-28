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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const checkHealth = async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();

      // Get all telemetry metrics at once
      const diagData = await onyxService.getDiagnostics();

      if (diagData && diagData.success && diagData.diagnostics) {
         setEdgeStatus(diagData.diagnostics.edge_worker?.status || 'degraded');

         const cronData = diagData.diagnostics.cron_schedule;
         setCronStatus(cronData?.status || 'degraded');
         if (cronData?.last_executed) {
            setLastCronRun(new Date(cronData.last_executed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
         }

         const shield = diagData.diagnostics.edge_shield;
         if (shield && shield.hmac_verification === "enforced") {
             setShieldStatus('active');
         } else {
             setShieldStatus('degraded');
         }
      } else {
          // Fallback legacy checks
          const edgeRes = await fetch(`${workerUrl}/health`);
          setEdgeStatus(edgeRes.ok ? 'healthy' : 'degraded');

          const cronRes = await fetch(`${workerUrl}/api/v1/health/cron`);
          if (cronRes.ok) {
            const cronData = await cronRes.json();
            setCronStatus(cronData.status || 'healthy');
            if (cronData.last_cron_run) {
              setLastCronRun(new Date(cronData.last_cron_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
          }

          const secRes = await fetch(`${workerUrl}/api/v1/health/security`);
          if (secRes.ok) {
            const secData = await secRes.json();
            setShieldStatus(secData.status === 'shield_active' ? 'active' : 'degraded');
          }
      }

    } catch (err) {
      setEdgeStatus('degraded');
      setCronStatus('degraded');
      setShieldStatus('degraded');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 45000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 font-mono text-[10px]">
        {/* Edge Worker Health Indicator */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-all cursor-pointer"
          title="Click to view detailed edge health diagnostics"
        >
          <FiActivity className={`text-xs ${edgeStatus === 'healthy' ? 'text-emerald-400' : 'text-rose-400 animate-pulse'}`} />
          <span className="font-bold uppercase tracking-wider">Edge Worker</span>
          <span className={`px-1 rounded text-[9px] uppercase ${edgeStatus === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {edgeStatus}
          </span>
        </button>

        {/* Cloudflare CRON Schedule Pulse Indicator */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-all cursor-pointer"
          title="Click to view detailed edge health diagnostics"
        >
          <FiClock className={`text-xs ${cronStatus === 'healthy' ? 'text-sky-400' : 'text-amber-400'}`} />
          <span className="font-bold uppercase tracking-wider">CRON 08:00 UTC</span>
          <span className={`px-1 rounded text-[9px] uppercase ${cronStatus === 'healthy' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {cronStatus === 'healthy' ? (lastCronRun ? `Run: ${lastCronRun}` : 'Active') : 'Pending'}
          </span>
        </button>

        {/* Edge Shield Rate-Limiting & HMAC Guard Indicator */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-all cursor-pointer"
          title="Click to view detailed edge health diagnostics"
        >
          <FiShield className={`text-xs ${shieldStatus === 'active' ? 'text-indigo-400' : 'text-amber-400'}`} />
          <span className="font-bold uppercase tracking-wider">Edge Shield</span>
          <span className={`px-1 rounded text-[9px] uppercase ${shieldStatus === 'active' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {shieldStatus}
          </span>
        </button>
      </div>

      <CoreHealthDiagnosticsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
