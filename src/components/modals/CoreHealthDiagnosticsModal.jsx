import React, { useState, useEffect } from 'react';
import { FiActivity, FiClock, FiShield, FiX, FiRefreshCw, FiSend, FiZap, FiPlay } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function CoreHealthDiagnosticsModal({ isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/health/diagnostics`);
      if (res.ok) {
        const json = await res.json();
        setData(json.diagnostics || null);
        setIsCached(!!json.cached);
      }
    } catch (err) {
      console.error("Failed to load health diagnostics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchDiagnostics();
  }, [isOpen]);

  const handleTriggerFullSweep = async () => {
    if (isSweeping) return;
    setIsSweeping(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active operator session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/cron/trigger-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'CRON sweep failed.');

      toast.success(`Full CRON sweep triggered! Executed ${json.executed_sweeps || 7} background automations.`, {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDiagnostics();
    } catch (err) {
      toast.error(`Sweep Error: ${err.message}`);
    } finally {
      setIsSweeping(false);
    }
  };

  const handleTestBriefing = async () => {
    if (isTesting) return;
    setIsTesting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/health/test-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Pipeline test failed.');

      toast.success("Diagnostic test email sent to james.ellars@axim.us.com!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDiagnostics();
    } catch (err) {
      toast.error(`Test Dispatch Error: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2 font-bold text-indigo-400 uppercase tracking-wider">
            <FiActivity className="text-sm animate-pulse"/>
            <span>Cloudflare Edge Core Diagnostics</span>
          </div>

          <div className="flex items-center gap-2">
            {isCached && (
              <span className="text-[9px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase flex items-center gap-1">
                <FiZap className="text-[9px]"/> KV Cached (30s)
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors">
              <FiX/>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-zinc-500 flex items-center justify-center gap-2">
            <FiRefreshCw className="animate-spin text-sm"/>
            <span>Polling edge worker diagnostic telemetry...</span>
          </div>
        ) : data ? (
          <div className="space-y-3">
            {/* Edge Worker Grid */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400"><FiActivity/> Edge Worker Engine</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">{data.edge_worker?.status}</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">Runtime: {data.edge_worker?.runtime}</div>
            </div>

            {/* CRON Schedule Grid & Manual Sweep Trigger */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-sky-400"><FiClock/> Autonomous CRON Sweeps</span>
                <button
                  onClick={handleTriggerFullSweep}
                  disabled={isSweeping}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase text-sky-300 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-all disabled:opacity-50"
                  title="Run all background CRON sweeps concurrently on demand"
                >
                  <FiPlay className={isSweeping ? 'animate-spin' : ''} />
                  <span>{isSweeping ? 'Sweeping...' : 'Trigger Full Sweep'}</span>
                </button>
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                Schedule: <code>{data.cron_schedule?.schedule}</code> | Last Run: {data.cron_schedule?.last_executed ? new Date(data.cron_schedule.last_executed).toLocaleString() : 'Pending'}
              </div>
            </div>

            {/* Security Shield Grid */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-indigo-400"><FiShield/> Edge Security Shield</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 uppercase">Active Guard</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                HMAC Verification: <strong className="text-zinc-300">{data.edge_shield?.hmac_verification}</strong> | Rate Limit: <strong className="text-zinc-300">{data.edge_shield?.rate_limit_cap}</strong> | 24h Blocks: <strong className="text-rose-400">{data.edge_shield?.rate_limit_blocks_24h}</strong>
              </div>
            </div>

            {/* 24h Activity Summary & Test Dispatch Action */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between text-[11px]">
              <div className="space-y-0.5">
                <div className="text-zinc-400 font-bold">24h Briefings: <strong className="text-sky-300">{data.telemetry_summary_24h?.executive_briefings_exported}</strong></div>
                <div className="text-zinc-400 font-bold">24h Stale Reminders: <strong className="text-amber-300">{data.telemetry_summary_24h?.stale_hitl_reminders_sent}</strong></div>
              </div>

              <button
                onClick={handleTestBriefing}
                disabled={isTesting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 font-bold uppercase transition-all disabled:opacity-50"
                title="Send test briefing email to Mr. Ellars to verify transport health"
              >
                <FiSend className={isTesting ? 'animate-spin' : ''} />
                <span>{isTesting ? 'Testing...' : 'Trigger Test Briefing'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-zinc-600">Failed to load diagnostic telemetry data.</div>
        )}
      </div>
    </div>
  );
}
