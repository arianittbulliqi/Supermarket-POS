import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './pos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// keep working offline: the service worker caches the app shell after the first visit
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
