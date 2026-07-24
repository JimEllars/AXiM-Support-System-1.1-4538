import React, { useEffect, useState } from 'react';
import { FiInbox, FiAlertCircle, FiCheckCircle, FiMail } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    openCount: 0,
    urgentCount: 0,
    resolved24h: 0,
    emailsSent24h: 0
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { count: open } = await supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open');

        const { count: urgent } = await supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'urgent');

        const { count: resolved } = await supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .gte('updated_at', past24h)
          .in('status', ['resolved', 'closed']);

        const { count: emails } = await supabase
          .from('events_ax2024')
          .select('id', { count: 'exact', head: true })
          .gte('timestamp', past24h)
          .eq('type', 'email_dispatched');

        setMetrics({
          openCount: open || 0,
          urgentCount: urgent || 0,
          resolved24h: resolved || 0,
          emailsSent24h: emails || 0
        });
      } catch (err) {
        console.error('Failed to load support metrics:', err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
      {/* Active Queue Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Active Queue</span>
          <div className="text-xl font-bold text-white mt-1">{metrics.openCount}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
          <FiInbox className="text-base"/>
        </div>
      </div>

      {/* Urgent SLA Alerts Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Urgent SLAs</span>
          <div className="text-xl font-bold text-rose-400 mt-1">{metrics.urgentCount}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <FiAlertCircle className="text-base animate-pulse"/>
        </div>
      </div>

      {/* 24h Resolved Velocity Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Resolved (24h)</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">{metrics.resolved24h}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <FiCheckCircle className="text-base"/>
        </div>
      </div>

      {/* Outbound Email Dispatch Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Outbound Emails</span>
          <div className="text-xl font-bold text-indigo-400 mt-1">{metrics.emailsSent24h}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <FiMail className="text-base"/>
        </div>
      </div>
    </div>
  );
}
