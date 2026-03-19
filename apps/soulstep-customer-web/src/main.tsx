import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { initTheme } from '@/lib/theme';
import { initSWUpdater } from '@/lib/sw-update';
import App from '@/app/App';
import './index.css';

Sentry.init({
  dsn: import.meta.env.VITE_GLITCHTIP_DSN || '',
  enabled: !!import.meta.env.VITE_GLITCHTIP_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});

initTheme();
initSWUpdater();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
