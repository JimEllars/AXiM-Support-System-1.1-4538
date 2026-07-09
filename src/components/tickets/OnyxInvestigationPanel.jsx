import React, { useState, useRef, useEffect } from 'react';
import { FiCpu, FiTerminal, FiPlay, FiPaperclip, FiCheck } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';

export default function OnyxInvestigationPanel({ ticketId, subject, description }) {
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const readerRef = useRef(null);

  const startInvestigation = async () => {
    if (hasStarted) return;
    setHasStarted(true);
    setIsStreaming(true);
    const startTime = performance.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Active session identification missing');

      const workerUrl = getEdgeWorkerUrl();

      const res = await fetch(`${workerUrl}/api/v1/onyx-bridge/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ subject, description })
      });

      if (!res.ok) throw new Error('Gateway rejected proxy stream frame.');

      readerRef.current = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await readerRef.current.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.replace('data: ', ''));
              const content = parsed.choices?.[0]?.delta?.content || parsed.content?.[0]?.text || '';
              if (content) {
                setStreamText(prev => prev + content);
              }
            } catch (e) { /* skip partial chunk fragments */ }
          }
        }
      }

      // Record performance latency metric tracking asynchronously
      const latencyMs = Math.round(performance.now() - startTime);
      await supabase.from("events_ax2024").insert({
        type: "ai_latency_metric",
        payload: {
          source: "deepseek_live_triage",
          ticket_id: ticketId,
          duration_ms: latencyMs,
          timestamp: new Date().toISOString()
        }
      });

    } catch (err) {
      setStreamText(prev => prev + '\n\n`[LIVE INQUEST INTERRUPTED: ' + err.message + ']`');
      toast.error('Triage stream disrupted.');
    } finally {
      setIsStreaming(false);
    }
  };

  const pinToThread = async () => {
    if (!streamText || isPinned) return;
    setIsPinned(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        sender_id: user?.id || 'onyx_system',
        message_body: `**[ONYX LIVE TRIAGE CAPTURE]**\n\n${streamText}`,
        is_internal_note: true,
        metadata: { is_rca: false, model_provenance: 'Deepseek-V3' }
      });

      if (error) throw error;

      toast.success('Investigation pinned to ticket thread.', {
        icon: '📌', style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
    } catch (error) {
      setIsPinned(false);
      toast.error('Failed to pin investigation notes.');
    }
  };

  useEffect(() => {
    return () => {
      if (readerRef.current) readerRef.current.cancel();
    };
  }, []);

  if (!streamText && !isStreaming && !hasStarted) {
    return (
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-3xl p-6 mb-6 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 flex items-center justify-center border border-fuchsia-500/20">
            <FiCpu className="text-fuchsia-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wide">Onyx Live Triage Inquest</h4>
            <p className="text-[10px] text-zinc-500 font-mono">Cost Control Suspended — On-Demand Active</p>
          </div>
        </div>
        <button
          onClick={startInvestigation}
          className="flex items-center gap-1.5 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(217,70,239,0.2)] border border-fuchsia-400/20"
        >
          <FiPlay /> Run Triage Inquest
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950/80 border border-fuchsia-500/20 rounded-3xl p-6 mb-6 shadow-[0_0_30px_rgba(217,70,239,0.05)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-fuchsia-500 to-cyan-500" />

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 flex items-center justify-center border border-fuchsia-500/20">
            <FiCpu className={`text-fuchsia-400 ${isStreaming ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400 flex items-center gap-2">
              Onyx Live Triage Inquest
              {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-ping" />}
            </h3>
            <p className="text-[9px] text-zinc-500 font-mono mt-0.5">Powered by Deepseek-V3 Proxy</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isStreaming && hasStarted && (
            <button
              onClick={pinToThread}
              disabled={isPinned}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors border ${isPinned ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30'}`}
            >
              {isPinned ? <FiCheck /> : <FiPaperclip />} {isPinned ? 'Pinned Note' : 'Pin to Thread'}
            </button>
          )}
          <div className="bg-black/50 px-2 py-1 rounded-md border border-zinc-800/50">
             <FiTerminal className="text-zinc-600 text-xs" />
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-300 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-zinc-900/50 max-h-[250px] overflow-y-auto prose-invert prose-p:my-1 prose-li:my-0.5">
        <ReactMarkdown>{streamText || 'Awaiting native chunk stream allocation...'}</ReactMarkdown>
        {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-fuchsia-500 animate-pulse align-middle" />}
      </div>
    </div>
  );
}
