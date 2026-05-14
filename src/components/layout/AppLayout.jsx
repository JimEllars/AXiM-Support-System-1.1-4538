import React from 'react';
import Sidebar from './Sidebar';
import CoreHealthIndicator from './CoreHealthIndicator';

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-black">
      <Sidebar />
      <div className="pl-24">
        <CoreHealthIndicator />
        {children}
      </div>
    </div>
  );
}