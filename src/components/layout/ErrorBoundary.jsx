import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("AXiM Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          color: '#e4e4e7',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            background: 'rgba(24, 24, 27, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(63, 63, 70, 0.5)',
            borderRadius: '1.5rem',
            padding: '2.5rem',
            maxWidth: '28rem',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#f43f5e' }}>
              AXiM Dashboard Exception
            </h2>
            <p style={{ color: '#a1a1aa', marginBottom: '2rem', lineHeight: 1.5 }}>
              The component failed to render. Please refresh your session.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#fafafa',
                color: '#09090b',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Refresh Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
