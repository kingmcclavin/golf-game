import { RNG } from '../core/rng';
import type { V2, V3 } from '../core/math';
import type { HoleWorld } from './world';
import type { Surface } from './types';

export const BALL_R = 0.0214;
export const CUP_R = 0.06;
const G = 9.81;
const K_AERO = 0.0191; // 0.5 * rho * A / m
const CD = 0.24;
export const DT = 1 / 240;
export const FRAME_DT = 1 / 120;
export const GREEN_SLOPE = 0.5;

export interface PhysMods {
  windMul: number;
  liftMul: number;
  rollMul: number;
  bounceMul: number;
  slopeMul: number;
  cupRadiusMul: number;
  lipCaptureMul: number;
  waterSkips: number;
  canopyPass: number;
  homing: number;
  homingTarget?: V2;
  pinMagnet: number;
  checkMul: number;
}

export const defaultPhysMods = (): PhysMods => ({
  windMul: 1,
  liftMul: 1,
  rollMul: 1,
  bounceMul: 1,
  slopeMul: 1,
  cupRadiusMul: 1,
  lipCaptureMul: 1,
  waterSkips: 0,
  canopyPass: 0,
  homing: 0,
  pinMagnet: 0,
  checkMul: 1,
});

export interface Launch {
  pos: V3;
  vel: V3;
  /** rpm, backspin positive */
  backspin: number;
  /** rpm, positive curves right (fade/slice) */
  sidespin: number;
  putt?: boolean;
}

export type Outcome = 'rest' | 'holed' | 'water' | 'oob';

export interface SimEvent {
  t: number;
  type: 'land' | 'bounce' | 'tree' | 'rock' | 'lip' | 'holed' | 'water' | 'skip' | 'sand';
  x: number;
  y: number;
  z: number;
}

export interface SimResult {
  frames: Float32Array;
  frameCount: number;
  duration: number;
  final: V3;
  surface: Surface;
  outcome: Outcome;
  carry: V3 | null;
  carrySurface: Surface | null;
  apex: number;
  events: SimEvent[];
  /** for water hazards: a dry drop location close to where the ball entered */
  dropPoint: V3 | null;
}

export interface SimOptions {
  record?: boolean;
  maxTime?: number;
  seed?: number;
  /** stop after the first ground contact (used for previews) */
  stopAtLanding?: boolean;
}

/** Vector math helpers kept inline for speed. */
export function simulate(world: HoleWorld, launch: Launch, wind: V2, mods: PhysMods, opts: SimOptions = {}): SimResult {
  const record = opts.record ?? true;
  const maxTime = opts.maxTime ?? 30;
  const rng = new RNG(opts.seed ?? 12345);
  const hole = world.hole;
  const pin = hole.pin;

  let px = launch.pos.x, py = launch.pos.y, pz = launch.pos.z;
  let vx = launch.vel.x, vy = launch.vel.y, vz = launch.vel.z;
  let back = (launch.backspin * 2 * Math.PI) / 60;
  let side = (launch.sidespin * 2 * Math.PI) / 60;
  const hl = Math.hypot(vx, vz) || 1;
  // spin axis: right vector of initial heading (horizontal)
  const rx = -vz / hl, rz = vx / hl;

  const maxFrames = Math.ceil(maxTime / FRAME_DT) + 40;
  const frames = record ? new Float32Array(maxFrames * 3) : new Float32Array(0);
  let fc = 0;
  const push = (x: number, y: number, z: number) => {
    if (!record || fc >= maxFrames) return;
    frames[fc * 3] = x; frames[fc * 3 + 1] = y; frames[fc * 3 + 2] = z;
    fc++;
  };
  push(px, py, pz);

  const events: SimEvent[] = [];
  let grounded = !!launch.putt;
  let landed = !!launch.putt;
  let carry: V3 | null = null;
  let carrySurface: Surface | null = null;
  let apex = py;
  let outcome: Outcome = 'rest';
  let t = 0;
  let step = 0;
  let restTimer = 0;
  let inCup = false;
  let skips = mods.waterSkips;
  const visited = new Set<number>();
  let lastDry: V3 = { x: px, y: py, z: pz };
  let lastDryT = 0;
  const cupR = CUP_R * mods.cupRadiusMul;

  while (t < maxTime) {
    t += DT;
    step++;
    const gy = world.height(px, pz);
    const onGround = py - BALL_R <= gy + 0.004;

    // ---- forces
    let ax = 0, ay = -G, az = 0;
    if (!onGround || !grounded) {
      const hAbove = Math.max(0, py - gy);
      const wf = mods.windMul * Math.min(1, 0.55 + hAbove / 25);
      const rvx = vx - wind.x * wf, rvy = vy, rvz = vz - wind.z * wf;
      const sp = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      if (sp > 0.01) {
        const drag = K_AERO * CD * sp;
        ax -= drag * rvx; ay -= drag * rvy; az -= drag * rvz;
        // magnus: omega = back*R + (-side)*Up
        const wx = back * rx, wy = -side, wz = back * rz;
        const wmag = Math.sqrt(wx * wx + wy * wy + wz * wz);
        // Lift uses ground-relative velocity (keeps the flight shape stable in wind; drag carries the wind effect)
        const gsp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (wmag > 1 && gsp > 0.01) {
          const S = (BALL_R * wmag) / gsp;
          const CL = Math.min(0.3, 0.05 + 1.2 * S) * mods.liftMul;
          // direction omega_hat x v_hat
          let cx = wy * vz - wz * vy;
          let cy = wz * vx - wx * vz;
          let cz = wx * vy - wy * vx;
          const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
          const mag = (K_AERO * CL * gsp * gsp) / cl;
          cx *= mag; cy *= mag; cz *= mag;
          ax += cx; ay += cy; az += cz;
        }
        if (mods.homing > 0 && mods.homingTarget && vy < 0 && !landed) {
          // gentle steering of the horizontal velocity toward the target line
          const tx = mods.homingTarget.x - px, tz = mods.homingTarget.z - pz;
          const tl = Math.hypot(tx, tz) || 1;
          const hs = Math.hypot(vx, vz) || 1;
          const latx = tx / tl - vx / hs, latz = tz / tl - vz / hs;
          ax += latx * mods.homing * hs * 0.6;
          az += latz * mods.homing * hs * 0.6;
        }
      }
      back *= 1 - DT / 22;
      side *= 1 - DT / 22;
    }

    vx += ax * DT; vy += ay * DT; vz += az * DT;
    let nx = px + vx * DT, ny = py + vy * DT, nz = pz + vz * DT;

    // ---- water
    const wl = world.waterAt(nx, nz);
    if (wl !== null && ny - BALL_R < wl && world.height(nx, nz) < wl) {
      const hs = Math.hypot(vx, vz);
      if (skips > 0 && !grounded && vy < 0 && Math.abs(vy) < hs * 0.6 && hs > 12) {
        skips--;
        vy = Math.abs(vy) * 0.45;
        vx *= 0.7; vz *= 0.7;
        ny = wl + BALL_R;
        events.push({ t, type: 'skip', x: nx, y: ny, z: nz });
      } else {
        px = nx; py = wl; pz = nz;
        push(px, py, pz);
        events.push({ t, type: 'water', x: px, y: py, z: pz });
        outcome = 'water';
        if (!carry) { carry = { x: px, y: py, z: pz }; carrySurface = 'water'; }
        break;
      }
    }

    // ---- trees and rocks
    const near = world.nearby(nx, nz);
    if (near) {
      for (const id of near) {
        if (id >= 0) {
          const tr = hole.trees[id];
          const dx = nx - tr.x, dz = nz - tr.z;
          const dh = Math.sqrt(dx * dx + dz * dz);
          const base = world.height(tr.x, tr.z);
          // trunk
          if (dh < tr.trunkR + BALL_R && ny < base + tr.canopyY * 0.75) {
            const nnx = dx / (dh || 1), nnz = dz / (dh || 1);
            const vn = vx * nnx + vz * nnz;
            if (vn < 0) {
              vx -= 1.45 * vn * nnx; vz -= 1.45 * vn * nnz;
              nx = tr.x + nnx * (tr.trunkR + BALL_R + 0.01);
              nz = tr.z + nnz * (tr.trunkR + BALL_R + 0.01);
              events.push({ t, type: 'tree', x: nx, y: ny, z: nz });
              back *= 0.3; side *= 0.3;
            }
          }
          // canopy
          const cy = base + tr.canopyY;
          const dy = ny - cy;
          const inside = dh * dh + dy * dy * (tr.kind === 'pine' || tr.kind === 'cypress' ? 0.45 : 1) < tr.canopyR * tr.canopyR;
          if (inside && !visited.has(id)) {
            visited.add(id);
            if (rng.next() >= mods.canopyPass) {
              const damp = rng.range(0.18, 0.42);
              vx = vx * damp + rng.range(-1.5, 1.5);
              vz = vz * damp + rng.range(-1.5, 1.5);
              vy = vy * damp * 0.5 - rng.range(0, 1.5);
              back *= 0.2; side *= 0.2;
              events.push({ t, type: 'tree', x: nx, y: ny, z: nz });
            }
          } else if (!inside && visited.has(id) && dh > tr.canopyR + 1) {
            visited.delete(id);
          }
        } else {
          const rk = hole.rocks[-id - 1];
          const base = world.height(rk.x, rk.z);
          const cx = rk.x, cy = base + rk.r * 0.25, cz = rk.z;
          const dx = nx - cx, dy = ny - cy, dz = nz - cz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < rk.r + BALL_R) {
            const nnx = dx / d, nny = dy / d, nnz = dz / d;
            const vn = vx * nnx + vy * nny + vz * nnz;
            if (vn < 0) {
              vx -= 1.5 * vn * nnx; vy -= 1.5 * vn * nny; vz -= 1.5 * vn * nnz;
              vx *= 0.8; vz *= 0.8;
              events.push({ t, type: 'rock', x: nx, y: ny, z: nz });
            }
            nx = cx + nnx * (rk.r + BALL_R + 0.005);
            ny = cy + nny * (rk.r + BALL_R + 0.005);
            nz = cz + nnz * (rk.r + BALL_R + 0.005);
          }
        }
      }
    }

    // ---- ground
    const h = world.height(nx, nz);
    if (ny - BALL_R < h) {
      const n = world.normal(nx, nz);
      const surf = world.surface(nx, nz);
      const sp = world.surfaceProps(surf);
      ny = h + BALL_R;
      const vn = vx * n.x + vy * n.y + vz * n.z;
      if (vn < 0) {
        // tangential part
        let tx = vx - vn * n.x, ty = vy - vn * n.y, tz = vz - vn * n.z;
        const impact = -vn;
        if (!landed) {
          landed = true;
          carry = { x: nx, y: ny, z: nz };
          carrySurface = surf;
          events.push({ t, type: surf === 'bunker' || surf === 'waste' ? 'sand' : 'land', x: nx, y: ny, z: nz });
          if (opts.stopAtLanding) { px = nx; py = ny; pz = nz; push(px, py, pz); break; }
          // dunk
          if (Math.hypot(nx - pin.x, nz - pin.z) < cupR * 1.3 && Math.hypot(vx, vz) < 22) {
            px = pin.x; pz = pin.z; py = h - 0.06;
            push(px, py, pz);
            outcome = 'holed';
            events.push({ t, type: 'holed', x: px, y: py, z: pz });
            break;
          }
        }
        if (impact > 2.0) {
          // bounce: Coulomb friction during impact, limited by the rolling condition (Penner-style)
          const e = Math.min(0.6, sp.restitution * mods.bounceMul) * (impact > 25 ? 0.75 : 1);
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
          const wr = back * BALL_R * sp.spinGrip * mods.checkMul;
          const dv = Math.min(sp.impactFriction * (1 + e) * impact, (2 / 7) * (tl + wr));
          let tlNew = tl - dv;
          const minT = surf === 'green' || surf === 'fringe' ? -1.5 : -0.3;
          tlNew = Math.max(minT, tlNew);
          const sc = tlNew / tl;
          tx *= sc; ty *= sc; tz *= sc;
          vx = tx + e * impact * n.x;
          vy = ty + e * impact * n.y;
          vz = tz + e * impact * n.z;
          back *= 0.6; side *= 0.2;
          if (events.length < 60 && impact > 2.5) events.push({ t, type: 'bounce', x: nx, y: ny, z: nz });
          grounded = false;
        } else {
          // rolling contact. On the first touchdown the ball skids until it reaches the
          // rolling condition; residual backspin bites here ("check").
          if (!grounded) {
            const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
            if (tl > 0.01) {
              const wr = back * BALL_R * sp.spinGrip * mods.checkMul;
              let tlNew = tl - 0.42 * (tl + wr);
              tlNew = Math.max(surf === 'green' || surf === 'fringe' ? -1.2 : 0, tlNew);
              const sc = tlNew / tl;
              tx *= sc; ty *= sc; tz *= sc;
            }
          }
          vx = tx; vy = ty; vz = tz;
          grounded = true;
          back = 0; side = 0;
        }
      }
      if (grounded) {
        // slope reduction (putting ability) and roll friction
        if (surf === 'green') {
          // greens: soften gravity's along-slope pull so breaks stay readable
          // g tangential = g - (g.n) n with g = (0,-G,0)
          const gtx = G * n.y * n.x, gty = -G + G * n.y * n.y, gtz = G * n.y * n.z;
          const k = (1 - GREEN_SLOPE * mods.slopeMul) * DT;
          vx -= gtx * k; vy -= gty * k; vz -= gtz * k;
        }
        if (surf === 'green' && mods.pinMagnet > 0) {
          const dx = pin.x - nx, dz = pin.z - nz;
          const d = Math.hypot(dx, dz);
          if (d < 4 && d > 0.01) { vx += (dx / d) * mods.pinMagnet * DT; vz += (dz / d) * mods.pinMagnet * DT; }
        }
        const spd = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const decel = (sp.roll / mods.rollMul) * G * n.y * DT;
        if (spd <= decel) {
          vx = 0; vy = 0; vz = 0;
        } else {
          const k = (spd - decel) / spd;
          vx *= k; vy *= k; vz *= k;
        }
        // cup
        const dcx = nx - pin.x, dcz = nz - pin.z;
        const dc = Math.sqrt(dcx * dcx + dcz * dcz);
        if (dc < cupR && (surf === 'green' || surf === 'fringe')) {
          const hs = Math.hypot(vx, vz);
          const vcap = (1.35 * Math.sqrt(Math.max(0, 1 - (dc / cupR) ** 2)) + 0.3) * mods.lipCaptureMul;
          if (hs < vcap) {
            // drop into the cup
            for (let i = 1; i <= 10; i++) {
              const k = i / 10;
              push(nx + (pin.x - nx) * k, ny - 0.07 * k * k, nz + (pin.z - nz) * k);
            }
            px = pin.x; py = h - 0.07; pz = pin.z;
            outcome = 'holed';
            events.push({ t, type: 'holed', x: px, y: py, z: pz });
            break;
          } else if (!inCup) {
            inCup = true;
            const sideSign = Math.sign(dcx * vz - dcz * vx) || 1;
            const ang = sideSign * 0.5 * (dc / cupR + 0.25);
            const c = Math.cos(ang), s = Math.sin(ang);
            const nvx = (vx * c - vz * s) * 0.72, nvz = (vx * s + vz * c) * 0.72;
            vx = nvx; vz = nvz;
            vy = Math.min(0.4, hs * 0.08);
            events.push({ t, type: 'lip', x: nx, y: ny, z: nz });
          }
        } else if (dc > cupR + 0.02) {
          inCup = false;
        }
        // rest check
        const spd2 = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (spd2 < 0.035) {
          const gt = G * Math.sqrt(Math.max(0, 1 - n.y * n.y)) * (surf === 'green' ? GREEN_SLOPE * mods.slopeMul : 1);
          const stat = Math.max(sp.roll * 1.25, 0.07) * G;
          if (gt < stat) {
            restTimer += DT;
            vx = 0; vy = 0; vz = 0;
            if (restTimer > 0.05) {
              px = nx; py = ny; pz = nz;
              push(px, py, pz);
              break;
            }
          }
        } else restTimer = 0;
      }
    }

    px = nx; py = ny; pz = nz;
    if (py > apex) apex = py;
    if (world.waterAt(px, pz) === null && grounded) {
      lastDry = { x: px, y: py, z: pz };
      lastDryT = t;
    }
    if (step % 2 === 0) push(px, py, pz);
    // flew way out of bounds
    if (py < -80 || Math.abs(px) > 3000 || Math.abs(pz) > 3000) { outcome = 'oob'; break; }
  }

  const surface: Surface = outcome === 'water' ? 'water' : world.surface(px, pz);
  if (outcome === 'rest' && surface === 'oob') outcome = 'oob';
  let dropPoint: V3 | null = null;
  if (outcome === 'water') dropPoint = findDrop(world, launch.pos, { x: px, y: py, z: pz }, lastDryT > 0 ? lastDry : null);
  return {
    frames: record ? frames.subarray(0, fc * 3) : frames,
    frameCount: fc,
    duration: t,
    final: { x: px, y: py, z: pz },
    surface,
    outcome,
    carry,
    carrySurface,
    apex,
    events,
    dropPoint,
  };
}

/** Lateral-relief style drop: walk back from the splash toward the shot origin until dry, playable ground. */
export function findDrop(world: HoleWorld, origin: V3, splash: V3, _lastDry: V3 | null): V3 {
  const dx = origin.x - splash.x, dz = origin.z - splash.z;
  const L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  for (let s = 1; s < L; s += 1) {
    const x = splash.x + ux * s, z = splash.z + uz * s;
    if (world.waterAt(x, z) === null) {
      const x2 = x + ux * 2.5, z2 = z + uz * 2.5;
      const surf = world.surface(x2, z2);
      if (surf !== 'water' && surf !== 'oob' && world.waterAt(x2, z2) === null) return { x: x2, y: world.height(x2, z2) + BALL_R, z: z2 };
    }
  }
  // fall back to the nearest dry spot around the splash, preferring points nearer the origin
  for (let r = 2; r < 80; r += 2) {
    let best: V3 | null = null;
    let bestD = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = splash.x + Math.cos(a) * r, z = splash.z + Math.sin(a) * r;
      const surf = world.surface(x, z);
      if (surf === 'water' || surf === 'oob' || world.waterAt(x, z) !== null) continue;
      const d = Math.hypot(x - origin.x, z - origin.z);
      if (d < bestD) { bestD = d; best = { x, y: world.height(x, z) + BALL_R, z }; }
    }
    if (best) return best;
  }
  return { x: origin.x, y: origin.y, z: origin.z };
}

/** Pure flight over a flat plane with no wind: returns carry distance in meters (used for club calibration). */
export function flatCarry(speed: number, launchDeg: number, backspinRpm: number, liftMul = 1): number {
  const a = (launchDeg * Math.PI) / 180;
  let vx = 0, vy = speed * Math.sin(a), vz = -speed * Math.cos(a);
  let px = 0, py = 0.03, pz = 0;
  let back = (backspinRpm * 2 * Math.PI) / 60;
  for (let i = 0; i < 6000; i++) {
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const drag = K_AERO * CD * sp;
    let ax = -drag * vx, ay = -G - drag * vy, az = -drag * vz;
    // omega = back * R with R = (1,0,0) for heading -z
    const S = (BALL_R * back) / sp;
    const CL = Math.min(0.3, 0.05 + 1.2 * S) * liftMul;
    // (1,0,0) x v = (0, -vz, vy)
    const cy = -vz, cz = vy;
    const cl = Math.sqrt(cy * cy + cz * cz) || 1;
    const mag = (K_AERO * CL * sp * sp) / cl;
    ay += cy * mag; az += cz * mag;
    back *= 1 - DT / 22;
    vx += ax * DT; vy += ay * DT; vz += az * DT;
    px += vx * DT; py += vy * DT; pz += vz * DT;
    if (py < 0 && vy < 0) return Math.hypot(px, pz);
  }
  return Math.hypot(px, pz);
}

/** Find launch speed giving a target flat carry (binary search). */
export function speedForCarry(target: number, launchDeg: number, backspinRpm: number, liftMul = 1): number {
  let lo = 2, hi = 95;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (flatCarry(mid, launchDeg, backspinRpm, liftMul) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
