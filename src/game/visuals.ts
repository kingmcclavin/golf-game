import * as THREE from 'three';

let dotTex: THREE.Texture | null = null;
export function dotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** A line of screen-space dots (constant pixel size), used for aim arcs and putt lines. */
export class DotLine {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private max: number;
  constructor(color: string, size: number, max = 160, opacity = 0.95) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setDrawRange(0, 0);
    const m = new THREE.PointsMaterial({
      color, size, sizeAttenuation: false, map: dotTexture(), transparent: true, opacity, depthTest: false, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, m);
    this.points.renderOrder = 20;
    this.points.frustumCulled = false;
  }
  set(pts: Array<{ x: number; y: number; z: number }>, spacing = 1) {
    const arr = this.geo.attributes.position.array as Float32Array;
    let n = 0;
    for (let i = 0; i < pts.length && n < this.max; i += spacing) {
      arr[n * 3] = pts[i].x;
      arr[n * 3 + 1] = pts[i].y;
      arr[n * 3 + 2] = pts[i].z;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.points.visible = n > 0;
  }
  clear() {
    this.geo.setDrawRange(0, 0);
    this.points.visible = false;
  }
  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Ball trail rendered as a fading line strip. */
export class Trail {
  readonly line: THREE.Line;
  private geo = new THREE.BufferGeometry();
  private n = 0;
  constructor(private max = 400) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
  }
  reset() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
  push(x: number, y: number, z: number) {
    const p = this.geo.attributes.position.array as Float32Array;
    if (this.n >= this.max) {
      p.copyWithin(0, 3);
      this.n = this.max - 1;
    }
    p[this.n * 3] = x;
    p[this.n * 3 + 1] = y;
    p[this.n * 3 + 2] = z;
    this.n++;
    const c = this.geo.attributes.color.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const k = i / this.n;
      c[i * 3] = 1;
      c[i * 3 + 1] = 0.9 + 0.1 * k;
      c[i * 3 + 2] = 0.6 + 0.4 * k;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; g: number;
}

/** Small pooled particle system (splash, sand, confetti, sparkles). */
export class Particles {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private parts: Particle[] = [];
  constructor(private max = 400) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const m = new THREE.PointsMaterial({ size: 0.25, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false });
    this.points = new THREE.Points(this.geo, m);
    this.points.frustumCulled = false;
  }
  private colors: THREE.Color[] = [];
  burst(x: number, y: number, z: number, kind: 'splash' | 'sand' | 'confetti' | 'sparkle' | 'dirt', count = 40) {
    const palette =
      kind === 'splash' ? ['#ffffff', '#bfe6ff', '#7cc4ff'] :
      kind === 'sand' ? ['#f0dca0', '#e2c88a', '#fff0c8'] :
      kind === 'dirt' ? ['#6a8a3a', '#8aa04a', '#5a4a30'] :
      kind === 'sparkle' ? ['#fff6a0', '#ffd23a', '#ffffff'] :
      ['#ff4a4a', '#ffd23a', '#4ad8ff', '#7aff6a', '#ff7ae0', '#ffffff'];
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'confetti' ? 2 + Math.random() * 6 : kind === 'sparkle' ? 0.5 + Math.random() * 2 : 1 + Math.random() * 3;
      const up = kind === 'confetti' ? 5 + Math.random() * 7 : kind === 'splash' ? 3 + Math.random() * 4 : 1.5 + Math.random() * 2.5;
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp,
        life: 0, max: kind === 'confetti' ? 2.6 : 1.1, g: kind === 'confetti' ? 4 : kind === 'sparkle' ? 1 : 9.8,
      });
      this.colors.push(new THREE.Color(palette[i % palette.length]));
      if (this.colors.length > this.parts.length) this.colors.shift();
    }
    (this.points.material as THREE.PointsMaterial).size = kind === 'confetti' ? 0.35 : 0.25;
  }
  update(dt: number) {
    const p = this.geo.attributes.position.array as Float32Array;
    const c = this.geo.attributes.color.array as Float32Array;
    this.parts = this.parts.filter((q, i) => {
      q.life += dt;
      if (q.life > q.max) {
        this.colors.splice(i, 1);
        return false;
      }
      return true;
    });
    this.parts.forEach((q, i) => {
      q.vy -= q.g * dt;
      q.vx *= 0.985;
      q.vz *= 0.985;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      p[i * 3] = q.x;
      p[i * 3 + 1] = q.y;
      p[i * 3 + 2] = q.z;
      const col = this.colors[i] ?? new THREE.Color('#ffffff');
      const fade = 1 - q.life / q.max;
      c[i * 3] = col.r * fade + (1 - fade) * 0.5;
      c[i * 3 + 1] = col.g * fade + (1 - fade) * 0.5;
      c[i * 3 + 2] = col.b * fade + (1 - fade) * 0.5;
    });
    this.geo.setDrawRange(0, this.parts.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Floating label sprite with constant screen size. */
export function labelSprite(text: string, bg: string, fg = '#ffffff', scale = 0.05): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = 'bold 40px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 64;
  g.font = 'bold 40px system-ui, sans-serif';
  g.fillStyle = bg;
  const r = 28;
  g.beginPath();
  g.moveTo(r, 4);
  g.arcTo(w - 2, 4, w - 2, 60, r);
  g.arcTo(w - 2, 60, 2, 60, r);
  g.arcTo(2, 60, 2, 4, r);
  g.arcTo(2, 4, w - 2, 4, r);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  s.scale.set((scale * w) / 64, scale, 1);
  s.renderOrder = 30;
  s.center.set(0.5, 0);
  return s;
}

export function updateLabel(s: THREE.Sprite, text: string, bg: string, fg = '#ffffff', scale = 0.05) {
  const n = labelSprite(text, bg, fg, scale);
  const old = s.material.map;
  s.material.map = n.material.map;
  s.material.needsUpdate = true;
  s.scale.copy(n.scale);
  old?.dispose();
  n.material.dispose();
}
