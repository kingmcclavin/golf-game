import { useEffect, useRef, useState } from 'react';
import { host } from '../../game2d/host';
import { MatchController } from '../../game2d/match';
import { useStore } from '../../state/store';
import { GameCanvas } from '../components/common';
import { HUD } from '../hud/HUD';
import { launchMatch, pendingMatch, pickOpponents } from './PlaySetup';

export function GameScreen() {
  const go = useStore((s) => s.go);
  const [ctl, setCtl] = useState<MatchController | null>(null);
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!pendingMatch) {
      go('menu');
      return;
    }
    if (!host.init()) return;
    const c = new MatchController(pendingMatch);
    host.setView(c);
    setCtl(c);
    (window as any).__fl = { ctl: c };
    return () => {
      c.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (host.failed) {
    return (
      <div className="screen dim" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h2>Graphics unavailable</h2>
        <p className="muted" style={{ maxWidth: 480 }}>Your browser could not start a drawing canvas, which the golf course needs. Try updating your browser or playing on another device. Your menus, bag and shop still work.</p>
        <button className="btn primary" onClick={() => go('menu')}>Back to menu</button>
      </div>
    );
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ctl) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 2 || d.moved) {
      d.moved = true;
      ctl.aimDrag(dx);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ctl) return;
    if (!d.moved) {
      if (ctl.phase === 'aim') {
        // tap on the course to aim there
        const hit = ctl.pickGround(e.clientX, e.clientY);
        if (hit) ctl.aimAt(hit.x, hit.z);
      } else ctl.skip();
    }
  };

  const quit = () => {
    ctl?.dispose();
    go('menu');
  };
  const again = () => {
    if (!ctl) return;
    const s = ctl.setup;
    ctl.dispose();
    launchMatch({ courseId: s.courseId, length: s.length, difficulty: s.difficulty, opponents: s.opponents.length ? pickOpponents(s.difficulty, s.opponents.length) : [] });
  };

  return (
    <>
      <GameCanvas onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      {ctl && <HUD ctl={ctl} onQuit={quit} onAgain={again} />}
    </>
  );
}
