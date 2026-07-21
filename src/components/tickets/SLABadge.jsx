import React, { useState, useEffect, memo } from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiClock } = FiIcons;

const SLABadge = ({ breachAt, status }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!breachAt || status === 'resolved' || status === 'closed') return;

    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [breachAt, status]);

  if (!breachAt) return null;
  if (status === 'resolved' || status === 'closed') return null;

  if (status === 'Review-Patch-Pending') {
    return (
      <div className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)] animate-pulse">
        <SafeIcon icon={FiIcons.FiGitPullRequest || FiClock} className="text-xs" />
        PATCH REVIEW PENDING
      </div>
    );
  }

  const diffMs = new Date(breachAt) - now;

  let label = '';
  let className = '';

  if (diffMs <= 0) {
    label = 'BREACHED';
    className = 'bg-rose-500/20 text-rose-500 border border-rose-500';
  } else if (diffMs < 7200000) { // Under 2 hours
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    label = `${h}h ${m}m left`;
    className = 'animate-pulse text-rose-400 bg-rose-500/10 border-rose-500/30';
  } else {
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    label = `${h}h ${m}m left`;
    className = 'text-zinc-400 bg-zinc-800/50 border-zinc-700';
  }

  return (
    <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${className}`}>
      <SafeIcon icon={FiClock} className="text-xs" />
      {label}
    </div>
  );
};

export default memo(SLABadge);
