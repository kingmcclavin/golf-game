import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { host } from './game/renderer';

// handle for automated tests / debugging
(window as any).__flHost = host;
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/jersey-10/latin-400.css';
import './styles.css';

// make sure the pixel font is ready before 3D labels are painted into canvases
void document.fonts?.load('8px "Press Start 2P"');

// block pinch-zoom / double-tap zoom on iOS Safari during play
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// expose the bottom safe-area inset (home indicator) as a plain number for JS layout maths
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
document.body.appendChild(probe);
const measureSafe = () => document.documentElement.style.setProperty('--safe-b-px', String(parseFloat(getComputedStyle(probe).paddingBottom) || 0));
measureSafe();
window.addEventListener('resize', measureSafe);

// offline play (production builds only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
