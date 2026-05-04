import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion } from 'framer-motion';

const { FiGrid, FiActivity, FiUsers, FiSettings, FiZap, FiShield, FiCpu } = FiIcons;

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Command', path: '/', icon: FiGrid },
  { id: 'analytics', label: 'Intelligence', path: '/analytics', icon: FiActivity },
  { id: 'team', label: 'Neural Team', path: '/team', icon: FiUsers },
  { id: 'settings', label: 'Onyx Config', path: '/settings', icon: FiSettings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-24 bg-zinc-950 border-r border-zinc-900 flex flex-col items-center py-10 z-[60]">
      <div className="w-12 h-12 bg-cyan-500 rounded-2xl flex items-center justify-center text-black shadow-[0_0_20px_rgba(34,211,238,0.4)] mb-12 cursor-pointer group">
        <SafeIcon icon={FiZap} className="text-2xl group-hover:rotate-12 transition-transform" />
      </div>

      <nav className="flex-1 flex flex-col gap-8">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="relative group p-4"
            >
              <SafeIcon 
                icon={item.icon} 
                className={`text-2xl transition-all ${isActive ? 'text-cyan-400' : 'text-zinc-600 group-hover:text-zinc-300'}`} 
              />
              {isActive && (
                <motion.div 
                  layoutId="active-nav"
                  className="absolute inset-0 bg-cyan-500/10 border-l-2 border-cyan-500 rounded-r-xl"
                />
              )}
              {/* Tooltip */}
              <div className="absolute left-full ml-4 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-black text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">
                {item.label}
              </div>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-6">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer hover:border-fuchsia-500/50 hover:text-fuchsia-400 transition-all">
          <SafeIcon icon={FiCpu} />
        </div>
      </div>
    </aside>
  );
}