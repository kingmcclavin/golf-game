/**
 * Pixel-art sprite drawing. The golfer is rasterised every frame from the swing rig's joints
 * (projected in a 3/4 top-down view), so every cosmetic combination and every swing frame works
 * without hand-drawn sprite sheets.
 */
import { cosmeticById, SKIN_TONES, type Outfit } from '../data/cosmetics';
import type { Skeleton, V } from './golfer';

export const INK = '#181425';

/** Pixel-perfect drawing helpers on a low-res canvas. */
export class Px {
  constructor(public ctx: CanvasRenderingContext2D) {}
  dot(x: number, y: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  disc(cx: number, cy: number, r: number, c: string) {
    this.ctx.fillStyle = c;
    const x0 = Math.round(cx), y0 = Math.round(cy);
    if (r < 0.75) {
      this.ctx.fillRect(x0, y0, 1, 1);
      return;
    }
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      const span = Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.6 - dy * dy)));
      if (r * r + r * 0.6 - dy * dy < 0) continue;
      this.ctx.fillRect(x0 - span, y0 + dy, span * 2 + 1, 1);
    }
  }
  /** thick line made of discs */
  seg(ax: number, ay: number, bx: number, by: number, r: number, c: string) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d * 1.5));
    for (let i = 0; i <= n; i++) this.disc(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, r, c);
  }
  /** 1px line */
  line(ax: number, ay: number, bx: number, by: number, c: string) {
    this.ctx.fillStyle = c;
    const d = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const n = Math.max(1, Math.ceil(d));
    for (let i = 0; i <= n; i++) this.ctx.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 1, 1);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    this.ctx.fillStyle = c;
    const R = Math.ceil(ry);
    for (let dy = -R; dy <= R; dy++) {
      const k = 1 - (dy * dy) / (ry * ry + 0.3);
      if (k < 0) continue;
      const span = Math.round(rx * Math.sqrt(k));
      this.ctx.fillRect(Math.round(cx - span), Math.round(cy + dy), span * 2 + 1, 1);
    }
  }
  text(s: string, x: number, y: number, c: string, align: CanvasTextAlign = 'center', size = 8) {
    const ctx = this.ctx;
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(s, Math.round(x) + dx, Math.round(y) + dy);
    ctx.fillStyle = c;
    ctx.fillText(s, Math.round(x), Math.round(y));
  }
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * k)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

export interface SpriteView {
  /** screen position of the root (feet) */
  x: number;
  y: number;
  /** pixels per metre for the sprite */
  s: number;
  /** rotation of the golfer about the vertical axis relative to the screen (0 = facing right) */
  yaw: number;
}

const HEIGHT_K = 0.92;
const DEPTH_K = 0.42;

export function project(p: V, view: SpriteView): { x: number; y: number; d: number } {
  const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
  const x = p.x * c + p.z * s;
  const z = -p.x * s + p.z * c;
  return { x: view.x + x * view.s, y: view.y + (-p.y * HEIGHT_K + z * DEPTH_K) * view.s, d: z };
}

interface Part {
  d: number;
  draw: (outline: boolean) => void;
}

/** Draw a golfer from a skeleton. Bigger `view.s` = bigger sprite. */
export function drawGolfer(px: Px, sk: Skeleton, outfit: Outfit, view: SpriteView, club?: { color: string; category: string }) {
  const P = (p: V) => project(p, view);
  const s = view.s;
  const w = outfit.body === 'slim' ? 0.86 : outfit.body === 'broad' ? 1.17 : 1;
  const skin = SKIN_TONES[outfit.skin] ?? SKIN_TONES[1];
  const shirt = cosmeticById(outfit.shirt);
  const pants = cosmeticById(outfit.pants);
  const shoes = cosmeticById(outfit.shoes);
  const hat = cosmeticById(outfit.hat);
  const glove = cosmeticById(outfit.gloves);
  const glasses = cosmeticById(outfit.glasses);
  const acc = cosmeticById(outfit.accessory);
  const shirtC = shirt?.color ?? '#ffffff';
  const shirtC2 = shirt?.color2 ?? shade(shirtC, 0.8);
  const pantsC = pants?.color ?? '#c8b48a';
  const shorts = pants?.style === 'shorts' || pants?.style === 'skirt';
  const longSleeve = !!shirt && !['tee', 'polo', 'floral'].includes(shirt.style);
  const parts: Part[] = [];
  const add = (d: number, draw: (o: boolean) => void) => parts.push({ d, draw });
  const R = (m: number) => Math.max(0.5, m * s);
  const limb = (a: V, b: V, r: number, color: string, extra = 0) => {
    const A = P(a), B = P(b);
    add((A.d + B.d) / 2 + extra, (o) => (o ? px.seg(A.x, A.y, B.x, B.y, R(r) + 1, INK) : px.seg(A.x, A.y, B.x, B.y, R(r), color)));
  };
  /** One straight, unbroken limb: `upper` colour from the joint to `split`, `lower` colour beyond. */
  const straight = (a: V, b: V, r: number, upper: string, lower: string, split: number) => {
    const A = P(a), B = P(b);
    const mx = A.x + (B.x - A.x) * split, my = A.y + (B.y - A.y) * split;
    add((A.d + B.d) / 2, (o) => {
      if (o) return px.seg(A.x, A.y, B.x, B.y, R(r) + 1, INK);
      px.seg(A.x, A.y, B.x, B.y, R(r), lower);
      if (split > 0) px.seg(A.x, A.y, mx, my, R(r), upper);
    });
  };
  const blob = (a: V, r: number, color: string, extra = 0) => {
    const A = P(a);
    add(A.d + extra, (o) => (o ? px.disc(A.x, A.y, R(r) + 1, INK) : px.disc(A.x, A.y, R(r), color)));
  };

  // cape hangs behind everything
  if (acc?.style === 'cape') {
    const A = P(sk.neck), B = P(sk.pelvis);
    add(-9, () => px.seg(A.x - 1, A.y + 1, B.x - 2, B.y + 3, R(0.2), acc.color));
  }
  // legs and shoes
  for (let i = 0; i < 2; i++) {
    const legC = pants?.style === 'skirt' ? skin : pantsC;
    straight(sk.hips[i], sk.ankles[i], 0.075 * w, legC, shorts ? skin : pantsC, shorts ? 0.5 : 0);
    limb(sk.heels[i], sk.toes[i], 0.06, shoes?.color ?? '#ffffff', 0.01);
  }
  // torso (with a simple pattern stripe for patterned shirts)
  const pel = P(sk.pelvis), ch = P(sk.chest);
  add((pel.d + ch.d) / 2, (o) => {
    if (o) {
      px.seg(pel.x, pel.y, ch.x, ch.y, R(0.16 * w) + 1, INK);
      return;
    }
    px.seg(pel.x, pel.y, ch.x, ch.y, R(0.16 * w), shirtC);
    if (shirt && ['stripe', 'argyle', 'plaid', 'floral', 'flame', 'vest'].includes(shirt.style)) {
      const n = Math.max(2, Math.round(Math.hypot(ch.x - pel.x, ch.y - pel.y)));
      for (let k = 1; k < n; k += 2) {
        const t = k / n;
        const cx = pel.x + (ch.x - pel.x) * t, cy = pel.y + (ch.y - pel.y) * t;
        if (shirt.style === 'vest') px.dot(cx, cy, shirtC2);
        else px.seg(cx - R(0.12 * w), cy, cx + R(0.12 * w), cy, 0.5, shirtC2);
      }
    }
    // belt + pants top
    px.seg(pel.x - R(0.13 * w), pel.y, pel.x + R(0.13 * w), pel.y, 0.6, pantsC);
  });
  if (acc?.style === 'towel') blob(sk.hips[0], 0.06, acc.color, 0.02);
  // arms (sleeves on the upper arm, skin or sleeve on the forearm)
  for (let i = 0; i < 2; i++) {
    straight(sk.shoulders[i], sk.hands[i], 0.055 * w, shirtC, longSleeve ? shirtC : skin, longSleeve ? 0 : 0.45);
    blob(sk.hands[i], 0.055, i === 0 && glove ? glove.color : skin, 0.03);
  }
  if (acc?.style === 'watch' || acc?.style === 'wristband') {
    const a = P(sk.hands[0]), e = P(sk.elbows[0]);
    add(a.d + 0.035, () => px.dot(a.x + (e.x - a.x) * 0.25, a.y + (e.y - a.y) * 0.25, acc.color));
  }
  // club
  if (club) {
    const g = P(sk.grip), h = P(sk.clubHead);
    const head = club.category === 'driver' || club.category === 'wood' ? '#3a4466' : club.category === 'putter' ? '#5a6988' : '#c0cbdc';
    add((g.d + h.d) / 2 + 0.04, (o) => {
      if (o) return;
      px.line(g.x, g.y, h.x, h.y, '#c0cbdc');
      px.line(g.x, g.y, g.x + (h.x - g.x) * 0.15, g.y + (h.y - g.y) * 0.15, INK);
      px.dot(g.x + (h.x - g.x) * 0.25, g.y + (h.y - g.y) * 0.25, club.color);
      px.disc(h.x, h.y, club.category === 'driver' ? 1.2 : 0.8, head);
    });
  }
  // head
  const H = P(sk.head);
  const neck = P(sk.neck);
  const hr = Math.max(2.2, 0.15 * s);
  // facing: forward vector of the face in screen space
  const fwd = project({ x: Math.cos(sk.headYaw) * 0.2, y: 0, z: -Math.sin(sk.headYaw) * 0.2 }, { ...view, x: 0, y: 0 });
  const face = Math.sign(fwd.x) || 1;
  const frontVisible = fwd.y > -0.02 * s; // face turned toward the viewer
  add(H.d + 0.05, (o) => {
    if (o) {
      px.seg(neck.x, neck.y, H.x, H.y, 1.4, INK);
      px.disc(H.x, H.y, hr + 1, INK);
      return;
    }
    px.seg(neck.x, neck.y, H.x, H.y, 0.8, skin);
    px.disc(H.x, H.y, hr, skin);
    // hair
    const hairC = outfit.hairColor;
    if (outfit.hairStyle !== 'bald') {
      for (let dy = -Math.ceil(hr); dy <= -1; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, hr * hr - dy * dy)));
        px.rect(H.x - span, H.y + dy, span * 2 + 1, 1, hairC);
      }
      // back of the head
      px.rect(H.x - face * Math.ceil(hr) + (face > 0 ? 0 : -0), H.y - 1, 1, 3, hairC);
      if (['long', 'ponytail', 'bob'].includes(outfit.hairStyle)) px.rect(H.x - face * (hr + 1), H.y, 2, outfit.hairStyle === 'long' ? 5 : 3, hairC);
      if (outfit.hairStyle === 'bun') px.disc(H.x - face * hr, H.y - hr, 1.2, hairC);
      if (outfit.hairStyle === 'mohawk' && !hat) px.rect(H.x - 1, H.y - hr - 2, 2, 2, hairC);
      if (outfit.hairStyle === 'spiky' && !hat) for (let k = -1; k <= 1; k++) px.dot(H.x + k * 2, H.y - hr - 1, hairC);
      if (outfit.hairStyle === 'curly' && !hat) { px.dot(H.x - hr, H.y - 1, hairC); px.dot(H.x + hr, H.y - 1, hairC); }
    }
    // eyes / glasses
    if (frontVisible) {
      const ex = H.x + face * Math.round(hr * 0.45);
      px.dot(ex, H.y, INK);
      if (outfit.face !== 1) px.dot(ex + face * 2, H.y, INK);
      if (glasses) px.rect(ex - (face > 0 ? 0 : 2), H.y, 3, 1, glasses.color);
    } else if (glasses) px.dot(H.x + face * hr, H.y, glasses.color);
    // hats
    if (hat) {
      const c1 = hat.color, c2 = hat.color2 ?? shade(hat.color, 0.8);
      const top = H.y - Math.ceil(hr);
      switch (hat.style) {
        case 'cap':
          px.rect(H.x - hr, top, hr * 2 + 1, Math.ceil(hr * 0.8), c1);
          px.rect(face > 0 ? H.x + 1 : H.x - hr - 2, top + Math.ceil(hr * 0.8) - 1, hr + 1, 1, c1);
          px.dot(H.x, top - 0, c2);
          break;
        case 'visor':
          px.rect(H.x - hr, top + 1, hr * 2 + 1, 1, c1);
          px.rect(face > 0 ? H.x + 1 : H.x - hr - 2, top + 2, hr + 1, 1, c2);
          break;
        case 'bucket':
          px.rect(H.x - hr, top - 1, hr * 2 + 1, Math.ceil(hr), c1);
          px.rect(H.x - hr - 1, top + Math.ceil(hr) - 1, hr * 2 + 3, 1, shade(c1, 0.85));
          break;
        case 'beanie':
          px.rect(H.x - hr, top - 1, hr * 2 + 1, Math.ceil(hr) + 1, c1);
          px.rect(H.x - hr, top + Math.ceil(hr) - 1, hr * 2 + 1, 1, c2);
          px.dot(H.x, top - 2, c2);
          break;
        case 'flat':
          px.rect(H.x - hr, top, hr * 2 + 1, 2, c1);
          px.rect(face > 0 ? H.x : H.x - hr - 1, top + 1, hr + 1, 1, c2);
          break;
        case 'wide':
          px.rect(H.x - hr + 1, top - 2, hr * 2 - 1, Math.ceil(hr) + 1, c1);
          px.rect(H.x - hr - 2, top + Math.ceil(hr) - 1, hr * 2 + 5, 1, shade(c1, 0.8));
          px.rect(H.x - hr + 1, top + Math.ceil(hr) - 2, hr * 2 - 1, 1, c2);
          break;
        case 'crown':
          px.rect(H.x - hr, top - 1, hr * 2 + 1, 2, c1);
          for (let k = -1; k <= 1; k++) px.dot(H.x + k * Math.round(hr * 0.7), top - 2, c1);
          px.dot(H.x, top - 1, c2);
          break;
        case 'headband':
          px.rect(H.x - hr, top + 1, hr * 2 + 1, 1, c1);
          break;
      }
    }
    if (acc?.style === 'chain') px.seg(neck.x - 1, neck.y + 1, neck.x + 1, neck.y + 1, 0.5, acc.color);
    if (acc?.style === 'scarf') px.seg(neck.x - 1, neck.y, neck.x + 1, neck.y, 0.8, acc.color);
  });

  parts.sort((a, b) => a.d - b.d);
  // two passes per part keeps a crisp dark outline between overlapping limbs
  for (const p of parts) {
    p.draw(true);
    p.draw(false);
  }
}

/** Golf bag standing next to the golfer. */
export function drawBag(px: Px, x: number, y: number, s: number, outfit: Outfit) {
  const b = cosmeticById(outfit.bag);
  const c1 = b?.color ?? '#3a6a3a', c2 = b?.color2 ?? '#c8b48a';
  const h = Math.max(6, Math.round(0.9 * s * HEIGHT_K));
  const wd = Math.max(3, Math.round((b?.style === 'staff' ? 0.32 : 0.24) * s));
  px.rect(x - wd / 2 - 1, y - h - 1, wd + 2, h + 2, INK);
  px.rect(x - wd / 2, y - h, wd, h, c1);
  px.rect(x - wd / 2, y - h, wd, 1, c2);
  px.rect(x + wd / 2 - 1, y - h * 0.6, 1, h * 0.4, c2);
  if (b?.style === 'staff') px.rect(x - wd / 2, y - h * 0.35, wd, 1, c2);
  // club heads poking out
  for (let k = 0; k < 3; k++) {
    px.line(x - wd / 2 + 1 + k, y - h, x - wd / 2 + k, y - h - 3 - (k % 2), '#c0cbdc');
    px.dot(x - wd / 2 + k, y - h - 4 - (k % 2), k === 0 ? '#3a4466' : '#c0cbdc');
  }
}
