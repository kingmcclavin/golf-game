export interface V2 {
  x: number;
  z: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;
export const len2 = (x: number, z: number) => Math.sqrt(x * x + z * z);
export const len3 = (v: V3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
export const dist2 = (a: V2, b: V2) => len2(a.x - b.x, a.z - b.z);
export const dist3 = (a: V3, b: V3) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

/** Angle (yaw) for a direction on the ground. 0 = -Z (forward), positive turns right (+X). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, -dz);
export const dirOfYaw = (yaw: number): V2 => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/** Nearest point on polyline. Returns along-distance, signed lateral offset (+ right of travel), and segment info. */
export function projectOnPath(path: V2[], cum: number[], x: number, z: number) {
  let best = { along: 0, lateral: 0, dist: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
    const tc = clamp(t, 0, 1);
    const px = a.x + dx * tc;
    const pz = a.z + dz * tc;
    const d = len2(x - px, z - pz);
    if (d < best.dist) {
      const l = Math.sqrt(l2);
      // right-hand normal of direction (dx,dz) with forward = -z => right = (-dz, dx)/l
      const lat = ((x - a.x) * -dz + (z - a.z) * dx) / l;
      best = { along: cum[i] + t * l, lateral: lat, dist: d, seg: i, t };
      if (i === 0 && t < 0) best.along = t * l;
      else if (i === path.length - 2 && t > 1) best.along = cum[i] + t * l;
      else best.along = cum[i] + tc * l;
    }
  }
  return best;
}

export function cumulative(path: V2[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + dist2(path[i - 1], path[i]));
  return out;
}

/** Point along a polyline at distance s, plus unit tangent. */
export function pointAt(path: V2[], cum: number[], s: number) {
  let i = 0;
  while (i < path.length - 2 && cum[i + 1] < s) i++;
  const a = path[i];
  const b = path[i + 1];
  const l = cum[i + 1] - cum[i];
  const t = (s - cum[i]) / l;
  const tx = (b.x - a.x) / l;
  const tz = (b.z - a.z) / l;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz };
}

/** Smooth 2D value noise. */
export class Noise2 {
  private perm: Uint8Array;
  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private h(ix: number, iz: number) {
    return this.perm[(this.perm[ix & 255] + iz) & 511] / 255;
  }
  value(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = this.h(ix, iz);
    const b = this.h(ix + 1, iz);
    const c = this.h(ix, iz + 1);
    const d = this.h(ix + 1, iz + 1);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  }
  fbm(x: number, z: number, oct = 3): number {
    let amp = 1;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.value(x * f, z * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
}
