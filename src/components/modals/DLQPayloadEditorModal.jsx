import React, { useState, useEffect } from 'react';
import { FiX, FiRefreshCw, FiTrash2, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import { onyxService } from '../../services/onyxService';

export default function DLQPayloadEditorModal({isOpen, onClose, event, onRefresh }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const [payloadText, setPayloadText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    if (isOpen && event) {
      setPayloadText(JSON.stringify(event.payload || {}, null, 2));
    }
  }, [isOpen, event]);

  if (!isOpen || !event) return null;

  const handleForceRetry = async () => {
    setIsSubmitting(true);
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (e) {
        throw new Error('Invalid JSON format. Please check syntax.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await onyxService.fetchWithTimeout(
        `${workerUrl}/api/v1/admin/dlq/force-retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ event_id: event.id, updated_payload: parsedPayload })
        }
      );

      if (!res.success || !res.data?.success) {
        throw new Error(res.error || res.data?.error || 'Force retry failed.');
      }

      toast.success('Payload forced retried successfully!', {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      toast.error(`Retry Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurge = async () => {
    setIsPurging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await onyxService.fetchWithTimeout(
        `${workerUrl}/api/v1/admin/dlq/purge?event_id=${event.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!res.success || !res.data?.success) {
        throw new Error(res.error || res.data?.error || 'Purge failed.');
      }

      toast.success('Payload purged successfully!', {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      toast.error(`Purge Error: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-900 bg-zinc-900/50">
          <div className="flex items-center gap-2 text-rose-400">
            <FiAlertCircle />
            <h2 className="text-sm font-bold uppercase tracking-wider">Inspect & Edit Payload (ID: {event.id.slice(0, 8)})</h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors">
            <FiX />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto min-h-[300px]">
          <p className="text-xs text-zinc-500 mb-2">Edit the JSON payload below before retrying.</p>
          <textarea
            className="w-full h-full min-h-[300px] bg-black text-emerald-400 font-mono text-xs p-4 rounded border border-zinc-800 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all resize-y whitespace-pre"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            spellCheck="false"
          />
        </div>

        <div className="flex items-center justify-between p-4 border-t border-zinc-900 bg-zinc-900/50">
          <button
            onClick={handlePurge}
            disabled={isPurging || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50"
          >
            {isPurging ? <FiRefreshCw className="animate-spin" /> : <FiTrash2 />}
            <span>Discard / Purge</span>
          </button>

          <button
            onClick={handleForceRetry}
            disabled={isSubmitting || isPurging}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isSubmitting ? <FiRefreshCw className="animate-spin" /> : <FiRefreshCw />}
            <span>Force Retry</span>
          </button>
        </div>
      </div>
    </div>
  );
}
