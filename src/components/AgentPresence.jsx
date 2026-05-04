import React from 'react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiUsers, FiActivity } = FiIcons;

const MOCK_AGENTS = [
  { id: 1, name: 'Greta', role: 'Senior Architect', color: 'bg-cyan-500' },
  { id: 2, name: 'Sven', role: 'Support Specialist', color: 'bg-emerald-500' },
  { id: 3, name: 'Agent_Onyx', role: 'AI Layer', color: 'bg-fuchsia-500', isAI: true }
];

export default function AgentPresence() {
  return (
    <div className="flex items-center gap-6">
      <div className="flex -space-x-3">
        {MOCK_AGENTS.map((agent) => (
          <div 
            key={agent.id}
            className={`w-10 h-10 rounded-xl border-2 border-zinc-950 flex items-center justify-center text-black font-black text-xs relative group cursor-pointer ${agent.color}`}
          >
            {agent.name[0]}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-zinc-950 rounded-full border-2 border-zinc-950 flex items-center justify-center">
              <div className={`w-1.5 h-1.5 rounded-full ${agent.isAI ? 'bg-fuchsia-400 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
            
            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
              <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap">
                <p className="text-white text-xs font-black tracking-tight">{agent.name}</p>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{agent.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-zinc-800">
        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
          <SafeIcon icon={FiActivity} />
        </div>
        <div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Active Hubs</p>
          <p className="text-xs font-black text-white">3 Agents Syncing</p>
        </div>
      </div>
    </div>
  );
}