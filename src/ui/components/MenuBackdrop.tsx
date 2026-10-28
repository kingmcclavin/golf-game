import { useEffect } from 'react';
import { host } from '../../game2d/host';
import { MenuView } from '../../game2d/menuView';
import { useStore } from '../../state/store';
import { GameCanvas } from './common';

let current: MenuView | null = null;
let currentKey = '';

/** Keeps a single pixel-art course scene behind all menu screens. */
export function MenuBackdrop() {
  const outfit = useStore((s) => s.profile.outfit);
  const quality = useStore((s) => s.profile.settings.quality);
  const course = useStore((s) => s.profile.matchHistory[0]?.courseId ?? 'pinecrest');
  useEffect(() => {
    if (!host.init()) return;
    const key = `${course}:${quality}`;
    if (!current || host.getView() !== current || key !== currentKey) {
      current = new MenuView(course, outfit, quality);
      currentKey = key;
      host.setView(current);
    } else current.setOutfit(outfit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, quality]);
  useEffect(() => {
    if (current && host.getView() === current) current.setOutfit(outfit);
  }, [outfit]);
  if (host.failed) return <div className="canvas-layer" style={{ background: 'radial-gradient(circle at 30% 30%, #1f6a4a, #061414)' }} />;
  return <GameCanvas />;
}
