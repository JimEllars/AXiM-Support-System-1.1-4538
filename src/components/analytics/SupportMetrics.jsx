import React, { useState, useEffect } from 'react';
import { FiTrendingUp, FiCheckCircle, FiClock, FiAlertCircle, FiZap, FiCpu } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function SupportMetrics() {
  const [metrics, setMetrics] = useState({
    totalTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    urgentTickets: 0,
    aiDraftsGenerated: 0,
    aiDraftsAccepted: 0,
    aiAcceptanceRate: 0,
    isLoading: true
  });

  useEffect(() => {
    const fetchSupportAnalytics = async () => {
      try {
        // 1. Query ticket status aggregations
        const { data: tickets, error: ticketErr } = await supabase
          .from('support_tickets')
          .select('id, status, priority');

        if (ticketErr) throw ticketErr;

        // 2. Query total AI drafts generated from telemetry table
        const { count: aiGeneratedCount, error: aiGenErr } = await supabase
          .from('ticket_ai_telemetry')
          .select('id', { count: 'exact', head: true });

        if (aiGenErr) throw aiGenErr;

        // 3. Query total accepted AI drafts from events table
        const { count: aiAcceptedCount, error: aiAccErr } = await supabase
          .from('events_ax2024')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'autodraft_accepted');

        if (aiAccErr) throw aiAccErr;

        const total = tickets?.length || 0;
        const open = tickets?.filter(t => t.status === 'open' || t.status === 'in_progress').length || 0;
        const resolved = tickets?.filter(t => t.status === 'resolved' || t.status === 'closed').length || 0;
        const urgent = tickets?.filter(t => t.priority === 'urgent').length || 0;

        const generated = aiGeneratedCount || 0;
        const accepted = aiAcceptedCount || 0;
        const rate = generated > 0 ? Math.round((accepted / generated) * 100) : 0;

        setMetrics({
          totalTickets: total,
          openTickets: open,
          resolvedTickets: resolved,
          urgentTickets: urgent,
          aiDraftsGenerated: generated,
          aiDraftsAccepted: accepted,
          aiAcceptanceRate: rate,
          isLoading: false
        });
      } catch (err) {
        console.error('Failed to load support metrics telemetry:', err);
        setMetrics(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchSupportAnalytics();
  }, []);

  if (metrics.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 my-4 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-900/60 rounded-2xl border border-zinc-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 my-4">
      {/* Total Tickets Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Total Incidents</span>
          <FiTrendingUp className="text-zinc-500"/>
        </div>
        <p className="text-2xl font-mono font-black text-white">{metrics.totalTickets}</p>
        <span className="text-[10px] font-mono text-zinc-500">{metrics.openTickets} Active Queue</span>
      </div>

      {/* Resolved Tickets Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Resolved</span>
          <FiCheckCircle className="text-emerald-400"/>
        </div>
        <p className="text-2xl font-mono font-black text-emerald-400">{metrics.resolvedTickets}</p>
        <span className="text-[10px] font-mono text-emerald-500/80">Closed Successfully</span>
      </div>

      {/* Urgent SLA Card */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Urgent SLA</span>
          <FiAlertCircle className="text-rose-400"/>
        </div>
        <p className="text-2xl font-mono font-black text-rose-400">{metrics.urgentTickets}</p>
        <span className="text-[10px] font-mono text-rose-500/80">Priority Escalations</span>
      </div>

      {/* AI Copilot Interventions Card */}
      <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 backdrop-blur-md">
        <div className="flex items-center justify-between text-purple-300 text-xs font-mono mb-2">
          <span>AI Copilot Drafts</span>
          <FiZap className="text-purple-400 animate-pulse"/>
        </div>
        <p className="text-2xl font-mono font-black text-purple-300">{metrics.aiDraftsGenerated}</p>
        <span className="text-[10px] font-mono text-purple-400/80">{metrics.aiDraftsAccepted} Accepted by Human</span>
      </div>

      {/* AI Draft Acceptance Rate Card */}
      <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 backdrop-blur-md">
        <div className="flex items-center justify-between text-emerald-300 text-xs font-mono mb-2">
          <span>AI Acceptance Rate</span>
          <FiCpu className="text-emerald-400"/>
        </div>
        <p className="text-2xl font-mono font-black text-emerald-400">{metrics.aiAcceptanceRate}%</p>
        <span className="text-[10px] font-mono text-emerald-500/80">Draft Accuracy Index</span>
      </div>
    </div>
  );
}
