import { useRef, useState } from 'react';
import type { MatchController } from '../../game/matchController';
import { sound } from '../../audio/sound';
import { PixelIcon, pixelBallGrid } from '../components/PixelIcon';

const BALL = pixelBallGrid(16);
import { useHud, useSwing } from '../../state/matchStore';

/** Pull-back-and-release swing control: press the ball, drag down for power, release to hit. */
export function SwingPad({ ctl }: { ctl: MatchController }) {
  const phase = useHud((s) => s.phase);
  const isHuman = useHud((s) => s.isHumanTurn);
  const start = useRef<{ x: number; y: number; id: number; max: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const enabled = phase === 'aim' && isHuman;
  /** Full power = pulling to just above the screen edge (a thumb can't go past it on a phone). */
  const maxPull = (y: number) => {
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b-px')) || 0;
    const space = window.innerHeight - y - safeB - 14;
    // 110% (overpower) sits at the very bottom, 100% just before it
    return Math.max(50, Math.min(250, space / 1.1));
  };

  const down = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ctl.beginPull()) return;
    sound.haptic(8);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, max: maxPull(e.clientY) };
    setDrag({ x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const mp = s.max;
    ctl.updatePull((e.clientX - s.x) / mp, (e.clientY - s.y) / mp);
    setDrag({ x: e.clientX, y: e.clientY, sx: s.x, sy: s.y });
  };
  const up = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    start.current = null;
    setDrag(null);
    if (e.type === 'pointercancel') ctl.cancelPull();
    else {
      // haptics must fire inside the touch gesture on iOS
      const sw = useSwing.getState();
      sound.haptic(Math.abs(sw.needle) <= sw.perfectWindow ? 45 : 12);
      ctl.release();
    }
  };

  return (
    <>
      <div
        className={`swing-pad pe ${enabled ? '' : 'disabled'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Swing: press and pull down, release to hit"
        role="button"
      >
        {enabled && <div className="pad-ring" />}
        <div className="ballbtn"><PixelIcon grid={BALL} size={92} />{enabled ? <span>PULL<br />▼</span> : '···'}</div>
      </div>
      {drag && <PullLine {...drag} />}
      <PowerMeter />
    </>
  );
}

function PullLine({ x, y, sx, sy }: { x: number; y: number; sx: number; sy: number }) {
  return (
    <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 30 }}>
      <line x1={sx} y1={sy} x2={x} y2={y} stroke="rgba(255,255,255,0.85)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 10" />
      <circle cx={x} cy={y} r={16} fill="rgba(255,255,255,0.25)" stroke="#fff" strokeWidth={3} />
    </svg>
  );
}

function PowerMeter() {
  const { pulling, power, needle, perfectWindow } = useSwing();
  const isPutt = useHud((s) => s.isPutt);
  const puttFeet = useHud((s) => s.puttFeet);
  const preview = useHud((s) => s.preview);
  const suggest = useHud((s) => s.suggestPower);
  if (!pulling) return null;
  const R = 100;
  const half = Math.PI / 2;
  const toXY = (v: number, r = R) => {
    const a = -half + v * half; // -1..1 -> -90..90 deg from vertical
    return [115 + Math.sin(a) * r, 110 - Math.cos(a) * r];
  };
  const good = Math.min(1, perfectWindow * 2.6);
  const inPerfect = Math.abs(needle) <= perfectWindow;
  const over = power > 1;
  return (
    <div className="meter needle-wrap">
      <div className="col" style={{ alignItems: 'center', gap: 4 }}>
        <svg width={230} height={124} style={{ overflow: 'visible' }} shapeRendering="crispEdges">
          {/* the arc is drawn as chunky blocks: red edges, yellow "good" band, green perfect zone */}
          {Array.from({ length: 29 }, (_, i) => {
            const v = -1 + (i / 28) * 2;
            const [x, y] = toXY(v);
            const col = Math.abs(v) <= perfectWindow ? '#63c74d' : Math.abs(v) <= good ? '#fee761' : '#e43b44';
            return <rect key={i} x={Math.round(x / 4) * 4 - 7} y={Math.round(y / 4) * 4 - 7} width={14} height={14} fill={col} stroke="#181425" strokeWidth={3} />;
          })}
          {[0.25, 0.45, 0.65, 0.85, 1.05].map((k, i) => {
            const [x, y] = toXY(Math.max(-1, Math.min(1, needle)), R * k);
            return <rect key={i} x={Math.round(x / 4) * 4 - 4} y={Math.round(y / 4) * 4 - 4} width={8} height={8} fill={inPerfect ? '#63c74d' : '#ffffff'} stroke="#181425" strokeWidth={2} />;
          })}
          <rect x={107} y={102} width={16} height={16} fill="#feae34" stroke="#181425" strokeWidth={3} />
          <text x={115} y={84} textAnchor="middle" fill="#fff" fontSize={16} fontFamily="var(--title)" stroke="#181425" strokeWidth={4} paintOrder="stroke">
            {isPutt ? `${Math.round(puttFeet)}FT` : `${Math.round(power * 100)}%`}
          </text>
          {!isPutt && preview && (
            <text x={115} y={58} textAnchor="middle" fill="#2ce8f5" fontSize={16} fontFamily="var(--display)" fontWeight={700} stroke="#181425" strokeWidth={4} paintOrder="stroke">{Math.round(preview.carry * 1.0936)} yd carry</text>
          )}
        </svg>
        <div style={{ fontSize: 15, fontWeight: 700, color: over ? '#e43b44' : '#fff', textShadow: '2px 2px 0 #181425' }}>{over ? 'OVERPOWER! Riskier timing' : 'Release in the green'}</div>
      </div>
      <div className="power-bar">
        <div className="fill" style={{ height: `${Math.min(1, power / 1.1) * 100}%` }} />
        <div className="over" style={{ bottom: `${(1 / 1.1) * 100}%` }} />
        <div className="suggest" style={{ bottom: `${(Math.min(1.1, suggest) / 1.1) * 100}%` }} title="Suggested power to reach the pin" />
      </div>
    </div>
  );
}
