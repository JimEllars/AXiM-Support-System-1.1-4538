import React from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useTicketStore } from '../store/useTicketStore';
import { FiRefreshCw } from 'react-icons/fi';

const { FiZap, FiShield, FiCpu, FiMessageSquare, FiFlag } = FiIcons;

const ACTIONS = [
  { id: 'triage', label: 'Batch Triage', icon: FiCpu, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10' },
  { id: 'esc', label: 'Escalate High', icon: FiFlag, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { id: 'broadcast', label: 'System Alert', icon: FiShield, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { id: 'auto', label: 'Auto-Resolve', icon: FiZap, color: 'text-cyan-400', bg: 'bg-cyan-500/10' }
];

export default function DashboardQuickActions({ onAction }) {
  const { fetchTickets } = useTicketStore();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleForceSync = async () => {
    setIsSyncing(true);
    await fetchTickets();
    setTimeout(() => setIsSyncing(false), 500);
  };

  return (
    <>
      {ACTIONS.map((action) => (
        <button 
          key={action.id}
          onClick={() => onAction?.(action.id)}
          className="group flex items-center gap-4 p-5 bg-zinc-900/40 border border-zinc-800 rounded-3xl hover:border-zinc-700 hover:bg-zinc-800/40 transition-all text-left"
        >
          <div className={`w-12 h-12 rounded-2xl ${action.bg} flex items-center justify-center ${action.color} border border-white/5 shadow-lg group-hover:scale-110 transition-transform`}>
            <SafeIcon icon={action.icon} className="text-xl" />
          </div>
          <div>
            <p className="text-xs font-black text-white tracking-tight uppercase">{action.label}</p>
            <p className="text-[9px] font-bold text-zinc-600 tracking-widest mt-0.5">QUICK_OPS</p>
          </div>
        </button>
      ))}
      <button
        onClick={handleForceSync}
        disabled={isSyncing}
        className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl hover:bg-zinc-800 transition-colors group"
      >
        <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
          <FiRefreshCw className={isSyncing ? "animate-spin text-lg" : "text-lg"} />
        </div>
        <span className="text-xs font-bold text-zinc-300">Force Sync</span>
        <span className="text-[9px] text-zinc-500 text-center px-2">Pull latest queue state</span>
      </button>
    </>
  );
}