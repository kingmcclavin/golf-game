import { useEffect, useRef } from 'react';
import type { MatchController } from '../../game/matchController';
import { useHud } from '../../state/matchStore';

const SURF_COLORS: Record<string, string> = {};

/** Top-down hole map with tee at the bottom. Tap to aim at a spot. */
export function Minimap({ ctl }: { ctl: MatchController }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const holeNumber = useHud((s) => s.holeNumber);
  const phase = useHud((s) => s.phase);
  const current = useHud((s) => s.current);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<{ ox: number; oz: number; fx: number; fz: number; rx: number; rz: number; scale: number; W: number; H: number } | null>(null);

  useEffect(() => {
    if (phase === 'loading') return;
    const w = ctl.match.world;
    const h = w.hole;
    const t = h.theme;
    Object.assign(SURF_COLORS, { tee: t.tee, fairway: t.fairway, rough: t.rough, deepRough: t.deepRough, green: t.green, fringe: t.fringe, bunker: t.sand, waste: t.waste, water: t.water, oob: '#2a3a30' });
    const W = 110, H = 150;
    const tee = h.tee, pin = h.pin;
    const dx = pin.x - tee.x, dz = pin.z - tee.z;
    const L = Math.hypot(dx, dz);
    const fx = dx / L, fz = dz / L;
    const rx = -fz, rz = fx;
    // extents in (lateral, along)
    let minA = -20, maxA = L + 30, minL = -30, maxL = 30;
    for (const p of h.path) {
      const a = (p.x - tee.x) * fx + (p.z - tee.z) * fz;
      const l = (p.x - tee.x) * rx + (p.z - tee.z) * rz;
      minA = Math.min(minA, a - 20); maxA = Math.max(maxA, a + 30);
      minL = Math.min(minL, l - 45); maxL = Math.max(maxL, l + 45);
    }
    const scale = Math.min((H - 8) / (maxA - minA), (W - 8) / (maxL - minL));
    const cl = (minL + maxL) / 2;
    const ox = tee.x + rx * cl + fx * minA, oz = tee.z + rz * cl + fz * minA;
    frame.current = { ox, oz, fx, fz, rx, rz, scale, W, H };
    const c = document.createElement('canvas');
    c.width = W * 2;
    c.height = H * 2;
    const g = c.getContext('2d')!;
    const step = 2 / scale;
    for (let py = 0; py < H * 2; py += 2) {
      for (let px = 0; px < W * 2; px += 2) {
        const along = (H * 2 - 4 - py) / 2 / scale;
        const lat = (px / 2 - W / 2) / scale;
        const x = ox + fx * along + rx * lat;
        const z = oz + fz * along + rz * lat;
        g.fillStyle = SURF_COLORS[w.surface(x, z)] ?? '#000';
        g.fillRect(px, py, 2, 2);
      }
    }
    void step;
    g.fillStyle = 'rgba(20,60,30,0.85)';
    for (const tr of h.trees) {
      const p = toMap(tr.x, tr.z);
      if (!p) continue;
      g.beginPath();
      g.arc(p[0] * 2, p[1] * 2, Math.max(1.5, tr.canopyR * scale * 2 * 0.6), 0, 7);
      g.fill();
    }
    bg.current = c;
  }, [holeNumber, phase === 'loading']);

  function toMap(x: number, z: number): [number, number] | null {
    const f = frame.current;
    if (!f) return null;
    const along = (x - f.ox) * f.fx + (z - f.oz) * f.fz;
    const lat = (x - f.ox) * f.rx + (z - f.oz) * f.rz;
    return [f.W / 2 + lat * f.scale, f.H - 2 - along * f.scale];
  }

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv || !bg.current || !frame.current) return;
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(bg.current, 0, 0, cv.width, cv.height);
      const k = cv.width / frame.current.W;
      const m = ctl.match;
      const pin = toMap(m.world.hole.pin.x, m.world.hole.pin.z);
      if (pin) {
        g.fillStyle = '#fff';
        g.fillRect(pin[0] * k - 1, pin[1] * k - 12, 2, 12);
        g.fillStyle = m.world.hole.theme.flag;
        g.fillRect(pin[0] * k + 1, pin[1] * k - 12, 7, 5);
      }
      m.players.forEach((p, i) => {
        if (p.holed || p.pickedUp) return;
        const b = toMap(p.ball.x, p.ball.z);
        if (!b) return;
        g.fillStyle = i === 0 ? '#3d9bff' : p.color;
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(b[0] * k, b[1] * k, i === current ? 4.5 : 3.2, 0, 7);
        g.fill();
        g.stroke();
      });
      const aim = ctl.aimPreviewPoint();
      const me = m.players[m.players.length ? current : 0];
      if (aim && me) {
        const a = toMap(aim.x, aim.z);
        const b = toMap(me.ball.x, me.ball.z);
        if (a && b) {
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.setLineDash([4, 3]);
          g.beginPath();
          g.moveTo(b[0] * k, b[1] * k);
          g.lineTo(a[0] * k, a[1] * k);
          g.stroke();
          g.setLineDash([]);
          g.beginPath();
          g.arc(a[0] * k, a[1] * k, 4, 0, 7);
          g.stroke();
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [current]);

  const onTap = (e: React.PointerEvent) => {
    const f = frame.current;
    const cv = ref.current;
    if (!f || !cv) return;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * f.W;
    const my = ((e.clientY - r.top) / r.height) * f.H;
    const along = (f.H - 2 - my) / f.scale;
    const lat = (mx - f.W / 2) / f.scale;
    ctl.aimAt(f.ox + f.fx * along + f.rx * lat, f.oz + f.fz * along + f.rz * lat);
  };

  return <canvas ref={ref} className="minimap pe" width={220} height={300} onPointerDown={onTap} />;
}
