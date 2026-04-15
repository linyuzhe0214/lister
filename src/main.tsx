import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', padding: '2rem', background: '#f9fafb' }}>
          <div style={{ background: 'white', borderRadius: '1rem', padding: '2rem', maxWidth: '480px', width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #fee2e2' }}>
            <div style={{ color: '#dc2626', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>⚠ 發生錯誤</div>
            <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: 1.6 }}>應用程式遇到問題，請嘗試清除快取並重新載入。</p>
            <details style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.8rem' }}>
              <summary style={{ cursor: 'pointer' }}>錯誤詳情</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.5rem' }}>{this.state.error.message}</pre>
            </details>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { localStorage.removeItem('reports_cache'); window.location.reload(); }}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >清除快取並重新載入</button>
              <button
                onClick={() => window.location.reload()}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >重新載入</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
