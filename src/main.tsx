import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { trackVisualViewport } from './lib/viewport';
import './styles/global.css';

// Service worker: precaches the app shell and auto-activates new builds.
registerSW({ immediate: true });

// Keep the layout above the on-screen keyboard (iOS only shrinks the visual viewport).
trackVisualViewport();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
