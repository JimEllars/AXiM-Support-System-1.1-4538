import React, { useEffect, useState } from 'react';
import { useTicketStore } from '../../store/useTicketStore';
import { supabase } from '../../lib/supabaseClient';
import { FiX, FiCpu, FiTerminal } from 'react-icons/fi';

export default function PayloadTraceInspectorModal() {
  const { activeInspectionTraceId, isInspectionModalOpen, triggerDeepTraceInspection } = useTicketStore();
  const [traceData, setTraceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeInspectionTraceId || !isInspectionModalOpen) return;
    const fetchTraceDetails = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('events_ax2024')
        .select('*')
        .eq('id', activeInspectionTraceId)
        .single();
      if (data) setTraceData(data);
      setIsLoading(false);
    };
    fetchTraceDetails();
  }, [activeInspectionTraceId, isInspectionModalOpen]);

  if (!isInspectionModalOpen) return null;

  const renderPayload = () => {
    if (!traceData) return 'Awaiting packet resolution...';
    const p = traceData.payload || traceData;
    if (typeof p === 'string') return p;
    try {
      return JSON.stringify(p, null, 2);
    } catch (e) {
      return String(p);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-[#09090b]/95 border border-zinc-800/80 w-full max-w-3xl rounded-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(34,211,238,0.1)]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
              <FiTerminal className="text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Payload Trace Inspector</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-zinc-500 font-mono">ID: {traceData?.id?.split('-')[0]}</span>
                {traceData?.payload?.cf_ray && (
                  <span className="text-[9px] bg-indigo-950/50 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono">
                    CF-RAY: {traceData.payload.cf_ray}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => triggerDeepTraceInspection(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-400 hover:text-white">
            <FiX />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs text-zinc-300 relative">
          {isLoading && <div className="absolute inset-0 bg-[#09090b]/50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>}

          <div className="bg-black/50 p-4 rounded-xl border border-zinc-800/50 flex flex-col gap-1">
            <span className="text-zinc-600 font-bold uppercase tracking-widest text-[10px]">Trace Identifier</span>
            <span className="text-cyan-400">{activeInspectionTraceId}</span>
          </div>

          <div className="bg-black/50 p-4 rounded-xl border border-zinc-800/50">
            <span className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] block mb-3">Exception Metadata Stream</span>
            <pre className="text-[11px] text-zinc-300 overflow-x-auto p-4 bg-[#09090b] rounded-lg border border-zinc-900 shadow-inner max-h-[400px] whitespace-pre-wrap break-words">
              {renderPayload()}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
