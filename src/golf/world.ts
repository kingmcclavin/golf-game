import { Noise2, clamp, dist2, projectOnPath, smoothstep, type V3 } from '../core/math';
import { RNG } from '../core/rng';
import { ellipseN, makeRock, makeTree } from './holeGen';
import type { HoleLayout, Rock, Surface, Tree } from './types';

export interface SurfaceProps {
  restitution: number;
  impactFriction: number;
  roll: number;
  spinGrip: number;
}

export const OCEAN_LEVEL = -14;
const SURF_IDS: Surface[] = ['tee', 'fairway', 'rough', 'deepRough', 'green', 'fringe', 'bunker', 'waste', 'water', 'oob'];

/**
 * Analytic description of a single hole's terrain. Everything here is pure math so it can be
 * used both by the renderer (to build meshes/textures) and by the physics simulation / AI
 * in Node tests.
 */
export class HoleWorld {
  readonly noise: Noise2;
  readonly edgeNoise: Noise2;
  private treeGrid = new Map<number, number[]>();
  readonly cellSize = 12;

  // lazily-filled lookup grids (physics hot path)
  private gx0: number;
  private gz0: number;
  private gw: number;
  private gh: number;
  private hGrid: Float32Array;
  private sGrid: Uint8Array;
  private wGrid: Uint8Array;
  static readonly HRES = 0.5;

  constructor(public readonly hole: HoleLayout) {
    this.noise = new Noise2(hole.seed);
    this.edgeNoise = new Noise2(hole.seed ^ 0x5bd1e995);
    // water levels relative to surrounding terrain
    for (const w of hole.water) {
      w.level = this.baseHeight(w.c.x, w.c.z, false) - 0.6;
    }
    const b = hole.bbox;
    this.gx0 = b.minX;
    this.gz0 = b.minZ;
    this.gw = Math.ceil((b.maxX - b.minX) / HoleWorld.HRES) + 2;
    this.gh = Math.ceil((b.maxZ - b.minZ) / HoleWorld.HRES) + 2;
    this.hGrid = new Float32Array(this.gw * this.gh).fill(NaN);
    this.sGrid = new Uint8Array(this.gw * this.gh).fill(255);
    this.wGrid = new Uint8Array(this.gw * this.gh).fill(255);
    if (hole.trees.length === 0) this.populate();
    this.buildGrid();
  }

  // ---------------------------------------------------------------- heights
  private profileAt(s: number): number {
    const p = this.hole.heights.profile;
    if (s <= p[0][0]) return p[0][1];
    for (let i = 0; i < p.length - 1; i++) {
      if (s <= p[i + 1][0]) {
        const t = smoothstep(p[i][0], p[i + 1][0], s);
        return p[i][1] + (p[i + 1][1] - p[i][1]) * t;
      }
    }
    return p[p.length - 1][1];
  }

  fairwayHalfAt(along: number): number {
    const h = this.hole;
    const taper = 1 - 0.28 * smoothstep(h.pathLen - 90, h.pathLen - 15, along);
    return h.fairwayHalf * taper * (1 + 0.16 * this.edgeNoise.value(along / 28, 3.7));
  }

  /** Terrain height before water carving. */
  private baseHeight(x: number, z: number, carve = true): number {
    const h = this.hole;
    const t = h.theme;
    const pr = projectOnPath(h.path, h.cum, x, z);
    const lat = Math.abs(pr.lateral);
    let y = this.profileAt(pr.along);
    // framing rise outside the corridor
    const out = Math.max(0, lat - h.fairwayHalf - 6) / 30;
    y += t.lateralRise * Math.min(out * out, 7);
    // noise
    const n = this.noise.fbm(x / t.noiseScale, z / t.noiseScale, 3) * t.noiseAmp;
    y += n;
    for (const hl of h.hills) {
      const d = dist2(hl.c, { x, z });
      if (d < hl.r * 2.5) y += hl.h * Math.exp(-((d / hl.r) ** 2));
    }
    // ocean cliff
    if (t.ocean) {
      const sideLat = pr.lateral * t.ocean.side * (h.mirrored ? -1 : 1);
      const k = smoothstep(t.ocean.offset, t.ocean.offset + 14, sideLat);
      if (k > 0) y = y * (1 - k) + (OCEAN_LEVEL - 6) * k;
    }
    // tee box: flat
    const teeD = this.teeBoxN(x, z);
    if (teeD < 2) {
      const k = smoothstep(2, 1, teeD);
      y = y * (1 - k) + (h.heights.tee + 0.25) * k;
    }
    // green plateau
    const gn = ellipseN(h.green, x, z);
    if (gn < 1.6) {
      const gy = this.greenSurface(x, z);
      const k = smoothstep(1.6, 1.05, gn);
      y = y * (1 - k) + gy * k;
    }
    if (carve) {
      for (const b of h.bunkers) {
        const bn = this.bunkerN(b, x, z);
        if (bn < 1.25) {
          y += 0.12 * smoothstep(1.25, 1.05, bn) * (b.kind === 'bunker' ? 1 : 0);
          if (bn < 1) y -= b.depth * smoothstep(1, 0.55, bn);
        }
      }
    }
    return y;
  }

  greenCenterHeight(): number {
    const g = this.hole.green.c;
    const pr = projectOnPath(this.hole.path, this.hole.cum, g.x, g.z);
    return this.profileAt(pr.along) + this.noise.fbm(g.x / this.hole.theme.noiseScale, g.z / this.hole.theme.noiseScale, 3) * this.hole.theme.noiseAmp * 0.4 + 0.35;
  }

  private _gc: number | null = null;
  greenSurface(x: number, z: number): number {
    if (this._gc === null) this._gc = this.greenCenterHeight();
    const h = this.hole;
    let y = this._gc + (x - h.green.c.x) * h.greenSlope.x + (z - h.green.c.z) * h.greenSlope.z;
    for (const b of h.greenBumps) {
      const d = dist2(b.c, { x, z });
      y += b.h * Math.exp(-((d / b.r) ** 2));
    }
    return y;
  }

  teeBoxN(x: number, z: number): number {
    // tee box: 10m wide, 14m deep around tee, aligned to first segment
    const p0 = this.hole.path[0];
    const p1 = this.hole.path[1];
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const fx = (p1.x - p0.x) / l;
    const fz = (p1.z - p0.z) / l;
    const dx = x - p0.x;
    const dz = z - p0.z;
    const along = dx * fx + dz * fz;
    const lat = dx * -fz + dz * fx;
    return Math.max(Math.abs(lat) / 5.5, Math.abs(along - 2) / 8);
  }

  bunkerN(b: HoleLayout['bunkers'][number], x: number, z: number): number {
    const n = ellipseN(b, x, z);
    const ang = Math.atan2(z - b.c.z, x - b.c.x);
    return n * (1 + 0.13 * this.edgeNoise.value(Math.cos(ang) * 1.7 + b.c.x, Math.sin(ang) * 1.7 + b.c.z));
  }

  rawHeight(x: number, z: number): number {
    let y = this.baseHeight(x, z);
    for (const w of this.hole.water) {
      const n = ellipseN(w, x, z);
      if (n < 1.3) {
        const bed = w.level - 0.4 - 1.6 * clamp(1 - n, 0, 1);
        const k = smoothstep(1.3, 0.95, n);
        y = y * (1 - k) + Math.min(y, bed) * k;
      }
    }
    return y;
  }

  private hAt(ix: number, iz: number): number {
    const i = iz * this.gw + ix;
    let v = this.hGrid[i];
    if (v !== v) {
      v = this.rawHeight(this.gx0 + ix * HoleWorld.HRES, this.gz0 + iz * HoleWorld.HRES);
      this.hGrid[i] = v;
    }
    return v;
  }

  /** Bilinear interpolated (cached) terrain height. */
  height(x: number, z: number): number {
    const fx = (x - this.gx0) / HoleWorld.HRES;
    const fz = (z - this.gz0) / HoleWorld.HRES;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= this.gw - 1 || iz >= this.gh - 1) return this.rawHeight(x, z);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = this.hAt(ix, iz);
    const b = this.hAt(ix + 1, iz);
    const c = this.hAt(ix, iz + 1);
    const d = this.hAt(ix + 1, iz + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  private cell(x: number, z: number): number {
    const ix = Math.round((x - this.gx0) / HoleWorld.HRES);
    const iz = Math.round((z - this.gz0) / HoleWorld.HRES);
    if (ix < 0 || iz < 0 || ix >= this.gw || iz >= this.gh) return -1;
    return iz * this.gw + ix;
  }

  surface(x: number, z: number): Surface {
    const i = this.cell(x, z);
    if (i < 0) return this.rawSurface(x, z);
    let v = this.sGrid[i];
    if (v === 255) {
      v = SURF_IDS.indexOf(this.rawSurface(x, z));
      this.sGrid[i] = v;
    }
    return SURF_IDS[v];
  }

  waterAt(x: number, z: number): number | null {
    const i = this.cell(x, z);
    if (i < 0) return this.rawWaterAt(x, z);
    let v = this.wGrid[i];
    if (v === 255) {
      const wl = this.rawWaterAt(x, z);
      if (wl === null) v = 0;
      else if (wl === OCEAN_LEVEL) v = 254;
      else v = 1 + this.hole.water.findIndex((w) => w.level === wl);
      this.wGrid[i] = v;
    }
    if (v === 0) return null;
    if (v === 254) return OCEAN_LEVEL;
    return this.hole.water[v - 1].level;
  }

  normal(x: number, z: number): V3 {
    const e = 0.25;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx / (2 * e);
    const nz = -hz / (2 * e);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    return { x: nx / l, y: 1 / l, z: nz / l };
  }

  /** returns the water level if (x,z) is over a water hazard */
  rawWaterAt(x: number, z: number): number | null {
    for (const w of this.hole.water) if (ellipseN(w, x, z) < 1) return w.level;
    const t = this.hole.theme;
    if (t.ocean) {
      const pr = projectOnPath(this.hole.path, this.hole.cum, x, z);
      const sideLat = pr.lateral * t.ocean.side * (this.hole.mirrored ? -1 : 1);
      if (sideLat > t.ocean.offset + 6) return OCEAN_LEVEL;
    }
    return null;
  }

  rawSurface(x: number, z: number): Surface {
    const h = this.hole;
    const wl = this.rawWaterAt(x, z);
    if (wl !== null) {
      // shore banks above water level are still dry land
      if (this.rawHeight(x, z) < wl + 0.02) return 'water';
    }
    const pr = projectOnPath(h.path, h.cum, x, z);
    const lat = Math.abs(pr.lateral);
    const oceanSide = h.theme.ocean ? pr.lateral * h.theme.ocean.side * (h.mirrored ? -1 : 1) > 0 : false;
    if ((!oceanSide && lat > h.boundsHalf) || pr.along < -30 || pr.along > h.pathLen + 48) return 'oob';
    const gn = ellipseN(h.green, x, z);
    if (gn < 1) return 'green';
    if (gn < 1.18) return 'fringe';
    for (const b of h.bunkers) if (this.bunkerN(b, x, z) < 1) return b.kind;
    if (this.teeBoxN(x, z) < 1) return 'tee';
    const fw = this.fairwayHalfAt(pr.along);
    if (pr.along > h.fairwayStart - 4 && pr.along < h.fairwayEnd && lat < fw) return 'fairway';
    if (h.theme.wasteRough) {
      return lat < fw + 5 ? 'rough' : 'waste';
    }
    if (lat > fw + 22 + 6 * this.edgeNoise.value(pr.along / 20, 9.1)) return 'deepRough';
    return 'rough';
  }

  // ---------------------------------------------------------------- scenery
  private populate() {
    const h = this.hole;
    const t = h.theme;
    const rng = new RNG(h.seed ^ 0xabc);
    const trees: Tree[] = [];
    const rocks: Rock[] = [];
    const ok = (x: number, z: number, clear: number) => {
      if (ellipseN(h.green, x, z) < 2.0) return false;
      if (Math.hypot(x - h.tee.x, z - h.tee.z) < 16) return false;
      const s = this.surface(x, z);
      if (s === 'water' || s === 'bunker' || s === 'fairway' || s === 'green' || s === 'tee') return false;
      for (const w of h.water) if (ellipseN(w, x, z) < 1.35) return false;
      if (h.theme.ocean && this.height(x, z) < OCEAN_LEVEL + 3) return false;
      const pr = projectOnPath(h.path, h.cum, x, z);
      if (Math.abs(pr.lateral) < this.fairwayHalfAt(pr.along) + clear) return false;
      // keep line of sight from tee open
      if (pr.along < 60 && Math.abs(pr.lateral) < 20) return false;
      return true;
    };
    const holeMul = h.treeMul;
    const count = Math.round(t.treeDensity * holeMul * (h.pathLen / 6));
    for (let i = 0; i < count; i++) {
      const along = rng.range(-25, h.pathLen + 45);
      const side = rng.chance(0.5) ? 1 : -1;
      // denser further out
      const lat = side * (h.fairwayHalf + 9 + Math.pow(rng.next(), 0.7) * (h.boundsHalf - h.fairwayHalf + 40));
      const p = this.frame(along, lat);
      if (!ok(p.x, p.z, 8)) continue;
      const kind = rng.pick(t.trees);
      trees.push(makeTree(p.x, p.z, rng.range(0.8, 1.35), kind));
      // small cluster
      if (rng.chance(0.35)) {
        const q = { x: p.x + rng.range(-6, 6), z: p.z + rng.range(-6, 6) };
        if (ok(q.x, q.z, 8)) trees.push(makeTree(q.x, q.z, rng.range(0.7, 1.2), kind));
      }
    }
    // strategic trees on the inside of doglegs
    if (h.path.length > 2) {
      for (let k = 1; k < h.path.length - 1; k++) {
        const c = h.path[k];
        const next = h.path[k + 1];
        const side = Math.sign((next.x - c.x) * 1) || 1;
        for (let j = 0; j < 5; j++) {
          const x = c.x + side * (h.fairwayHalf + rng.range(8, 22));
          const z = c.z + rng.range(-25, 25);
          if (ok(x, z, 6)) trees.push(makeTree(x, z, rng.range(1, 1.4), rng.pick(t.trees)));
        }
      }
    }
    const rc = Math.round(t.rockDensity * h.rockMul * (h.pathLen / 10));
    for (let i = 0; i < rc; i++) {
      const along = rng.range(-20, h.pathLen + 40);
      const side = rng.chance(0.5) ? 1 : -1;
      const lat = side * (h.fairwayHalf + 6 + rng.next() * (h.boundsHalf - h.fairwayHalf + 30));
      const p = this.frame(along, lat);
      if (!ok(p.x, p.z, 5)) continue;
      rocks.push(makeRock(p.x, p.z, rng.range(0.6, 2.6) * (rng.chance(0.15) ? 2.2 : 1)));
    }
    h.trees = trees;
    h.rocks = rocks;
  }

  frame(along: number, lateral: number) {
    const h = this.hole;
    let i = 0;
    while (i < h.path.length - 2 && h.cum[i + 1] < along) i++;
    const a = h.path[i];
    const b = h.path[i + 1];
    const l = h.cum[i + 1] - h.cum[i];
    const tx = (b.x - a.x) / l;
    const tz = (b.z - a.z) / l;
    const s = along - h.cum[i];
    return { x: a.x + tx * s - tz * lateral, z: a.z + tz * s + tx * lateral };
  }

  private key(cx: number, cz: number) {
    return (cx + 2048) * 4096 + (cz + 2048);
  }

  private buildGrid() {
    const objs = this.hole.trees;
    objs.forEach((t, i) => {
      const r = Math.max(t.canopyR, t.trunkR) + 0.5;
      const x0 = Math.floor((t.x - r) / this.cellSize);
      const x1 = Math.floor((t.x + r) / this.cellSize);
      const z0 = Math.floor((t.z - r) / this.cellSize);
      const z1 = Math.floor((t.z + r) / this.cellSize);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const k = this.key(cx, cz);
          let arr = this.treeGrid.get(k);
          if (!arr) this.treeGrid.set(k, (arr = []));
          arr.push(i);
        }
    });
    // rocks share the grid with negative ids (-(i+1))
    this.hole.rocks.forEach((r, i) => {
      const cx = Math.floor(r.x / this.cellSize);
      const cz = Math.floor(r.z / this.cellSize);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = this.key(cx + dx, cz + dz);
          let arr = this.treeGrid.get(k);
          if (!arr) this.treeGrid.set(k, (arr = []));
          arr.push(-(i + 1));
        }
    });
  }

  /** ids of trees (>=0) and rocks (<0, -(i+1)) near a point */
  nearby(x: number, z: number): number[] | undefined {
    return this.treeGrid.get(this.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)));
  }

  surfaceProps(s: Surface): SurfaceProps {
    const t = this.hole.theme;
    switch (s) {
      case 'tee':
        return { restitution: 0.3, impactFriction: 0.4, roll: 0.12, spinGrip: 0.7 };
      case 'fairway':
        return { restitution: 0.3 * t.firmness, impactFriction: 0.38 / t.firmness, roll: 0.15 / t.firmness, spinGrip: 0.75 };
      case 'rough':
        return { restitution: 0.17, impactFriction: 0.55, roll: 0.38, spinGrip: 0.35 };
      case 'deepRough':
        return { restitution: 0.1, impactFriction: 0.7, roll: 0.8, spinGrip: 0.2 };
      case 'green':
        return { restitution: 0.22, impactFriction: 0.5, roll: t.greenSpeed, spinGrip: 1 };
      case 'fringe':
        return { restitution: 0.24, impactFriction: 0.46, roll: 0.13, spinGrip: 0.9 };
      case 'bunker':
        return { restitution: 0.03, impactFriction: 0.95, roll: 1.8, spinGrip: 0.1 };
      case 'waste':
        return { restitution: 0.12, impactFriction: 0.6, roll: 0.55, spinGrip: 0.25 };
      case 'oob':
        return { restitution: 0.17, impactFriction: 0.55, roll: 0.38, spinGrip: 0.3 };
      default:
        return { restitution: 0.1, impactFriction: 0.9, roll: 2, spinGrip: 0 };
    }
  }

  distToPin(x: number, z: number) {
    return Math.hypot(x - this.hole.pin.x, z - this.hole.pin.z);
  }
}
