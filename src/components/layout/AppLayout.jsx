import React from 'react';
import Sidebar from './Sidebar';
import CoreHealthIndicator from './CoreHealthIndicator';
import { ErrorBoundary } from './ErrorBoundary';

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-black">
      <Sidebar />
      <div className="pl-24">
        <CoreHealthIndicator />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  );
}