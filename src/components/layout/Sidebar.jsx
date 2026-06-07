import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

const { FiGrid, FiActivity, FiUsers, FiSettings, FiZap, FiShield, FiCpu, FiLogOut } = FiIcons;

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Command', path: '/', icon: FiGrid },
  { id: 'analytics', label: 'Intelligence', path: '/analytics', icon: FiActivity },
  { id: 'team', label: 'Neural Team', path: '/team', icon: FiUsers },
  { id: 'settings', label: 'Onyx Config', path: '/settings', icon: FiSettings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();

  const [isAway, setIsAway] = useState(false);

  const handleStatusToggle = async () => {
    const newStatus = isAway ? 'available' : 'away';
    setIsAway(!isAway);
    if (user?.id) {
        try {
            const { error } = await supabase.from('team_profiles').update({ status: newStatus }).eq('id', user.id);
            if (error) throw error;
            toast.success(`Agent status updated to ${newStatus.toUpperCase()}`, {
                style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
            });
        } catch (error) {
            console.error('Failed to update status', error);
            // Revert state on failure
            setIsAway(isAway);
        }
    }
  };


  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

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

      <div className="mt-auto flex flex-col items-center gap-6 w-full px-2">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 cursor-pointer hover:border-fuchsia-500/50 hover:text-fuchsia-400 transition-all mb-4">
          <SafeIcon icon={FiCpu} />
        </div>

                {/* User Identity, Status & Logout */}
        <div className="flex flex-col items-center gap-3 w-full border-t border-zinc-800 pt-6 group">
          {user?.email && (
            <div className="text-[10px] font-mono text-zinc-500 tracking-tighter truncate w-full px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-24 bg-zinc-900 py-1 rounded">
              {user.email.split('@')[0]}
            </div>
          )}

          <button
            onClick={handleStatusToggle}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${isAway ? 'text-amber-500 bg-amber-500/10 border border-amber-500/50' : 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/50'}`}
            title={`Status: ${isAway ? 'Away' : 'Available'}`}
          >
            <div className={`w-3 h-3 rounded-full ${isAway ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`} />
          </button>

          <button
            onClick={handleSignOut}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-all relative mt-2"
            title="Sign Out"
          >
            <SafeIcon icon={FiLogOut} className="text-xl" />
          </button>
        </div>
      </div>
    </aside>
  );
}
