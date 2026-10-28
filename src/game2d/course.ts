/**
 * Top-down pixel-art rendering of a hole. The hole is painted once into map canvases (ground,
 * relief shading, stripes, bunkers, water, trees, rocks) in a frame where the hole runs up the
 * screen; per frame we only blit the map and draw the moving things on top.
 */
import { RNG } from '../core/rng';
import { ellipseN } from '../golf/holeGen';
import type { Surface, Tree } from '../golf/types';
import type { HoleWorld } from '../golf/world';
import { INK, Px } from './sprites';

/** Height-to-screen factor for things in the air (3/4 view). */
export const HK = 0.55;
const BASE_PPM = 2;
const GREEN_PPM = 8;

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

export interface Camera {
  u: number;
  w: number;
  ppm: number;
}

interface Layer {
  canvas: HTMLCanvasElement;
  ppm: number;
  u0: number;
  w1: number; // top edge (largest w)
  width: number;
  height: number;
}

export class CourseMap {
  /** map frame: origin at the tee, f = forward (tee → pin), r = right */
  readonly fx: number;
  readonly fz: number;
  readonly rx: number;
  readonly rz: number;
  readonly ox: number;
  readonly oz: number;
  readonly uMin: number;
  readonly uMax: number;
  readonly wMin: number;
  readonly wMax: number;
  base!: Layer;
  green!: Layer;
  /** world-yaw of "up" on screen */
  readonly upYaw: number;
  private water: Array<[number, number]> = [];
  readonly bg: string;

  constructor(public readonly world: HoleWorld, private detail: 'low' | 'medium' | 'high' = 'medium') {
    const h = world.hole;
    const dx = h.pin.x - h.tee.x, dz = h.pin.z - h.tee.z;
    const L = Math.hypot(dx, dz) || 1;
    this.fx = dx / L;
    this.fz = dz / L;
    this.rx = -this.fz;
    this.rz = this.fx;
    this.ox = h.tee.x;
    this.oz = h.tee.z;
    this.upYaw = Math.atan2(this.fx, -this.fz);
    // the playable corridor plus a margin wide enough that zoomed-out views never show the edge
    let pu0 = Infinity, pu1 = -Infinity;
    for (const p of h.path) {
      const m = this.toMap(p.x, p.z);
      pu0 = Math.min(pu0, m.u); pu1 = Math.max(pu1, m.u);
    }
    this.uMin = pu0 - h.boundsHalf - 110;
    this.uMax = pu1 + h.boundsHalf + 110;
    this.wMin = -110;
    this.wMax = h.pathLen + 110;
    const t = h.theme;
    this.bg = t.wasteRough ? t.waste : t.ocean ? t.water : t.deepRough;
    this.base = this.paint(BASE_PPM, this.uMin, this.uMax, this.wMin, this.wMax, false);
    const g = this.toMap(h.green.c.x, h.green.c.z);
    const R = Math.max(h.green.rx, h.green.rz) * 1.9 + 8;
    this.green = this.paint(GREEN_PPM, g.u - R, g.u + R, g.w - R, g.w + R, true);
  }

  toMap(x: number, z: number) {
    const dx = x - this.ox, dz = z - this.oz;
    return { u: dx * this.rx + dz * this.rz, w: dx * this.fx + dz * this.fz };
  }

  toWorld(u: number, w: number) {
    return { x: this.ox + this.rx * u + this.fx * w, z: this.oz + this.rz * u + this.fz * w };
  }

  /** world point → screen (game pixels); y includes the height above the ground */
  toScreen(cam: Camera, W: number, H: number, x: number, z: number, height = 0) {
    const m = this.toMap(x, z);
    return { x: (m.u - cam.u) * cam.ppm + W / 2, y: (cam.w - m.w) * cam.ppm + H / 2 - height * cam.ppm * HK };
  }

  fromScreen(cam: Camera, W: number, H: number, sx: number, sy: number) {
    const u = (sx - W / 2) / cam.ppm + cam.u;
    const w = cam.w - (sy - H / 2) / cam.ppm;
    return this.toWorld(u, w);
  }

  // ---------------------------------------------------------------- painting
  private paint(ppm: number, u0: number, u1: number, w0: number, w1: number, crisp: boolean): Layer {
    const world = this.world;
    const h = world.hole;
    const t = h.theme;
    const W = Math.ceil((u1 - u0) * ppm);
    const H = Math.ceil((w1 - w0) * ppm);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const cols: Record<Surface, [number, number, number]> = {
      tee: hexRgb(t.tee), fairway: hexRgb(t.fairway), rough: hexRgb(t.rough), deepRough: hexRgb(t.deepRough), green: hexRgb(t.green),
      fringe: hexRgb(t.fringe), bunker: hexRgb(t.sand), waste: hexRgb(t.waste), water: hexRgb(t.water), oob: hexRgb(t.deepRough),
    };
    const alt = hexRgb(t.fairwayAlt);
    const heights = new Float32Array((W + 2) * (H + 2));
    const surf: Surface[] = new Array(W * H);
    for (let j = -1; j <= H; j++) {
      const w = w1 - (j + 0.5) / ppm;
      for (let i = -1; i <= W; i++) {
        const u = u0 + (i + 0.5) / ppm;
        const p = this.toWorld(u, w);
        heights[(j + 1) * (W + 2) + (i + 1)] = world.height(p.x, p.z);
        if (i >= 0 && j >= 0 && i < W && j < H) surf[j * W + i] = crisp ? world.rawSurface(p.x, p.z) : world.surface(p.x, p.z);
      }
    }
    const step = 1 / ppm;
    for (let j = 0; j < H; j++) {
      const w = w1 - (j + 0.5) / ppm;
      for (let i = 0; i < W; i++) {
        const u = u0 + (i + 0.5) / ppm;
        const s = surf[j * W + i];
        let [r, g, b] = cols[s];
        if (s === 'fairway' || s === 'tee') {
          if (Math.floor(w / 9) % 2 === 0) [r, g, b] = alt;
        }
        if (s === 'green' && Math.floor(w / 2.4) % 2 === 0) { r *= 1.04; g *= 1.04; b *= 1.04; }
        // relief: light from the upper left, quantised with ordered dithering for a pixel look
        const k = (j + 1) * (W + 2) + (i + 1);
        const dhdu = (heights[k + 1] - heights[k - 1]) / (2 * step);
        const dhdw = (heights[k - (W + 2)] - heights[k + (W + 2)]) / (2 * step);
        let light = 1 + (-dhdu * 0.7 + dhdw * 0.7) * 1.6;
        if (s === 'water') light = 1;
        light = Math.max(0.72, Math.min(1.25, light));
        const q = Math.round((light - 1) / 0.07 + BAYER[(j % 4) * 4 + (i % 4)]) * 0.07 + 1;
        // edges: darker rim on bunkers, foam on water, darker collar around greens
        const nb = (di: number, dj: number) => surf[Math.min(H - 1, Math.max(0, j + dj)) * W + Math.min(W - 1, Math.max(0, i + di))];
        let edge = 1;
        if (s === 'bunker' && (nb(1, 0) !== s || nb(-1, 0) !== s || nb(0, 1) !== s || nb(0, -1) !== s)) edge = 0.82;
        if (s === 'water' && (nb(0, -1) !== s || nb(1, 0) !== s || nb(-1, 0) !== s)) { r = 220; g = 240; b = 250; }
        if ((s === 'rough' || s === 'deepRough') && ((i * 7 + j * 13) % 23 === 0)) edge *= 0.86; // grass tufts
        const o = (j * W + i) * 4;
        d[o] = Math.min(255, r * q * edge);
        d[o + 1] = Math.min(255, g * q * edge);
        d[o + 2] = Math.min(255, b * q * edge);
        d[o + 3] = 255;
        if (s === 'water' && !crisp && (i * 31 + j * 17) % 41 === 0) this.water.push([u, w]);
      }
    }
    ctx.putImageData(img, 0, 0);
    const px = new Px(ctx);
    const layer: Layer = { canvas, ppm, u0, w1, width: W, height: H };
    const at = (x: number, z: number) => {
      const m = this.toMap(x, z);
      return { x: (m.u - u0) * ppm, y: (w1 - m.w) * ppm };
    };
    // out-of-bounds stakes and tee markers
    for (let s = -20; s < h.pathLen + 40; s += 14) {
      for (const side of [-1, 1]) {
        if (t.ocean && side * t.ocean.side * (h.mirrored ? -1 : 1) > 0) continue;
        const p = world.frame(s, side * h.boundsHalf);
        if (world.waterAt(p.x, p.z) !== null) continue;
        const q = at(p.x, p.z);
        px.rect(q.x, q.y - 2, 1, 3, '#ffffff');
        px.dot(q.x, q.y + 1, INK);
      }
    }
    {
      const p0 = h.path[0], p1 = h.path[1];
      const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      for (const sd of [-3.5, 3.5]) {
        const q = at(p0.x - ((p1.z - p0.z) / l) * sd, p0.z + ((p1.x - p0.x) / l) * sd);
        px.disc(q.x, q.y, Math.max(1, ppm * 0.2), '#124e89');
      }
    }
    // rocks and trees, back to front
    const objs: Array<{ y: number; draw: () => void }> = [];
    for (const rk of h.rocks) {
      const q = at(rk.x, rk.z);
      if (q.x < -20 || q.y < -20 || q.x > W + 20 || q.y > H + 20) continue;
      objs.push({ y: q.y, draw: () => drawRock(px, q.x, q.y, Math.max(1.5, rk.r * ppm * 0.9)) });
    }
    for (const tr of h.trees) {
      const q = at(tr.x, tr.z);
      if (q.x < -40 || q.y < -60 || q.x > W + 40 || q.y > H + 40) continue;
      objs.push({ y: q.y, draw: () => drawTree(px, q.x, q.y, tr, ppm, h.seed) });
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();
    void this.detail;
    return layer;
  }

  // ---------------------------------------------------------------- drawing
  draw(px: Px, cam: Camera, W: number, H: number, time: number) {
    const ctx = px.ctx;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);
    const blit = (l: Layer) => {
      const k = cam.ppm / l.ppm;
      const dx = (l.u0 - cam.u) * cam.ppm + W / 2;
      const dy = (cam.w - l.w1) * cam.ppm + H / 2;
      ctx.drawImage(l.canvas, Math.round(dx), Math.round(dy), Math.round(l.width * k), Math.round(l.height * k));
    };
    blit(this.base);
    if (cam.ppm >= 4.5) blit(this.green);
    // water shimmer
    if (this.detail !== 'low') {
      for (let n = 0; n < this.water.length; n++) {
        const [u, w] = this.water[n];
        const ph = (time * 0.8 + n * 0.37) % 3;
        if (ph > 0.6) continue;
        const sx = (u - cam.u) * cam.ppm + W / 2 + ph * 3;
        const sy = (cam.w - w) * cam.ppm + H / 2;
        if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
        px.rect(sx, sy, Math.max(2, cam.ppm), 1, '#dceff8');
      }
    }
  }

  /** whole-hole framing */
  overview(W: number, H: number): Camera {
    const h = this.world.hole;
    let u0 = 0, u1 = 0;
    for (const p of h.path) {
      const m = this.toMap(p.x, p.z);
      u0 = Math.min(u0, m.u); u1 = Math.max(u1, m.u);
    }
    const spanU = u1 - u0 + 70, spanW = h.pathLen + 70;
    return { u: (u0 + u1) / 2, w: h.pathLen / 2, ppm: Math.min(W / spanU, H / spanW) };
  }

  /** is the point on the green (for slope arrows) */
  onGreen(x: number, z: number) {
    return ellipseN(this.world.hole.green, x, z) < 1.15;
  }
}

// ------------------------------------------------------------------ sprites
function drawRock(px: Px, x: number, y: number, r: number) {
  px.ellipse(x + 1, y + 1, r, r * 0.6, 'rgba(0,0,0,0.25)');
  px.ellipse(x, y - r * 0.3, r + 1, r * 0.7 + 1, INK);
  px.ellipse(x, y - r * 0.3, r, r * 0.7, '#8b9bb4');
  px.ellipse(x - r * 0.3, y - r * 0.5, r * 0.5, r * 0.35, '#c0cbdc');
}

function drawTree(px: Px, x: number, y: number, tr: Tree, ppm: number, seed: number) {
  const rng = new RNG(Math.floor(tr.x * 13 + tr.z * 7) ^ seed);
  const R = Math.max(3, tr.canopyR * ppm);
  const lift = Math.max(R * 0.9, tr.canopyY * ppm * HK);
  // ground shadow
  px.ellipse(x + R * 0.4, y + 1, R * 0.9, R * 0.45, 'rgba(10,30,20,0.35)');
  const trunk = tr.kind === 'birch' ? '#e8e8e8' : tr.kind === 'palm' ? '#b86f50' : '#733e39';
  const tw = Math.max(1, Math.round(tr.trunkR * ppm * 0.8));
  if (tr.kind !== 'cactus') {
    px.rect(x - tw / 2 - 1, y - lift, tw + 2, lift + 1, INK);
    px.rect(x - tw / 2, y - lift, tw, lift, trunk);
  }
  const cy = y - lift;
  switch (tr.kind) {
    case 'pine': {
      const hgt = R * 2.4;
      for (let k = 0; k < 3; k++) {
        const top = cy - hgt * 0.55 + k * hgt * 0.28;
        const wd = R * (0.55 + k * 0.28);
        for (let row = 0; row < hgt * 0.4; row++) {
          const span = (row / (hgt * 0.4)) * wd;
          px.rect(x - span - 1, top + row, span * 2 + 3, 1, INK);
        }
        for (let row = 0; row < hgt * 0.4 - 1; row++) {
          const span = (row / (hgt * 0.4)) * wd;
          px.rect(x - span, top + row, span * 2 + 1, 1, '#265c42');
          px.rect(x - span, top + row, Math.max(1, span * 0.7), 1, '#3e8948');
        }
      }
      break;
    }
    case 'cypress':
      px.ellipse(x, cy - R * 0.6, R * 0.55 + 1, R * 1.5 + 1, INK);
      px.ellipse(x, cy - R * 0.6, R * 0.55, R * 1.5, '#265c42');
      px.ellipse(x - R * 0.2, cy - R * 0.9, R * 0.25, R * 0.9, '#3e8948');
      break;
    case 'palm': {
      px.disc(x, cy, 1.5, INK);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const ex = x + Math.cos(a) * R, ey = cy + Math.sin(a) * R * 0.6 + R * 0.25;
        px.seg(x, cy, ex, ey, 1, INK);
        px.line(x, cy, ex, ey, k % 2 ? '#63c74d' : '#3e8948');
      }
      break;
    }
    case 'cactus': {
      const hgt = Math.max(5, tr.canopyY * 1.6 * ppm * HK + 3);
      px.rect(x - 2, y - hgt - 1, 4, hgt + 1, INK);
      px.rect(x - 1, y - hgt, 2, hgt, '#63c74d');
      px.rect(x + 1, y - hgt * 0.7, 3, 1, '#3e8948');
      px.rect(x + 3, y - hgt * 0.95, 1, hgt * 0.3, '#3e8948');
      px.rect(x - 4, y - hgt * 0.55, 3, 1, '#3e8948');
      px.rect(x - 4, y - hgt * 0.8, 1, hgt * 0.25, '#3e8948');
      break;
    }
    default: {
      // round broadleaf canopy: outline, base, highlight, shade dither
      const base = tr.kind === 'birch' ? '#7fbf3a' : '#3e8948';
      const light = tr.kind === 'birch' ? '#b4e05a' : '#63c74d';
      px.disc(x, cy - R * 0.4, R + 1, INK);
      px.disc(x, cy - R * 0.4, R, base);
      px.disc(x - R * 0.3, cy - R * 0.7, R * 0.55, light);
      for (let i = -R; i <= R; i += 2)
        for (let j = 0; j <= R; j += 2) if (i * i + j * j < R * R * 0.8 && i + j > R * 0.4) px.dot(x + i, cy - R * 0.4 + j - 1, '#265c42');
    }
  }
}
