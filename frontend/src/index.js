import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorModeProvider } from './ColorModeContext';
import App from './App';
import './index.css';

// ── Sentry (only activates when REACT_APP_SENTRY_DSN is set) ────────────────
import * as Sentry from '@sentry/react';
const _sentryDsn = process.env.REACT_APP_SENTRY_DSN;
if (_sentryDsn) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ColorModeProvider>
      <App />
    </ColorModeProvider>
  </React.StrictMode>
);

// ── Register PWA service worker ───────────────────────────────────────────────
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}
