import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { FiUser, FiClock } from 'react-icons/fi';

export default function Customer360({ customerId }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!customerId) return;
    const fetchHistory = async () => {
      const { data } = await supabase
        .from('support_tickets')
        .select('id, subject, status, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(4);
      if (data) setHistory(data);
    };
    fetchHistory();
  }, [customerId]);

  if (!history.length) return null;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">
        <FiUser className="text-cyan-500" /> Customer 360 History
      </div>
      <div className="space-y-3">
        {history.map(t => (
          <div key={t.id} className="p-3 bg-black/40 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition-colors cursor-default">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-bold text-zinc-300 truncate pr-2" title={t.subject}>{t.subject}</span>
              <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${t.status === 'resolved' || t.status === 'closed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                {t.status}
              </span>
            </div>
            <div className="text-[10px] text-zinc-600 font-mono flex items-center gap-1">
              <FiClock /> {new Date(t.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
