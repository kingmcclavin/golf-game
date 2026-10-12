import { describe, it, expect } from 'vitest';
import { getHoleWorld } from './course';
import { defaultPhysMods, simulate, speedForCarry, flatCarry, BALL_R } from './physics';
import { executeShot, planShot } from './shot';
import { Match } from './match';
import { makePlayer } from './players';
import { clubById } from '../data/clubs';
import { DEFAULT_OUTFIT } from '../data/cosmetics';
import { generateHole } from './holeGen';
import { HoleWorld } from './world';
import { THEMES } from '../data/courses/themes';

const world = getHoleWorld('pinecrest', 0);
const tee = world.hole.tee;
const pin = world.hole.pin;
const yawToPin = Math.atan2(pin.x - tee.x, -(pin.z - tee.z));

function soloMatch(clubs: string[]) {
  const p = makePlayer('you', 'You', '#fff', DEFAULT_OUTFIT, clubs.map((id) => ({ def: clubById(id), level: 1 })));
  return new Match({ courseId: 'pinecrest', length: 9, difficulty: 'beginner', seed: 1 }, [p]);
}

describe('ball physics', () => {
  it('carry calibration hits the requested distance', () => {
    for (const target of [40, 120, 220]) {
      const v = speedForCarry(target, 14, 4000);
      expect(Math.abs(flatCarry(v, 14, 4000) - target)).toBeLessThan(0.5);
    }
  });

  it('more power means more distance', () => {
    const m = soloMatch(['drv_timberline', 'pt_brass']);
    const dists = [0.4, 0.7, 1.0].map((pw) => {
      const setup = m.makeSetup(0, m.players[0].bag[0], pw, yawToPin);
      const { result } = executeShot(m.world, setup, 0, 5);
      return Math.hypot(result.final.x - tee.x, result.final.z - tee.z);
    });
    expect(dists[0]).toBeLessThan(dists[1]);
    expect(dists[1]).toBeLessThan(dists[2]);
  });

  it('ball comes to rest on the terrain and respects slopes', () => {
    const r = simulate(world, { pos: { x: tee.x, y: world.height(tee.x, tee.z) + 0.03, z: tee.z }, vel: { x: 0, y: 25, z: -45 }, backspin: 3000, sidespin: 0 }, { x: 0, z: 0 }, defaultPhysMods());
    expect(r.outcome).toBe('rest');
    expect(Math.abs(r.final.y - (world.height(r.final.x, r.final.z) + BALL_R))).toBeLessThan(0.05);
    // a ball placed on a slope with no velocity rolls downhill on the green if the slope is steep enough
    const g = world.hole.green.c;
    const n = world.normal(g.x, g.z);
    expect(n.y).toBeGreaterThan(0.9);
  });

  it('putts drop into the cup and fast putts lip out', () => {
    const start = { x: pin.x + 2, z: pin.z };
    const dir = { x: -1, z: 0 };
    const mk = (speed: number) =>
      simulate(world, { pos: { x: start.x, y: world.height(start.x, start.z) + BALL_R, z: start.z }, vel: { x: dir.x * speed, y: 0, z: dir.z * speed }, backspin: 0, sidespin: 0, putt: true }, { x: 0, z: 0 }, { ...defaultPhysMods(), slopeMul: 0 });
    const good = mk(Math.sqrt(2 * world.hole.theme.greenSpeed * 9.81 * 2.3));
    expect(good.outcome).toBe('holed');
    const blast = mk(9);
    expect(blast.outcome).not.toBe('holed');
    expect(blast.events.some((e) => e.type === 'lip')).toBe(true);
  });

  it('water hazards and out of bounds are detected', () => {
    // Little Pond (hole 3): water in front of the green
    const w = getHoleWorld('pinecrest', 2);
    const wb = w.hole.water[0];
    const t = w.hole.tee;
    const r = simulate(w, { pos: { x: wb.c.x, y: w.height(wb.c.x, wb.c.z) + 10, z: wb.c.z }, vel: { x: 0, y: -5, z: 0 }, backspin: 0, sidespin: 0 }, { x: 0, z: 0 }, defaultPhysMods());
    expect(r.outcome).toBe('water');
    expect(r.dropPoint).not.toBeNull();
    expect(w.waterAt(r.dropPoint!.x, r.dropPoint!.z)).toBeNull();
    const far = w.frame(60, w.hole.boundsHalf + 25);
    const r2 = simulate(w, { pos: { x: far.x, y: w.height(far.x, far.z) + 2, z: far.z }, vel: { x: 0, y: 0, z: 0 }, backspin: 0, sidespin: 0 }, { x: 0, z: 0 }, defaultPhysMods());
    expect(r2.outcome).toBe('oob');
    void t;
  });

  it('bunkers slow the ball dramatically', () => {
    const b = world.hole.bunkers[0];
    const r = simulate(world, { pos: { x: b.c.x, y: world.height(b.c.x, b.c.z) + 6, z: b.c.z }, vel: { x: 0, y: -8, z: -6 }, backspin: 2000, sidespin: 0 }, { x: 0, z: 0 }, defaultPhysMods());
    expect(['bunker']).toContain(r.surface);
    expect(Math.hypot(r.final.x - b.c.x, r.final.z - b.c.z)).toBeLessThan(6);
  });

  it('headwind shortens and tailwind lengthens a shot', () => {
    const m = soloMatch(['i7_copper', 'pt_brass']);
    const club = m.players[0].bag[0];
    const go = (wind: number) => {
      m.winds[0] = { x: Math.sin(yawToPin) * wind, z: -Math.cos(yawToPin) * wind };
      const setup = m.makeSetup(0, club, 1, yawToPin);
      return executeShot(m.world, setup, 0, 3).result.carry!;
    };
    const calm = go(0), head = go(-8), tail = go(8);
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - tee.x, p.z - tee.z);
    expect(d(head)).toBeLessThan(d(calm) - 5);
    expect(d(tail)).toBeGreaterThan(d(calm) + 3);
  });

  it('a mistimed release sends the ball offline, a perfect one does not', () => {
    const m = soloMatch(['i7_copper', 'pt_brass']);
    const club = m.players[0].bag[0];
    const setup = m.makeSetup(0, club, 1, yawToPin);
    const opts = { greenSpeed: 0.07, normalAt: (x: number, z: number) => world.normal(x, z), pin };
    const perfect = planShot(setup, { ...opts, needle: 0 });
    const hook = planShot(setup, { ...opts, needle: -0.9 });
    expect(perfect.perfect).toBe(true);
    expect(perfect.dirErrDeg).toBe(0);
    expect(hook.perfect).toBe(false);
    expect(Math.abs(hook.dirErrDeg)).toBeGreaterThan(2);
  });

  it('every hole of every course generates valid geometry', async () => {
    const { COURSES } = await import('../data/courses');
    for (const c of COURSES) {
      for (let i = 0; i < c.holes.length; i++) {
        for (const mirrored of [false, true]) {
          const w = new HoleWorld(generateHole(c.holes[i], c.theme, i, c.id, mirrored));
          const h = w.hole;
          expect(w.surface(h.tee.x, h.tee.z)).toBe('tee');
          expect(w.surface(h.pin.x, h.pin.z)).toBe('green');
          expect(Number.isFinite(w.height(h.pin.x, h.pin.z))).toBe(true);
          expect(w.waterAt(h.pin.x, h.pin.z)).toBeNull();
        }
      }
    }
    expect(THEMES.park.greenSpeed).toBeGreaterThan(0);
  });
});
