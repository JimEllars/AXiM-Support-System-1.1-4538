import React from 'react';
import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-black">
      <Sidebar />
      <div className="pl-24">
        {children}
      </div>
    </div>
  );
}