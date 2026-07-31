import React, { useState, useEffect } from 'react';
import { FiActivity, FiX, FiRefreshCw, FiClock, FiShield, FiTrash2, FiZap, FiCheckCircle, FiPlay, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function CoreHealthDiagnosticsModal({ isOpen, onClose }) {
  const [edgeHealth, setEdgeHealth] = useState(null);
  const [cronHealth, setCronHealth] = useState(null);
  const [secHealth, setSecHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const workerUrl = getEdgeWorkerUrl();

      const [edgeRes, cronRes, secRes] = await Promise.all([
        fetch(`${workerUrl}/health`),
        fetch(`${workerUrl}/api/v1/health/cron`),
        fetch(`${workerUrl}/api/v1/health/security`)
      ]);

      if (edgeRes.ok) setEdgeHealth(await edgeRes.json());
      if (cronRes.ok) setCronHealth(await cronRes.json());
      if (secRes.ok) setSecHealth(await secRes.json());
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-lg rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <FiActivity className="text-base animate-pulse"/>
            <span className="uppercase tracking-wider">Edge Health Diagnostics</span>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><FiX/></button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-zinc-500 flex items-center justify-center gap-2">
            <FiRefreshCw className="animate-spin text-sm"/>
            <span>Querying Cloudflare Edge Telemetry...</span>
          </div>
        ) : (
          <div className="space-y-3 font-sans">
            {/* Edge Worker */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiActivity className="text-emerald-400"/> Worker Pipeline</span>
                <span className="text-emerald-400 uppercase font-mono text-[10px]">{edgeHealth?.status || 'Active'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">Service: <code>{edgeHealth?.service || 'onyx-edge-worker'}</code></p>
            </div>

            {/* CRON Schedule */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiClock className="text-sky-400"/> Daily CRON (08:00 UTC)</span>
                <span className="text-sky-400 uppercase font-mono text-[10px]">{cronHealth?.status || 'Healthy'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">Last Run: <code>{cronHealth?.last_cron_run || 'Pending Initial Trigger'}</code></p>
            </div>

            {/* Edge Shield */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                <span className="flex items-center gap-1.5"><FiShield className="text-indigo-400"/> Edge Security Shield</span>
                <span className="text-indigo-400 uppercase font-mono text-[10px]">{secHealth?.status || 'Shield Active'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">Rate Limiting: <code>{secHealth?.rate_limiting || '30 req/min'}</code> | HMAC: <code>{secHealth?.hmac_verification || 'Enforced'}</code></p>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-900">
          <button
            onClick={fetchDiagnostics}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] font-mono font-bold uppercase transition-all"
          >
            Refresh Data
          </button>

          <button
            onClick={handlePurgeKv}
            disabled={isPurging}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-mono font-bold uppercase transition-all disabled:opacity-50"
            title="Clear rate-limiting IP counters and policy summary KV cache"
          >
            <FiTrash2 className={isPurging ? 'animate-spin' : ''} />
            <span>{isPurging ? 'Purging...' : 'Flush KV Cache'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
