import React, { useState } from 'react';
import Sidebar from './Sidebar';
import CoreHealthIndicator from './CoreHealthIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

export default function AppLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-black">
      <div className="md:hidden p-4 bg-zinc-950 flex items-center justify-between border-b border-zinc-900 z-[70] relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-black">
            <SafeIcon icon={FiIcons.FiZap} className="text-xl" />
          </div>
          <span className="text-white font-black uppercase tracking-widest text-xs">AXiM Support</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-zinc-400 hover:text-white p-2">
          <SafeIcon icon={isSidebarOpen ? FiIcons.FiX : FiIcons.FiMenu} className="text-2xl" />
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="md:pl-24 transition-all">
        <CoreHealthIndicator />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  );
}