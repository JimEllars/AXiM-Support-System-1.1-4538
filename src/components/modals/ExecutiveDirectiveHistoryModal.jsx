import React, { useState, useEffect } from 'react';
import { FiUserCheck, FiX, FiCheckCircle, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';

export default function ExecutiveDirectiveHistoryModal({isOpen, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const [directives, setDirectives] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'approved' | 'rejected'

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('hitl_audit_logs')
        .select('*')
        .not('metadata->executive_responder', 'is', null)
        .order('updated_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;
      setDirectives(data || []);
    } catch (err) {
      console.error('Failed to load executive directive history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 font-mono">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <FiUserCheck className="text-base"/>
            <span className="uppercase tracking-wider">Executive Directives Audit Log</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
          >
            <FiX/>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg border transition-all ${filter === 'all' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded-lg border transition-all ${filter === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded-lg border transition-all ${filter === 'rejected' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}
          >
            Rejected
          </button>
          </div>
          <button
            onClick={async () => {
              try {
                const session = await supabase.auth.getSession();
                const token = session.data?.session?.access_token;
                if (!token) throw new Error("No session token");
                const res = await fetch("http://localhost:8787/api/v1/executive/remind-stale", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                  }
                });
                if (!res.ok) throw new Error("Failed to nudge exec");
                alert("Nudge triggered successfully.");
              } catch (err) {
                console.error(err);
                alert("Failed to nudge exec.");
              }
            }}
            className="px-3 py-1 rounded-lg border transition-all bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 text-xs flex items-center gap-2"
          >
            <FiRefreshCw className="text-[10px]" />
            Nudge Exec
          </button>
        </div>

        {/* Audit List */}
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-center py-8 text-zinc-500 flex items-center justify-center gap-2">
              <FiRefreshCw className="animate-spin text-sm"/>
              <span>Loading executive directives...</span>
            </div>
          ) : directives.length > 0 ? (
            directives.map((item) => (
              <div key={item.id} className="p-3.5 rounded-2xl bg-black/50 border border-zinc-800/80 flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.tool_type}</span>
                    <span className="text-[10px] text-zinc-500">Ticket #{item.support_ticket_id?.slice(0, 8) || 'N/A'}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Responder: <span className="text-amber-400/90">{item.metadata?.executive_responder || 'james.ellars@axim.us.com'}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 ${
                    item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {item.status === 'approved' ? <FiCheckCircle/> : <FiXCircle/>}
                    {item.status}
                  </span>
                  <span className="text-[9px] text-zinc-600">
                    {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-zinc-600">
              No executive directives recorded matching this filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
