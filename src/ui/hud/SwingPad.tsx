import { useRef, useState } from 'react';
import type { MatchController } from '../../game/matchController';
import { useHud, useSwing } from '../../state/matchStore';

/** Pull-back-and-release swing control: press the ball, drag down for power, release to hit. */
export function SwingPad({ ctl }: { ctl: MatchController }) {
  const phase = useHud((s) => s.phase);
  const isHuman = useHud((s) => s.isHumanTurn);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const enabled = phase === 'aim' && isHuman;
  const maxPull = () => Math.min(250, window.innerHeight * 0.42);

  const down = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ctl.beginPull()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDrag({ x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const mp = maxPull();
    ctl.updatePull((e.clientX - s.x) / mp, (e.clientY - s.y) / mp);
    setDrag({ x: e.clientX, y: e.clientY, sx: s.x, sy: s.y });
  };
  const up = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    start.current = null;
    setDrag(null);
    if (e.type === 'pointercancel') ctl.cancelPull();
    else ctl.release();
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
        <div className="ballbtn">{enabled ? <>PULL<br />▼</> : '···'}</div>
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
  if (!pulling) return null;
  const R = 100;
  const half = Math.PI / 2;
  const toXY = (v: number, r = R) => {
    const a = -half + v * half; // -1..1 -> -90..90 deg from vertical
    return [115 + Math.sin(a) * r, 110 - Math.cos(a) * r];
  };
  const arc = (a: number, b: number, color: string, w = 16) => {
    const [x1, y1] = toXY(a);
    const [x2, y2] = toXY(b);
    return <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`} stroke={color} strokeWidth={w} fill="none" />;
  };
  const good = Math.min(1, perfectWindow * 2.6);
  const [nx, ny] = toXY(Math.max(-1, Math.min(1, needle)), R + 14);
  const inPerfect = Math.abs(needle) <= perfectWindow;
  const over = power > 1;
  return (
    <div className="meter" style={{ right: 'calc(140px + var(--safe-r))', bottom: 'calc(10px + var(--safe-b))', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <div className="col" style={{ alignItems: 'center', gap: 4 }}>
        <svg width={230} height={124} style={{ overflow: 'visible' }}>
          {arc(-1, 1, 'rgba(255,90,90,0.75)')}
          {arc(-good, good, 'rgba(255,210,58,0.9)')}
          {arc(-perfectWindow, perfectWindow, '#4cd17a', 20)}
          <line x1={115} y1={110} x2={nx} y2={ny} stroke={inPerfect ? '#b8ffd0' : '#fff'} strokeWidth={5} strokeLinecap="round" />
          <circle cx={115} cy={110} r={7} fill="#fff" />
          <text x={115} y={84} textAnchor="middle" fill="#fff" fontSize={22} fontFamily="var(--display)">
            {isPutt ? `${Math.round(puttFeet)} ft` : `${Math.round(power * 100)}%`}
          </text>
          {!isPutt && preview && (
            <text x={115} y={60} textAnchor="middle" fill="#cfe" fontSize={14} fontFamily="var(--body)">{Math.round(preview.carry * 1.0936)} yd carry</text>
          )}
        </svg>
        <div style={{ fontSize: 13, color: over ? '#ff8a8a' : '#cfe' }}>{over ? 'OVERPOWER! Riskier timing' : 'Release in the green'}</div>
      </div>
      <div className="power-bar">
        <div className="fill" style={{ height: `${Math.min(1, power / 1.1) * 100}%` }} />
        <div className="over" style={{ bottom: `${(1 / 1.1) * 100}%` }} />
      </div>
    </div>
  );
}
