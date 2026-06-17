import React from 'react';
import SafeIcon from '../../common/SafeIcon';
import { FiAlertTriangle } from 'react-icons/fi';

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("UI Caught Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-zinc-950 border border-red-900/30 rounded-2xl">
           <SafeIcon icon={FiAlertTriangle} className="text-4xl text-red-500 mb-4" />
           <h2 className="text-xl font-bold text-white mb-2">Component Crashed</h2>
           <p className="text-zinc-400 text-sm max-w-md">{this.state.error?.message || "An unexpected error occurred in the UI."}</p>
           <button onClick={() => window.location.reload()} className="mt-6 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors text-sm font-bold">Reload Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}
