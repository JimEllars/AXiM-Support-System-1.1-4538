import React, { useState, useEffect } from 'react';
import { FiMail, FiUserCheck, FiSliders, FiX, FiCheck, FiCpu } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';
import ExecutiveDirectiveHistoryModal from './modals/ExecutiveDirectiveHistoryModal';

export default function DashboardQuickActions() {
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);
  const [cronEngine, setCronEngine] = useState({ status: 'active', daily_sweeps: 9, last_kb_curation: null });
  const [prefs, setPrefs] = useState({ instant_receipts: true, urgent_alerts: true, daily_digest: true, autoresolve_days: 7, auto_purge_kv: true });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const fetchCronStatus = async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/health/cron-status`);
      if (res.ok) {
        const json = await res.json();
        if (json.automation_engine) setCronEngine(json.automation_engine);
      }
    } catch (err) {
      console.error("Failed to load CRON status:", err);
    }
  };

  useEffect(() => {
    fetchCronStatus();
  }, []);

  const fetchPrefs = async () => {
    try {
      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/email/preferences`);
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) setPrefs({ auto_purge_kv: true, ...data.preferences });
      }
    } catch (err) {
      console.error("Failed to load email preferences:", err);
    }
  };

  useEffect(() => {
    if (isPrefsOpen) fetchPrefs();
  }, [isPrefsOpen]);

  const handleSavePrefs = async () => {
    setIsSavingPrefs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/email/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(prefs)
      });

      if (!res.ok) throw new Error("Failed to save automation preferences.");

      toast.success("Notification & automation preferences updated!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      setIsPrefsOpen(false);
    } catch (err) {
      toast.error(`Preference Error: ${err.message}`);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleSendDigest = async () => {
    if (isSendingDigest) return;
    setIsSendingDigest(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active session required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/email/digest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send executive digest.');

      toast.success("Executive Briefing emailed to james.ellars@axim.us.com!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } catch (err) {
      toast.error(`Digest Dispatch Error: ${err.message}`);
    } finally {
      setIsSendingDigest(false);
    }
  };

  return (
    <div className="flex items-center gap-2 font-mono">
      {/* Live Autonomous Engine Badge */}
      <div
        className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
        title={`Automated CRON Engine active with 9 daily background sweeps. Last KB Curation: ${cronEngine.last_kb_curation ? new Date(cronEngine.last_kb_curation).toLocaleTimeString() : 'Active'}`}
      >
        <FiCpu className="text-xs animate-pulse"/>
        <span>Autonomous Engine (9 Sweeps)</span>
      </div>

      <button
        onClick={() => setIsPrefsOpen(true)}
        className="p-1.5 rounded-xl text-zinc-400 bg-zinc-900 border border-zinc-800 hover:text-white transition-all"
        title="Configure notification and automation preferences"
      >
        <FiSliders className="text-xs"/>
      </button>

      <button
        onClick={() => setIsHistoryOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
        title="View executive directive audit history"
      >
        <FiUserCheck/>
        <span>Exec History</span>
      </button>

      <button
        onClick={handleSendDigest}
        disabled={isSendingDigest}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all disabled:opacity-50"
        title="Email daily executive summary to james.ellars@axim.us.com"
      >
        <FiMail className={isSendingDigest ? 'animate-spin' : ''}/>
        <span>{isSendingDigest ? 'Sending...' : 'Email Briefing'}</span>
      </button>

      <ExecutiveDirectiveHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      {/* Preferences & Automation Modal */}
      {isPrefsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 text-xs font-mono">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2 font-bold text-indigo-400 uppercase tracking-wider">
                <FiSliders/>
                <span>Automation & Notification Settings</span>
              </div>
              <button onClick={() => setIsPrefsOpen(false)} className="p-1 text-zinc-500 hover:text-white"><FiX/></button>
            </div>

            <div className="space-y-3 font-sans">
              <label className="flex items-center justify-between p-3 rounded-xl bg-black/50 border border-zinc-800 cursor-pointer">
                <div>
                  <div className="font-bold text-zinc-200">Instant Receipt Emails</div>
                  <div className="text-[10px] text-zinc-500">Confirmations sent to Mr. Ellars upon response ingestion</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.instant_receipts}
                  onChange={(e) => setPrefs({ ...prefs, instant_receipts: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-black/50 border border-zinc-800 cursor-pointer">
                <div>
                  <div className="font-bold text-zinc-200">Urgent SLA Alerts</div>
                  <div className="text-[10px] text-zinc-500">Immediate dispatches for critical anomaly tickets</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.urgent_alerts}
                  onChange={(e) => setPrefs({ ...prefs, urgent_alerts: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-black/50 border border-zinc-800 cursor-pointer">
                <div>
                  <div className="font-bold text-zinc-200">Automated KV Maintenance</div>
                  <div className="text-[10px] text-zinc-500">Clear rate limit keys & caches every 24h via CRON</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.auto_purge_kv}
                  onChange={(e) => setPrefs({ ...prefs, auto_purge_kv: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                />
              </label>

              {/* Inactivity Threshold Select */}
              <div className="p-3 rounded-xl bg-black/50 border border-zinc-800 space-y-1.5">
                <div className="font-bold text-zinc-200">Inactivity Auto-Resolution Window</div>
                <div className="text-[10px] text-zinc-500 mb-1">Threshold for automatically closing pending inactive tickets</div>
                <select
                  value={prefs.autoresolve_days}
                  onChange={(e) => setPrefs({ ...prefs, autoresolve_days: parseInt(e.target.value, 10) })}
                  className="w-full p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value={3}>3 Days of Inactivity</option>
                  <option value={7}>7 Days of Inactivity (Default)</option>
                  <option value={14}>14 Days of Inactivity</option>
                  <option value={0}>Disabled (Manual Resolution Only)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSavePrefs}
              disabled={isSavingPrefs}
              className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-mono font-bold uppercase transition-all flex items-center justify-center gap-1.5"
            >
              <FiCheck/>
              <span>{isSavingPrefs ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
