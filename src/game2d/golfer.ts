/**
 * Golfer swing rig in plain math (no 3D engine). Poses are keyframed from a real swing and solved
 * with two-bone IK; the 2D sprite renderer projects the resulting joints.
 *
 * Root frame: +x toward the ball, +y up, target along -z (the golfer's lead side).
 */
import { SUBTYPES, type ClubDef } from '../data/clubs';

export interface V { x: number; y: number; z: number }
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V, k: number): V => v(a.x * k, a.y * k, a.z * k);
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V) => Math.sqrt(dot(a, a));
const norm = (a: V): V => {
  const l = len(a) || 1;
  return mul(a, 1 / l);
};
const lerpV = (a: V, b: V, k: number): V => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
/** rotation about Y (three.js convention) */
const ry = (p: V, t: number): V => v(p.x * Math.cos(t) + p.z * Math.sin(t), p.y, -p.x * Math.sin(t) + p.z * Math.cos(t));
/** rotation about Z */
const rz = (p: V, t: number): V => v(p.x * Math.cos(t) - p.y * Math.sin(t), p.x * Math.sin(t) + p.y * Math.cos(t), p.z);

export interface Pose {
  hipsYaw: number;
  shoulderYaw: number;
  bend: number;
  headYaw: number;
  hands: V;
  shaft: V;
  legTurn: number;
  hipShift?: number;
  heel?: number;
}

/** Joint positions in the root frame (metres). */
export interface Skeleton {
  pelvis: V;
  chest: V;
  neck: V;
  head: V;
  headYaw: number;
  shoulderYaw: number;
  hipsYaw: number;
  shoulders: [V, V]; // lead, trail
  elbows: [V, V];
  hands: [V, V];
  hips: [V, V];
  knees: [V, V];
  ankles: [V, V];
  toes: [V, V];
  heels: [V, V];
  grip: V;
  clubHead: V;
}

const ARM_UPPER = 0.33;
const ARM_FORE = 0.32;
const LEG_UPPER = 0.47;
const LEG_LOWER = 0.46;
const LEAD_POLE = norm(v(-0.25, -1, -0.45));
const TRAIL_POLE = norm(v(-0.25, -1, 0.5));

function solveLimb(S: V, T: V, L1: number, L2: number, pole: V): { mid: V; end: V } {
  const d = sub(T, S);
  let dist = len(d);
  const dir = mul(d, 1 / (dist || 1));
  dist = Math.max(0.12, Math.min(L1 + L2 - 1e-4, dist));
  const end = add(S, mul(dir, dist));
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  if (dot(p, p) < 1e-6) p = v(0, -1, 0);
  p = norm(p);
  return { mid: add(add(S, mul(dir, a)), mul(p, h)), end };
}

export type SwingPhase = 'idle' | 'address' | 'backswing' | 'downswing' | 'follow' | 'finish' | 'celebrate' | 'sad';

export class Golfer {
  phase: SwingPhase = 'address';
  ballOffset = 0.9;
  clubLen = 0.95;
  putter = false;
  /** body proportions from the outfit's body style */
  widthMul = 1;
  private phaseT = 0;
  private back = 0;
  private swingFrom = 0;
  private followAmt = 1;
  private bend = -0.45;
  private time = Math.random() * 10;
  private onImpact: (() => void) | null = null;
  private autoTarget = 0;
  private autoCb: (() => void) | null = null;
  private current: Pose;
  club: ClubDef | null = null;

  constructor(club?: ClubDef) {
    if (club) this.setClub(club);
    this.current = this.addressPose();
  }

  setClub(def: ClubDef) {
    this.club = def;
    const st = SUBTYPES[def.subtype];
    this.clubLen = st.length;
    this.putter = def.category === 'putter';
    this.ballOffset = 0.38 + Math.sqrt(Math.max(0.05, st.length * st.length - 0.64)) * (this.putter ? 0.9 : 1);
  }

  // ------------------------------------------------------------------ control
  setBackswing(b: number) {
    if (this.phase !== 'address' && this.phase !== 'backswing' && this.phase !== 'idle') return;
    this.phase = b > 0.01 ? 'backswing' : 'address';
    this.back = Math.max(0, Math.min(1.12, b));
  }

  swing(onImpact: () => void, power = 1) {
    this.onImpact = onImpact;
    this.swingFrom = Math.max(this.back, 0.12);
    this.followAmt = this.putter ? 0.45 + Math.min(1, power) * 0.5 : Math.max(0.45, Math.min(1, 0.3 + power * 0.75));
    this.phase = 'downswing';
    this.phaseT = 0;
  }

  /** Bots wind up automatically before swinging. */
  autoSwing(power: number, onImpact: () => void) {
    this.phase = 'backswing';
    this.phaseT = 0;
    this.autoTarget = power;
    this.autoCb = onImpact;
  }

  react(kind: 'celebrate' | 'sad') {
    this.phase = kind;
    this.phaseT = 0;
  }

  reset() {
    this.phase = 'address';
    this.back = 0;
    this.phaseT = 0;
    this.onImpact = null;
    this.autoCb = null;
  }

  /** Static pose for previews: t in -1..0 is follow-through (as -t), 0..1.12 backswing. */
  posePreview(kind: 'address' | 'back' | 'follow', t = 0) {
    this.phase = 'finish';
    this.current = kind === 'address' ? this.addressPose() : kind === 'back' ? this.sample(this.backKeys(), t) : this.sample(this.followKeys(), t);
  }

  // ------------------------------------------------------------------ keyframes
  private ballPos(): V {
    return v(this.ballOffset, 0.03, 0);
  }

  private addressPose(): Pose {
    const hands = v(0.38, 0.82, 0);
    return { hipsYaw: 0, shoulderYaw: 0, bend: this.bend, headYaw: 0, hands, shaft: norm(sub(this.ballPos(), hands)), legTurn: 0 };
  }

  private impactPose(): Pose {
    const hands = v(0.41, 0.84, -0.06);
    return { hipsYaw: 0.5, shoulderYaw: 0.22, bend: this.bend + 0.03, headYaw: -0.22, hands, shaft: norm(sub(this.ballPos(), hands)), legTurn: 0.4, hipShift: -0.04, heel: 0.1 };
  }

  private backKeys(): Array<[number, Pose]> {
    const P = (h: number, s: number, hands: [number, number, number], shaft: [number, number, number], leg = 0): Pose => ({
      hipsYaw: h, shoulderYaw: s, bend: this.bend, headYaw: -s * 0.85, hands: v(...hands), shaft: norm(v(...shaft)), legTurn: leg,
    });
    return [
      [0, this.addressPose()],
      [0.3, P(-0.16, -0.55, [0.37, 0.9, 0.3], [0.12, -0.18, 1])],
      [0.62, P(-0.45, -1.18, [0.24, 1.2, 0.44], [0.12, 1, 0.22], -0.12)],
      [1.0, P(-0.78, -1.62, [0.12, 1.88, 0.26], [-0.22, 0.14, -1], -0.22)],
      [1.12, P(-0.85, -1.8, [0.08, 1.9, 0.22], [-0.3, -0.25, -0.92], -0.26)],
    ];
  }

  private followKeys(): Array<[number, Pose]> {
    const P = (h: number, s: number, bend: number, head: number, hands: [number, number, number], shaft: [number, number, number], leg: number): Pose => ({
      hipsYaw: h, shoulderYaw: s, bend, headYaw: head, hands: v(...hands), shaft: norm(v(...shaft)), legTurn: leg,
    });
    return [
      [0, this.impactPose()],
      [0.3, { ...P(0.95, 0.95, -0.36, -0.55, [0.35, 0.98, -0.38], [0.12, 0.02, -1], 0.75), hipShift: -0.08, heel: 0.35 }],
      [0.62, { ...P(1.3, 1.5, -0.24, -0.5, [0.12, 1.42, -0.48], [0.0, 1, -0.25], 1.0), hipShift: -0.13, heel: 0.75 }],
      [1.0, { ...P(1.55, 1.95, -0.06, 0, [-0.22, 1.74, -0.2], [-0.5, -0.5, 0.7], 1.2), hipShift: -0.16, heel: 1 }],
    ];
  }

  private sample(keys: Array<[number, Pose]>, t: number): Pose {
    t = Math.max(keys[0][0], Math.min(keys[keys.length - 1][0], t));
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)][1], k1 = keys[i][1], k2 = keys[i + 1][1], k3 = keys[Math.min(keys.length - 1, i + 2)][1];
    const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0] || 1);
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    const cv = (f: (p: Pose) => V) => v(cr(f(k0).x, f(k1).x, f(k2).x, f(k3).x), cr(f(k0).y, f(k1).y, f(k2).y, f(k3).y), cr(f(k0).z, f(k1).z, f(k2).z, f(k3).z));
    return {
      hipsYaw: cr(k0.hipsYaw, k1.hipsYaw, k2.hipsYaw, k3.hipsYaw),
      shoulderYaw: cr(k0.shoulderYaw, k1.shoulderYaw, k2.shoulderYaw, k3.shoulderYaw),
      bend: cr(k0.bend, k1.bend, k2.bend, k3.bend),
      headYaw: cr(k0.headYaw, k1.headYaw, k2.headYaw, k3.headYaw),
      hands: cv((p) => p.hands),
      shaft: norm(cv((p) => p.shaft)),
      legTurn: cr(k0.legTurn, k1.legTurn, k2.legTurn, k3.legTurn),
      hipShift: cr(k0.hipShift ?? 0, k1.hipShift ?? 0, k2.hipShift ?? 0, k3.hipShift ?? 0),
      heel: Math.max(0, cr(k0.heel ?? 0, k1.heel ?? 0, k2.heel ?? 0, k3.heel ?? 0)),
    };
  }

  private mixPose(a: Pose, b: Pose, k: number): Pose {
    const l = (x: number, y: number) => x + (y - x) * k;
    return {
      hipsYaw: l(a.hipsYaw, b.hipsYaw), shoulderYaw: l(a.shoulderYaw, b.shoulderYaw), bend: l(a.bend, b.bend), headYaw: l(a.headYaw, b.headYaw),
      hands: lerpV(a.hands, b.hands, k), shaft: norm(lerpV(a.shaft, b.shaft, k)), legTurn: l(a.legTurn, b.legTurn),
      hipShift: l(a.hipShift ?? 0, b.hipShift ?? 0), heel: l(a.heel ?? 0, b.heel ?? 0),
    };
  }

  /** Putting stroke: shoulders rock, wrists stay quiet. b > 0 back, b < 0 through. */
  private puttPose(b: number): Pose {
    const hands = v(0.38, 0.82 + Math.abs(b) * 0.025, b * 0.17);
    const head = add(this.ballPos(), v(0, Math.abs(b) * 0.04, b * 0.34));
    return { hipsYaw: 0, shoulderYaw: -b * 0.22, bend: this.bend, headYaw: b * 0.18, hands, shaft: norm(sub(head, hands)), legTurn: 0 };
  }

  private downPose(e: number): Pose {
    // hips start the downswing, then the shoulders and arms follow into impact
    const b = this.swingFrom * (1 - e * e * (3 - 2 * e));
    const from = this.sample(this.backKeys(), b);
    const imp = this.impactPose();
    const pose = this.mixPose(from, imp, Math.pow(e, 2.2));
    pose.hipsYaw = from.hipsYaw + (imp.hipsYaw - from.hipsYaw) * Math.min(1, e * 1.6);
    return pose;
  }

  // ------------------------------------------------------------------ animation
  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case 'idle':
      case 'address': {
        const p = this.putter ? this.puttPose(0) : this.addressPose();
        p.hands = add(p.hands, v(0, 0, Math.sin(this.time * 1.6) * 0.01));
        p.shoulderYaw += Math.sin(this.time * 1.6) * 0.015;
        this.current = p;
        break;
      }
      case 'backswing': {
        if (this.autoCb) {
          const target = Math.min(1.05, this.autoTarget);
          const dur = this.putter ? 0.6 : 0.9;
          const k = Math.min(1, this.phaseT / dur);
          this.back = target * (1 - (1 - k) * (1 - k));
          if (this.phaseT > dur + 0.15) {
            const cb = this.autoCb;
            this.autoCb = null;
            this.swing(cb, target);
          }
        }
        this.current = this.putter ? this.puttPose(this.back) : this.sample(this.backKeys(), this.back);
        break;
      }
      case 'downswing': {
        const dur = this.putter ? 0.3 : 0.24;
        const k = Math.min(1, this.phaseT / dur);
        this.current = this.putter ? this.puttPose(this.swingFrom * (1 - k)) : this.downPose(k);
        if (k >= 1) {
          this.phase = 'follow';
          this.phaseT = 0;
          const cb = this.onImpact;
          this.onImpact = null;
          cb?.();
        }
        break;
      }
      case 'follow': {
        const dur = this.putter ? 0.45 : 0.6;
        const k = Math.min(1, this.phaseT / dur);
        const e = 1 - Math.pow(1 - k, 2.4);
        this.current = this.putter ? this.puttPose(-this.followAmt * e) : this.sample(this.followKeys(), this.followAmt * e);
        if (k >= 1) {
          this.phase = 'finish';
          this.phaseT = 0;
        }
        break;
      }
      case 'finish':
        break;
      case 'celebrate': {
        const k = Math.min(1, this.phaseT / 0.3);
        const hop = Math.abs(Math.sin(this.phaseT * 8)) * 0.05 * k;
        const up: Pose = { hipsYaw: 0.3, shoulderYaw: 0.4, bend: -0.1, headYaw: -0.2, hands: v(0.28, 1.85 + hop, -0.05), shaft: norm(v(0.1, 1, -0.3)), legTurn: 0.3 };
        this.current = this.mixPose(this.sample(this.followKeys(), this.followAmt), up, k);
        break;
      }
      case 'sad': {
        const k = Math.min(1, this.phaseT / 0.4);
        const down: Pose = { hipsYaw: 0.2, shoulderYaw: 0.15, bend: -0.6, headYaw: Math.sin(this.time * 3) * 0.25, hands: v(0.36, 0.72, 0), shaft: norm(v(0.35, -1, 0.05)), legTurn: 0.1 };
        this.current = this.mixPose(this.sample(this.followKeys(), this.followAmt), down, k);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ solve
  skeleton(): Skeleton {
    const p = this.current;
    const w = this.widthMul;
    const shift = p.hipShift ?? 0;
    const pelvis = v(0, 0.95 - Math.abs(shift) * 0.25, shift);
    const twist = p.shoulderYaw - p.hipsYaw;
    // spine: twist about its own axis, tilt forward, then turn with the hips
    const spine = (q: V) => add(pelvis, ry(rz(ry(q, twist), p.bend), p.hipsYaw));
    const shL = spine(v(0, 0.5, -0.2 * w));
    const shT = spine(v(0, 0.5, 0.2 * w));
    const chest = spine(v(0, 0.42, 0));
    const neck = spine(v(0, 0.64, 0));
    const head = spine(v(0.06, 0.8, 0));

    const L = solveLimb(shL, p.hands, ARM_UPPER, ARM_FORE, LEAD_POLE);
    const T = solveLimb(shT, add(L.end, mul(p.shaft, 0.075)), ARM_UPPER, ARM_FORE, TRAIL_POLE);
    const grip = sub(L.end, mul(p.shaft, 0.05));
    const clubHead = add(grip, mul(p.shaft, this.clubLen));

    const legs = [-1, 1].map((side) => {
      const trail = side === 1;
      const heelLift = trail ? p.heel ?? 0 : 0;
      const footYaw = trail ? Math.max(0, p.legTurn) * 0.55 : Math.max(0, p.legTurn) * 0.15;
      const toe = v(0.23, 0, side * (0.11 * w + 0.1));
      const foot = (q: V) => add(toe, ry(rz(q, -heelLift * 0.95), footYaw));
      const ankle = foot(v(-0.2, 0.07, 0));
      const heel = foot(v(-0.28, 0.0, 0));
      const hip = add(pelvis, ry(v(0, 0, side * 0.11 * w), p.hipsYaw));
      const pole = norm(v(1, 0, trail ? -Math.max(0, p.legTurn) * 0.9 : -p.legTurn * 0.6));
      const s = solveLimb(hip, ankle, LEG_UPPER, LEG_LOWER, pole);
      return { hip, knee: s.mid, ankle: s.end, toe, heel };
    });

    return {
      pelvis, chest, neck, head,
      headYaw: p.headYaw + p.shoulderYaw,
      shoulderYaw: p.shoulderYaw,
      hipsYaw: p.hipsYaw,
      shoulders: [shL, shT],
      elbows: [L.mid, T.mid],
      hands: [L.end, T.end],
      hips: [legs[0].hip, legs[1].hip],
      knees: [legs[0].knee, legs[1].knee],
      ankles: [legs[0].ankle, legs[1].ankle],
      toes: [legs[0].toe, legs[1].toe],
      heels: [legs[0].heel, legs[1].heel],
      grip,
      clubHead,
    };
  }
}
