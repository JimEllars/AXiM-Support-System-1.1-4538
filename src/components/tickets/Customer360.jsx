import React, { useState, useEffect } from 'react';
import { FiUser, FiBriefcase, FiDollarSign, FiAlertCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Customer360({ customerId }) {
  const [profile, setProfile] = useState(null);
  const [otherTickets, setOtherTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchContext = async () => {
      setIsLoading(true);
      try {
        // Fetch CRM Profile
        const { data: crmData } = await supabase.from('contacts_ax2024').select('*').eq('email', customerId).single();
        if (crmData) setProfile(crmData);

        // CRITICAL FIX: Fetch other active tickets to prevent duplicate triage
        const { data: ticketData } = await supabase
          .from('support_tickets')
          .select('id, subject, status, created_at')
          .eq('customer_id', customerId)
          .neq('status', 'resolved')
          .neq('status', 'closed')
          .order('created_at', { ascending: false })
          .limit(3);
        if (ticketData) setOtherTickets(ticketData);

      } catch (err) {
        console.error('Failed to load 360 context:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (customerId) fetchContext();
  }, [customerId]);

  if (isLoading) {
    return <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 animate-pulse h-32" />;
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">
        <FiUser className="text-cyan-500" /> Customer 360
        {customerId && <span className="text-[10px] text-zinc-600 ml-auto">{customerId}</span>}
      </div>

      {profile ? (
        <div className="space-y-3 mb-6">
          {profile.first_name && (
            <div className="flex justify-between items-center text-xs border-b border-zinc-800/30 pb-2">
              <span className="text-zinc-500 font-mono">Name</span>
              <span className="text-zinc-200 font-bold">{profile.first_name} {profile.last_name}</span>
            </div>
          )}
          {profile.company && (
            <div className="flex justify-between items-center text-xs border-b border-zinc-800/30 pb-2">
              <span className="text-zinc-500 font-mono">Company</span>
              <span className="text-indigo-300 font-bold flex items-center gap-1.5"><FiBriefcase/> {profile.company}</span>
            </div>
          )}
          {profile.lifetime_value > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-mono">LTV</span>
              <span className="text-emerald-400 font-black flex items-center gap-1"><FiDollarSign/> {profile.lifetime_value.toLocaleString()}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 italic mb-6">No extended CRM profile found.</p>
      )}

      {/* Cross-Ticket Context Block */}
      {otherTickets.length > 1 && (
        <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-rose-400 uppercase tracking-widest font-black mb-2">
            <FiAlertCircle /> Other Active Tickets ({otherTickets.length - 1})
          </div>
          <div className="space-y-2">
            {otherTickets.map(t => (
              <div
                key={t.id}
                onClick={() => navigate(`/ticket/${t.id}`)}
                className="text-xs text-zinc-300 hover:text-rose-300 cursor-pointer truncate transition-colors bg-black/40 px-2 py-1.5 rounded"
              >
                {t.subject}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
