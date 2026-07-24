import React, { useState } from 'react';
import { FiMail, FiSend, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';

export default function DashboardQuickActions() {
  const [isSendingDigest, setIsSendingDigest] = useState(false);

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

      toast.success("Executive Digest emailed to james.ellars@axim.us.com!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } catch (err) {
      toast.error(`Digest Dispatch Error: ${err.message}`);
    } finally {
      setIsSendingDigest(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSendDigest}
        disabled={isSendingDigest}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all disabled:opacity-50"
        title="Email daily executive summary to james.ellars@axim.us.com"
      >
        <FiMail className={isSendingDigest ? 'animate-spin' : ''} />
        <span>{isSendingDigest ? 'Sending...' : 'Email Digest'}</span>
      </button>
    </div>
  );
}
