import React, { useState, useEffect } from 'react';
import { FiAward, FiStar, FiRefreshCw, FiMail } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuthStore } from '../../store/useAuthStore';
import toast from 'react-hot-toast';

export default function OperatorLeaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const { user } = useAuthStore();
  const [canDispatch, setCanDispatch] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      if (user) {
        const { data } = await supabase.from('team_profiles').select('role').eq('id', user.id).single();
        if (data && (data.role === 'admin' || data.role === 'lead')) {
          setCanDispatch(true);
        }
      }
    };
    checkRole();
  }, [user]);

  const handleManualDispatch = async () => {
    setIsDispatching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const apiUrl = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:54321/functions/v1/onyx-bridge';
      const res = await fetch(`${apiUrl}/api/v1/analytics/leaderboard/dispatch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await res.json();
      if (res.ok) {
        if (toast && toast.success) {
          toast.success("Leaderboard email dispatched successfully");
        } else {
          // Fallback if toast isn't available
          console.log("Leaderboard email dispatched successfully");
        }
      } else {
        if (toast && toast.error) {
          toast.error(result.error || "Failed to dispatch email");
        }
      }
    } catch (err) {
      console.error('Failed to dispatch leaderboard email:', err);
      if (toast && toast.error) toast.error("Failed to dispatch email");
    } finally {
      setIsDispatching(false);
    }
  };

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const apiUrl = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:54321/functions/v1/onyx-bridge';
        const res = await fetch(`\${apiUrl}/api/v1/analytics/leaderboard`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer \${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard || []);
        }
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 backdrop-blur-md overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/30">
        <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase flex items-center gap-2">
          <FiAward className="text-indigo-400 text-sm" /> Operator Leaderboard
        </h3>
        <div className="flex items-center gap-2">
          {canDispatch && (
            <button
              onClick={handleManualDispatch}
              disabled={isDispatching}
              title="Email Summary"
              className="text-zinc-400 hover:text-indigo-400 disabled:opacity-50 transition-colors p-1"
            >
              <FiMail className={isDispatching ? 'animate-pulse' : ''} />
            </button>
          )}
          <span className="text-[10px] text-zinc-500 uppercase">30-Day Metrics</span>
        </div>
      </div>

      <div className="p-2 space-y-1 overflow-y-auto flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-zinc-500 font-mono animate-pulse">Loading scores...</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500 font-mono">No recent contributions</div>
        ) : (
          leaderboard.map((op, idx) => (
            <div key={op.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-800/40 transition-colors border border-transparent hover:border-zinc-800/50">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold \${idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : idx === 1 ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-400/30' : idx === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/30' : 'bg-zinc-800 text-zinc-500'}`}>
                  {idx + 1}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-medium text-zinc-200 truncate">{op.email.split('@')[0]}</span>
                  {op.avg_csat > 0 && (
                     <div className="flex items-center gap-0.5 ml-2" title={`Average CSAT: ${op.avg_csat.toFixed(1)}`}>
                       {[...Array(5)].map((_, i) => (
                         <FiStar key={i} className={`w-2 h-2 ${i < Math.round(op.avg_csat) ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}`} />
                       ))}
                     </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                      <FiStar className="text-sky-400" /> {op.contributions}
                    </span>
                    <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                      <FiRefreshCw className="text-emerald-400" /> {op.renewals}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-sm font-mono font-bold text-indigo-300 tabular-nums">
                {op.score}<span className="text-[9px] text-zinc-600 ml-0.5">pts</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
