import { useEffect, useState } from 'react';

const q = '(orientation: portrait) and (max-width: 700px)';

/** True on a phone held upright (the primary iPhone layout). */
export function usePhonePortrait(): boolean {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => {
      m.removeEventListener('change', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return v;
}

export const isIOS = () =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
