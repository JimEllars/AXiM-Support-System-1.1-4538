import React, { useState, useEffect, useRef } from 'react';
import { FiCpu, FiTerminal } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../../lib/supabaseClient';

export default function OnyxInvestigationPanel({ ticketId, subject, description }) {
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const streamComplete = useRef(false);

  useEffect(() => {
    if (streamComplete.current || !ticketId) return;
    let reader;

    const startStream = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || 'http://localhost:8787';

        // CRITICAL FIX: Use fetch instead of EventSource to securely pass the JWT
        const res = await fetch(`${workerUrl}/api/v1/onyx-bridge/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ subject, description })
        });

        if (!res.ok) throw new Error('Stream rejected');

        reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.replace('data: ', ''));
                if (parsed.choices[0].delta.content) {
                  setStreamText(prev => prev + parsed.choices[0].delta.content);
                }
              } catch (e) { /* ignore fragment errors */ }
            }
          }
        }
      } catch (err) {
        setStreamText(prev => prev + '\n\n`[STREAM CONNECTION INTERRUPTED]`');
      } finally {
        setIsStreaming(false);
        streamComplete.current = true;
      }
    };

    startStream();

    return () => {
      if (reader) reader.cancel();
    };
  }, [ticketId, subject, description]);

  if (!streamText && !isStreaming) return null;

  return (
    <div className="bg-zinc-950/80 border border-fuchsia-500/20 rounded-3xl p-6 mb-6 shadow-[0_0_30px_rgba(217,70,239,0.05)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-fuchsia-500 to-cyan-500" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 flex items-center justify-center border border-fuchsia-500/20">
            <FiCpu className={`text-fuchsia-400 ${isStreaming ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400 flex items-center gap-2">
              Onyx Mk3 Live Triage
              {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-ping" />}
            </h3>
            <p className="text-[9px] text-zinc-500 font-mono mt-0.5">Powered by Deepseek-V3</p>
          </div>
        </div>
        <div className="bg-black/50 px-2 py-1 rounded-md border border-zinc-800/50">
           <FiTerminal className="text-zinc-600 text-xs" />
        </div>
      </div>

      <div className="text-xs text-zinc-300 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-zinc-900/50 max-h-[250px] overflow-y-auto prose-invert prose-p:my-1 prose-li:my-0.5">
        <ReactMarkdown>{streamText}</ReactMarkdown>
        {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-fuchsia-500 animate-pulse align-middle" />}
      </div>
    </div>
  );
}
