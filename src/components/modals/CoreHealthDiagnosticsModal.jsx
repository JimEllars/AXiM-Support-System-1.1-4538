import React, { useState, useEffect } from 'react';
import { FiActivity, FiX, FiRefreshCw, FiClock, FiShield, FiTrash2, FiDatabase, FiDownload, FiHardDrive, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function CoreHealthDiagnosticsModal({ isOpen, onClose }) {
  const [edgeHealth, setEdgeHealth] = useState(null);
  const [cronHealth, setCronHealth] = useState(null);
  const [secHealth, setSecHealth] = useState(null);
  const [archiveHealth, setArchiveHealth] = useState(null);
  const [archiveFiles, setArchiveFiles] = useState([]);
  const [telemetryStats, setTelemetryStats] = useState(null);
  const [lastKvPurge, setLastKvPurge] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const workerUrl = getEdgeWorkerUrl();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const [edgeRes, cronRes, secRes, archiveRes, filesRes, telemetryRes] = await Promise.all([
        fetch(`${workerUrl}/health`),
        fetch(`${workerUrl}/api/v1/health/cron`),
        fetch(`${workerUrl}/api/v1/health/security`),
        fetch(`${workerUrl}/api/v1/health/archive`),
        fetch(`${workerUrl}/api/v1/telemetry/health`),
        fetch(`${workerUrl}/api/v1/admin/archives`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (edgeRes.ok) setEdgeHealth(await edgeRes.json());
      if (cronRes.ok) setCronHealth(await cronRes.json());
      if (secRes.ok) setSecHealth(await secRes.json());
      if (archiveRes.ok) setArchiveHealth(await archiveRes.json());
      if (telemetryRes && telemetryRes.ok) setTelemetryStats(await telemetryRes.json());
      if (filesRes.ok) {
        const fileData = await filesRes.json();
        setArchiveFiles(fileData.archives || []);
      }

      const { data: purgeEvent } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', 'kv_cache_purged_by_admin')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (purgeEvent) {
        setLastKvPurge({
          time: new Date(purgeEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          operator: purgeEvent.payload?.operator || 'Administrator'
        });
      } else {
        setLastKvPurge(null);
      }
    } catch (err) {
      console.error("Failed to load core health diagnostics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchDiagnostics();
  }, [isOpen]);

  const handlePurgeKv = async () => {
    if (isPurging) return;
    setIsPurging(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Operator session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/admin/kv-purge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "KV purge failed.");

      toast.success(`Cloudflare KV Cache Purged! (${data.purged_keys?.length || 0} keys cleared)`, {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDiagnostics();
    } catch (err) {
      toast.error(`Purge Error: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const handleDownloadReport = async (fileKey = null) => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Operator session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const endpoint = fileKey
        ? `${workerUrl}/api/v1/admin/archives/download?file=${fileKey}`
        : `${workerUrl}/api/v1/health/system-report`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to fetch payload.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileKey || `axim-system-report-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Payload successfully downloaded.");
    } catch (err) {
      toast.error(`Download Error: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-2xl rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <FiActivity className="text-base animate-pulse"/>
            <span className="uppercase tracking-wider">Edge Health & Archival Diagnostics</span>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><FiX/></button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-zinc-500 flex items-center justify-center gap-2">
            <FiRefreshCw className="animate-spin text-sm"/>
            <span>Querying Cloudflare Edge Telemetry & R2 Buckets...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiActivity className="text-emerald-400"/> Edge Pipeline</span>
                <span className="text-emerald-400 uppercase font-mono text-[10px]">{edgeHealth?.status || 'Active'}</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono mt-1">Service: <code>{edgeHealth?.service || 'onyx-worker'}</code></p>
              {telemetryStats && (
                <div className="flex gap-2 text-[9px] font-mono mt-1">
                  {telemetryStats.EDGE_HEARTBEAT_INTERCEPTS > 0 && (
                    <span className="text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">Sessions: EDGE-CACHED ({telemetryStats.EDGE_HEARTBEAT_INTERCEPTS})</span>
                  )}
                  {telemetryStats.D1_TIMEOUT_COUNT > 0 && (
                    <span className="text-rose-400 bg-rose-500/10 px-1 rounded border border-rose-500/20">DB: DEGRADED ({telemetryStats.D1_TIMEOUT_COUNT})</span>
                  )}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiClock className="text-sky-400"/> Daily CRON</span>
                <span className="text-sky-400 uppercase font-mono text-[10px]">{cronHealth?.status || 'Healthy'}</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono mt-1">Last Run: <code>{cronHealth?.last_cron_run ? cronHealth.last_cron_run.split('T')[1].slice(0,5) : 'Pending'}</code></p>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1 md:col-span-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiHardDrive className="text-fuchsia-400"/> R2 Cold-Storage Archive</span>
                <span className="text-fuchsia-400 uppercase font-mono text-[10px]">{archiveHealth?.status || 'Active'}</span>
              </div>
              <div className="flex items-center justify-between mt-2 mb-2">
                <p className="text-[10px] text-zinc-400 font-mono">Telemetry Batch Objects: <code className="text-fuchsia-300">{archiveHealth?.archive_objects || 0}</code></p>
              </div>

              {/* R2 Archive File List */}
              {archiveFiles.length > 0 && (
                <div className="mt-3 space-y-1.5 pt-2 border-t border-zinc-800/50">
                  {archiveFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-zinc-900">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                        <FiFileText className="text-zinc-500"/>
                        <span className="truncate max-w-[250px]">{file.key}</span>
                      </div>
                      <button
                        onClick={() => handleDownloadReport(file.key)}
                        disabled={isDownloading}
                        className="px-2 py-1 rounded bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20 transition text-[9px] font-bold uppercase disabled:opacity-50"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-2 md:col-span-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiShield className="text-indigo-400"/> Edge Security Shield</span>
                <span className="text-indigo-400 uppercase font-mono text-[10px]">{secHealth?.status || 'Shield Active'}</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono mt-1">Rate Limiting: <code>{secHealth?.rate_limiting || '30 req/min'}</code> | HMAC: <code>{secHealth?.hmac_verification || 'Enforced'}</code></p>

              {lastKvPurge && (
                <div className="pt-2 mt-2 border-t border-zinc-900/80 flex items-center justify-between text-[10px] font-mono text-amber-300">
                  <span className="flex items-center gap-1"><FiDatabase className="text-amber-400"/> Last KV Purge:</span>
                  <span>{lastKvPurge.time} ({lastKvPurge.operator})</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-900">
          <div className="flex gap-2">
            <button
              onClick={fetchDiagnostics}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] font-mono font-bold uppercase transition-all"
            >
              Refresh
            </button>
            <button
              onClick={() => handleDownloadReport(null)}
              disabled={isDownloading || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 text-[10px] font-mono font-bold uppercase transition-all disabled:opacity-50"
              title="Download Unified JSON Telemetry Report"
            >
              <FiDownload/>
              <span>Live Report</span>
            </button>
          </div>

          <button
            onClick={handlePurgeKv}
            disabled={isPurging}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-mono font-bold uppercase transition-all disabled:opacity-50"
            title="Clear rate-limiting IP counters and policy summary KV cache"
          >
            <FiTrash2 className={isPurging ? 'animate-spin' : ''}/>
            <span>{isPurging ? 'Purging...' : 'Flush KV'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
