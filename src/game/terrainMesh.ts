import * as THREE from 'three';
import { Noise2, projectOnPath } from '../core/math';
import type { Surface } from '../golf/types';
import { OCEAN_LEVEL, type HoleWorld } from '../golf/world';
import { ellipseN } from '../golf/holeGen';
import { litMaterial, makeWaterMaterial } from './materials';
import type { Quality } from './renderer';

const SURF_LIST: Surface[] = ['tee', 'fairway', 'rough', 'deepRough', 'green', 'fringe', 'bunker', 'waste', 'water', 'oob'];

function hex(c: string): [number, number, number] {
  const col = new THREE.Color(c);
  return [col.r * 255, col.g * 255, col.b * 255];
}

/** Paint a top-down surface texture of the hole (fairway stripes, greens, sand...). */
export function buildSurfaceTexture(world: HoleWorld, quality: Quality): { tex: THREE.CanvasTexture; ppm: number } {
  const h = world.hole;
  const t = h.theme;
  const b = h.bbox;
  const W = b.maxX - b.minX;
  const H = b.maxZ - b.minZ;
  let ppm = quality === 'low' ? 1.3 : quality === 'medium' ? 2.2 : 3.2;
  const maxTex = 4096;
  ppm = Math.min(ppm, maxTex / W, maxTex / H);
  const w = Math.ceil(W * ppm);
  const hh = Math.ceil(H * ppm);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, hh);
  const data = img.data;

  // coarse surface grid at 1m; refine only on boundaries
  const step = 1;
  const cw = Math.ceil(W / step) + 2;
  const ch = Math.ceil(H / step) + 2;
  const coarse = new Uint8Array(cw * ch);
  for (let j = 0; j < ch; j++)
    for (let i = 0; i < cw; i++) coarse[j * cw + i] = SURF_LIST.indexOf(world.rawSurface(b.minX + i * step, b.minZ + j * step));

  const cols = SURF_LIST.map((s) => {
    switch (s) {
      case 'tee': return hex(t.tee);
      case 'fairway': return hex(t.fairway);
      case 'rough': return hex(t.rough);
      case 'deepRough': return hex(t.deepRough);
      case 'green': return hex(t.green);
      case 'fringe': return hex(t.fringe);
      case 'bunker': return hex(t.sand);
      case 'waste': return hex(t.waste);
      case 'water': return hex(t.sand);
      case 'oob': return hex(t.deepRough);
    }
  });
  const alt = hex(t.fairwayAlt);
  const noise = new Noise2(h.seed + 99);
  const p0 = h.path[0];
  const p1 = h.path[h.path.length - 1];
  const dl = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const sx = (p1.x - p0.x) / dl;
  const sz = (p1.z - p0.z) / dl;
  const g = h.green;

  for (let py = 0; py < hh; py++) {
    const z = b.minZ + (py + 0.5) / ppm;
    const cj = Math.floor((z - b.minZ) / step);
    for (let px = 0; px < w; px++) {
      const x = b.minX + (px + 0.5) / ppm;
      const ci = Math.floor((x - b.minX) / step);
      const k = cj * cw + ci;
      const a = coarse[k];
      let sIdx = a;
      let edge: [number, number, number] | null = null;
      if (a !== coarse[k + 1] || a !== coarse[k + cw] || a !== coarse[k + cw + 1]) {
        // boundary pixel: supersample 4 points for smooth (anti-aliased) edges
        const q = 0.25 / ppm;
        const ids = [world.rawSurface(x - q, z - q), world.rawSurface(x + q, z - q), world.rawSurface(x - q, z + q), world.rawSurface(x + q, z + q)].map((v) => SURF_LIST.indexOf(v));
        sIdx = ids[0];
        if (ids.some((v) => v !== sIdx)) {
          edge = [0, 0, 0];
          for (const v of ids) { edge[0] += cols[v][0] / 4; edge[1] += cols[v][1] / 4; edge[2] += cols[v][2] / 4; }
        }
      }
      const s = SURF_LIST[sIdx];
      let [r, gg, bb] = edge ?? cols[sIdx];
      const n = noise.value(x * 0.35, z * 0.35) * 0.5 + noise.value(x * 1.7, z * 1.7) * 0.5;
      let shade = 1 + n * 0.06;
      if (!edge && (s === 'fairway' || s === 'tee')) {
        const along = x * sx + z * sz;
        if (Math.floor(along / 9) % 2 === 0) [r, gg, bb] = alt;
        shade = 1 + n * 0.035;
      } else if (s === 'green') {
        const gl = ellipseN(g, x, z);
        const along = x * sx + z * sz;
        const cross = -x * sz + z * sx;
        const stripe = Math.floor(along / 2.4) % 2 === 0 ? 1.025 : 0.975;
        void cross;
        shade = stripe * (1 - Math.max(0, gl - 0.85) * 0.25);
      } else if (s === 'fringe') {
        shade = 0.96 + n * 0.03;
      } else if (s === 'rough' || s === 'deepRough' || s === 'oob') {
        shade = 1 + n * 0.12;
      } else if (s === 'bunker' || s === 'waste') {
        shade = 1 + noise.value(x * 4, z * 4) * 0.05;
      }
      const o = (py * w + px) * 4;
      data[o] = Math.min(255, r * shade);
      data[o + 1] = Math.min(255, gg * shade);
      data[o + 2] = Math.min(255, bb * shade);
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // subtle darker edge on bunkers / fringe via a blurred overlay of boundaries is skipped for speed
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  return { tex, ppm };
}

export interface TerrainBuild {
  group: THREE.Group;
  waters: THREE.ShaderMaterial[];
  /** height of the rendered mesh (for placing things exactly on the visible ground) */
  visualHeight: (x: number, z: number) => number;
}

export function buildTerrain(world: HoleWorld, quality: Quality, sunDir: THREE.Vector3): TerrainBuild {
  const h = world.hole;
  const t = h.theme;
  const b = h.bbox;
  const group = new THREE.Group();
  const spacing = quality === 'low' ? 3 : quality === 'medium' ? 2 : 1.4;
  const nx = Math.ceil((b.maxX - b.minX) / spacing);
  const nz = Math.ceil((b.maxZ - b.minZ) / spacing);
  const dx = (b.maxX - b.minX) / nx;
  const dz = (b.maxZ - b.minZ) / nz;
  const verts = (nx + 1) * (nz + 1);
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const heights = new Float32Array(verts);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = b.minX + i * dx;
      const z = b.minZ + j * dz;
      const y = world.height(x, z);
      const k = j * (nx + 1) + i;
      heights[k] = y;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      uv[k * 2] = i / nx;
      uv[k * 2 + 1] = j / nz;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const { tex } = buildSurfaceTexture(world, quality);
  const mat = litMaterial(quality, { map: tex, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = quality !== 'low';
  mesh.name = 'terrain';
  group.add(mesh);

  const visualHeight = (x: number, z: number) => {
    const fx = (x - b.minX) / dx;
    const fz = (z - b.minZ) / dz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return world.height(x, z);
    const tx = fx - i;
    const tz = fz - j;
    const k = j * (nx + 1) + i;
    const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + nx + 1], h11 = heights[k + nx + 2];
    // triangle split matches index order (a, c, a+1) / (a+1, c, c+1)
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };

  // ---- outer world terrain
  const R = 2600;
  const seg = quality === 'low' ? 64 : 110;
  const outer = new THREE.PlaneGeometry(R * 2, R * 2, seg, seg);
  outer.rotateX(-Math.PI / 2);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  outer.translate(cx, 0, cz);
  const op = outer.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(op.count * 3);
  const rough = new THREE.Color(t.wasteRough ? t.waste : t.deepRough);
  const mtn = new THREE.Color(t.mountains);
  const noise = new Noise2(h.seed + 5);
  const tmp = new THREE.Color();
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i);
    const z = op.getZ(i);
    const inside = x > b.minX + 2 && x < b.maxX - 2 && z > b.minZ + 2 && z < b.maxZ - 2;
    const pr = projectOnPath(h.path, h.cum, x, z);
    const far = Math.max(0, pr.dist - h.boundsHalf - 80);
    let y = world.rawHeight(x, z);
    y += Math.pow(far / 120, 1.6) * (t.lateralRise * 2 + 6) * (0.6 + 0.4 * noise.fbm(x / 300, z / 300, 3));
    if (t.ocean) {
      const sideLat = pr.lateral * t.ocean.side * (h.mirrored ? -1 : 1);
      if (sideLat > t.ocean.offset) y = Math.min(y, OCEAN_LEVEL - 8);
    }
    if (inside) y -= 4;
    op.setY(i, y);
    const k = Math.min(1, far / 900);
    tmp.copy(rough).lerp(mtn, k).multiplyScalar(0.92 + noise.value(x / 40, z / 40) * 0.08);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  outer.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  outer.computeVertexNormals();
  const outerMesh = new THREE.Mesh(outer, litMaterial(quality, { vertexColors: true, roughness: 1 }));
  outerMesh.receiveShadow = false;
  group.add(outerMesh);

  // skirt around the detailed mesh to hide seams
  const skirtPts: number[] = [];
  const edge = (x: number, z: number) => [x, visualHeight(x, z), z];
  const ring: number[][] = [];
  for (let i = 0; i <= nx; i++) ring.push(edge(b.minX + i * dx, b.minZ));
  for (let j = 1; j <= nz; j++) ring.push(edge(b.maxX, b.minZ + j * dz));
  for (let i = nx - 1; i >= 0; i--) ring.push(edge(b.minX + i * dx, b.maxZ));
  for (let j = nz - 1; j >= 0; j--) ring.push(edge(b.minX, b.minZ + j * dz));
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], c = ring[i + 1];
    skirtPts.push(a[0], a[1], a[2], a[0], a[1] - 8, a[2], c[0], c[1], c[2]);
    skirtPts.push(c[0], c[1], c[2], a[0], a[1] - 8, a[2], c[0], c[1] - 8, c[2]);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtPts, 3));
  skirt.computeVertexNormals();
  group.add(new THREE.Mesh(skirt, new THREE.MeshLambertMaterial({ color: t.deepRough, side: THREE.DoubleSide })));

  // ---- water
  const waters: THREE.ShaderMaterial[] = [];
  for (const wb of h.water) {
    const wm = makeWaterMaterial(t.water, sunDir);
    waters.push(wm);
    const g = new THREE.CircleGeometry(1, 48);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, wm);
    m.scale.set(wb.rx * 1.18, 1, wb.rz * 1.18);
    m.rotation.y = -wb.rot;
    m.position.set(wb.c.x, wb.level, wb.c.z);
    m.renderOrder = 1;
    group.add(m);
  }
  if (t.ocean) {
    const wm = makeWaterMaterial(t.water, sunDir, 0.95);
    waters.push(wm);
    const g = new THREE.PlaneGeometry(9000, 9000);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, wm);
    m.position.set(cx, OCEAN_LEVEL, cz);
    group.add(m);
  }
  return { group, waters, visualHeight };
}
