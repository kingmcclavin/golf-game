import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// block pinch-zoom / double-tap zoom on iOS Safari during play
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
