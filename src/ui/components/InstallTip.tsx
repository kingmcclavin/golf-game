import { useState } from 'react';
import { isIOS, isStandalone } from '../hooks';

const KEY = 'fairway-legends-install-tip';

/** One-time hint for iPhone Safari users: install to the home screen for full-screen, offline play. */
export function InstallTip() {
  const [hidden, setHidden] = useState(() => {
    try {
      return !isIOS() || isStandalone() || localStorage.getItem(KEY) === '1';
    } catch {
      return true;
    }
  });
  if (hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <div className="install-tip panel">
      <div style={{ fontSize: 30 }}>📲</div>
      <div className="grow" style={{ fontSize: 14, lineHeight: 1.35 }}>
        <b style={{ fontFamily: 'var(--display)', fontSize: 16 }}>Play full screen</b><br />
        Tap <b>Share</b> <span style={{ display: 'inline-block', border: '1.5px solid currentColor', borderRadius: 4, padding: '0 4px', fontSize: 12 }}>⬆</span> then <b>Add to Home Screen</b>. It launches like an app and works offline.
      </div>
      <button className="btn small" onClick={close} aria-label="Dismiss">✕</button>
    </div>
  );
}
