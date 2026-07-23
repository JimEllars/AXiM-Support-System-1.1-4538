import React, { useState, useRef, useEffect } from 'react';
import { FiTerminal, FiCornerDownLeft, FiX, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';
import { useTicketStore } from '../store/useTicketStore';

export default function OnyxCommandHub({ isOpen, onClose }) {
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const { activeTicket, fetchTickets } = useTicketStore();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExecuteCommand = async (e) => {
    e.preventDefault();
    const rawInput = commandInput.trim();
    if (!rawInput || isExecuting) return;

    if (!activeTicket) {
      toast.error("Select an active ticket before dispatching terminal commands.");
      return;
    }

    const parts = rawInput.split(' ');
    const command = parts[0].toLowerCase();
    const targetValue = parts.slice(1).join(' ') || null;

    if (!['/escalate', '/resolve', '/reassign'].includes(command)) {
      toast.error("Unsupported command. Use /escalate, /resolve, or /reassign [department]");
      return;
    }

    setIsExecuting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Active operator session token required.");

      const workerUrl = getEdgeWorkerUrl();
      const res = await fetch(`${workerUrl}/api/v1/command/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          command,
          targetValue
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Command execution failed.');

      toast.success(`Command ${command} executed successfully!`, {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });

      setCommandInput('');
      fetchTickets();
      if (onClose) onClose();
    } catch (err) {
      toast.error(`Execution Error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-4 font-mono">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
            <FiTerminal className="text-sm"/>
            <span className="uppercase tracking-wider">Onyx Command Terminal</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
          >
            <FiX/>
          </button>
        </div>

        <form onSubmit={handleExecuteCommand} className="space-y-3">
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-xs text-indigo-400 font-bold">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Type command: /escalate, /resolve, or /reassign [dept]"
              className="w-full pl-8 pr-12 py-3 rounded-2xl bg-black/60 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            <button
              type="submit"
              disabled={!commandInput.trim() || isExecuting}
              className="absolute right-2 p-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white transition-all disabled:opacity-40"
            >
              <FiCornerDownLeft className="text-xs"/>
            </button>
          </div>
        </form>

        <div className="p-3 rounded-xl bg-black/40 border border-zinc-900 text-[10px] text-zinc-500 space-y-1">
          <div className="text-zinc-400 font-bold uppercase tracking-wider mb-1">Available Slashed Commands:</div>
          <div className="flex justify-between"><span>/escalate</span><span className="text-zinc-600">Escalate ticket priority to URGENT</span></div>
          <div className="flex justify-between"><span>/resolve</span><span className="text-zinc-600">Mark current ticket as RESOLVED</span></div>
          <div className="flex justify-between"><span>/reassign [Department]</span><span className="text-zinc-600">Reassign ticket department</span></div>
        </div>
      </div>
    </div>
  );
}
