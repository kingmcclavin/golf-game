import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng';
import { TREE_SHAPES } from '../golf/holeGen';
import type { TreeKind } from '../golf/types';
import type { HoleWorld } from '../golf/world';
import { OCEAN_LEVEL } from '../golf/world';
import { litMaterial } from './materials';
import type { Quality } from './renderer';

function colorize(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g2.attributes.uv) g2.deleteAttribute('uv');
  return g2;
}

const C = (s: string) => new THREE.Color(s);

/** Tree geometry (trunk + foliage in one mesh, vertex coloured) sized so canopy matches collision data. */
export function treeGeometry(kind: TreeKind, quality: Quality): THREE.BufferGeometry {
  const sh = TREE_SHAPES[kind];
  const parts: THREE.BufferGeometry[] = [];
  const det = quality === 'low' ? 0 : 1;
  switch (kind) {
    case 'pine': {
      const trunk = new THREE.CylinderGeometry(sh.trunkR * 0.7, sh.trunkR, sh.canopyY * 0.6, 6).translate(0, sh.canopyY * 0.3, 0);
      parts.push(colorize(trunk, C('#6b4a2e')));
      for (let i = 0; i < 3; i++) {
        const r = sh.canopyR * (1.05 - i * 0.28);
        const cone = new THREE.ConeGeometry(r, sh.canopyR * 1.5, 7).translate(0, sh.canopyY - sh.canopyR * 0.6 + i * sh.canopyR * 0.8, 0);
        parts.push(colorize(cone, C(i === 1 ? '#2f6b3a' : '#2a5f34')));
      }
      break;
    }
    case 'oak': {
      const trunk = new THREE.CylinderGeometry(sh.trunkR * 0.6, sh.trunkR, sh.canopyY, 6).translate(0, sh.canopyY / 2, 0);
      parts.push(colorize(trunk, C('#6b4a2e')));
      const a = new THREE.IcosahedronGeometry(sh.canopyR, det).scale(1, 0.82, 1).translate(0, sh.canopyY, 0);
      const b2 = new THREE.IcosahedronGeometry(sh.canopyR * 0.62, det).translate(sh.canopyR * 0.55, sh.canopyY + sh.canopyR * 0.35, sh.canopyR * 0.2);
      const c2 = new THREE.IcosahedronGeometry(sh.canopyR * 0.55, det).translate(-sh.canopyR * 0.5, sh.canopyY + sh.canopyR * 0.2, -sh.canopyR * 0.3);
      parts.push(colorize(a, C('#4a8a34')), colorize(b2, C('#5a9a3c')), colorize(c2, C('#3f7a2e')));
      break;
    }
    case 'birch': {
      const trunk = new THREE.CylinderGeometry(sh.trunkR * 0.6, sh.trunkR, sh.canopyY * 1.1, 6).translate(0, sh.canopyY * 0.55, 0);
      parts.push(colorize(trunk, C('#e8e4da')));
      const a = new THREE.IcosahedronGeometry(sh.canopyR, det).scale(0.85, 1.25, 0.85).translate(0, sh.canopyY, 0);
      parts.push(colorize(a, C('#8cc04a')));
      break;
    }
    case 'cypress': {
      const trunk = new THREE.CylinderGeometry(sh.trunkR * 0.6, sh.trunkR, sh.canopyY * 0.5, 6).translate(0, sh.canopyY * 0.25, 0);
      parts.push(colorize(trunk, C('#5a3e28')));
      const a = new THREE.IcosahedronGeometry(sh.canopyR, det).scale(1, 2.6, 1).translate(0, sh.canopyY + sh.canopyR * 0.6, 0);
      parts.push(colorize(a, C('#2e5a34')));
      break;
    }
    case 'palm': {
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const h = sh.canopyY / segs;
        const cyl = new THREE.CylinderGeometry(sh.trunkR * (0.85 - i * 0.08), sh.trunkR * (0.95 - i * 0.08), h, 6).translate(i * i * 0.06, h * (i + 0.5), 0);
        parts.push(colorize(cyl, C(i % 2 ? '#8a6a44' : '#7a5a3a')));
      }
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.ConeGeometry(0.5, sh.canopyR * 1.6, 4).scale(1, 1, 0.25);
        leaf.rotateZ(-Math.PI / 2 + 0.45);
        leaf.translate(sh.canopyR * 0.75, 0, 0);
        leaf.rotateY((k / 7) * Math.PI * 2);
        leaf.translate(1.0, sh.canopyY, 0);
        parts.push(colorize(leaf, C(k % 2 ? '#3f8a34' : '#4f9a3c')));
      }
      break;
    }
    case 'cactus': {
      const body = new THREE.CylinderGeometry(sh.trunkR, sh.trunkR, sh.canopyY * 1.6, 8).translate(0, sh.canopyY * 0.8, 0);
      const top = new THREE.SphereGeometry(sh.trunkR, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, sh.canopyY * 1.6, 0);
      const arm1 = new THREE.CylinderGeometry(sh.trunkR * 0.6, sh.trunkR * 0.6, 1.0, 6).translate(sh.trunkR + 0.35, sh.canopyY * 1.0, 0);
      const arm1b = new THREE.CylinderGeometry(sh.trunkR * 0.6, sh.trunkR * 0.6, 0.6, 6).rotateZ(Math.PI / 2).translate(sh.trunkR + 0.05, sh.canopyY * 0.75, 0);
      const arm2 = new THREE.CylinderGeometry(sh.trunkR * 0.55, sh.trunkR * 0.55, 0.8, 6).translate(-sh.trunkR - 0.3, sh.canopyY * 1.15, 0);
      const arm2b = new THREE.CylinderGeometry(sh.trunkR * 0.55, sh.trunkR * 0.55, 0.5, 6).rotateZ(Math.PI / 2).translate(-sh.trunkR - 0.05, sh.canopyY * 0.95, 0);
      for (const g of [body, top, arm1, arm1b, arm2, arm2b]) parts.push(colorize(g, C('#4f8f3f')));
      break;
    }
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

export interface SceneryBuild {
  group: THREE.Group;
  flag: THREE.Mesh;
  flagGeo: THREE.BufferGeometry;
  flagBase: Float32Array;
  pinGroup: THREE.Group;
}

export function buildScenery(world: HoleWorld, quality: Quality, visualHeight: (x: number, z: number) => number): SceneryBuild {
  const h = world.hole;
  const t = h.theme;
  const group = new THREE.Group();
  const rng = new RNG(h.seed + 17);
  const vmat = litMaterial(quality, { vertexColors: true, flatShading: true, roughness: 0.9 });
  const tint = new THREE.Color();

  // trees
  const kinds = Array.from(new Set(h.trees.map((x) => x.kind)));
  for (const kind of kinds) {
    const list = h.trees.filter((x) => x.kind === kind);
    const geo = treeGeometry(kind, quality);
    const inst = new THREE.InstancedMesh(geo, vmat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((tr, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      m.compose(new THREE.Vector3(tr.x, visualHeight(tr.x, tr.z) - 0.1, tr.z), q, new THREE.Vector3(tr.s, tr.s, tr.s));
      inst.setMatrixAt(i, m);
      tint.setHSL(0, 0, rng.range(0.82, 1.12));
      inst.setColorAt(i, tint);
    });
    inst.castShadow = quality !== 'low';
    inst.receiveShadow = false;
    group.add(inst);
  }

  // rocks
  if (h.rocks.length) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = litMaterial(quality, { color: t.rockColor, flatShading: true, roughness: 1 });
    const inst = new THREE.InstancedMesh(geo, mat, h.rocks.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    h.rocks.forEach((rk, i) => {
      q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
      const y = world.height(rk.x, rk.z) + rk.r * 0.25;
      m.compose(new THREE.Vector3(rk.x, y, rk.z), q, new THREE.Vector3(rk.r, rk.r * rng.range(0.85, 1.05), rk.r));
      inst.setMatrixAt(i, m);
      tint.setHSL(0, 0, rng.range(0.85, 1.1));
      inst.setColorAt(i, tint);
    });
    inst.castShadow = quality !== 'low';
    inst.receiveShadow = quality !== 'low';
    group.add(inst);
  }

  // grass tufts / flowers in the rough near play
  const tuftCount = quality === 'low' ? 0 : quality === 'medium' ? 1800 : 4500;
  if (tuftCount) {
    const tg = new THREE.ConeGeometry(0.12, 0.45, 4).translate(0, 0.2, 0);
    const tm = new THREE.MeshLambertMaterial({ color: t.grassTufts });
    const inst = new THREE.InstancedMesh(tg, tm, tuftCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let tries = 0; tries < tuftCount * 4 && n < tuftCount; tries++) {
      const along = rng.range(-10, h.pathLen + 30);
      const lat = (rng.chance(0.5) ? 1 : -1) * (h.fairwayHalf + rng.range(2, 50));
      const p = world.frame(along, lat);
      const s = world.surface(p.x, p.z);
      if (s !== 'rough' && s !== 'deepRough' && s !== 'waste') continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6));
      const sc = rng.range(0.6, 1.4);
      m.compose(new THREE.Vector3(p.x, visualHeight(p.x, p.z) - 0.05, p.z), q, new THREE.Vector3(sc, sc * rng.range(0.8, 1.6), sc));
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    group.add(inst);
  }

  // out-of-bounds stakes
  {
    const pts: THREE.Vector3[] = [];
    for (let s = -20; s < h.pathLen + 40; s += 16) {
      for (const side of [-1, 1]) {
        if (t.ocean && side * t.ocean.side * (h.mirrored ? -1 : 1) > 0) continue;
        const p = world.frame(s, side * h.boundsHalf);
        if (world.waterAt(p.x, p.z) !== null) continue;
        pts.push(new THREE.Vector3(p.x, visualHeight(p.x, p.z), p.z));
      }
    }
    const g = new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff' }), pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    group.add(inst);
  }

  // tee markers
  {
    const p0 = h.path[0];
    const p1 = h.path[1];
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const rx = -(p1.z - p0.z) / l, rz = (p1.x - p0.x) / l;
    const g = new THREE.SphereGeometry(0.16, 12, 8);
    const mat = new THREE.MeshStandardMaterial({ color: '#2a6ad8', roughness: 0.4 });
    for (const s of [-3.5, 3.5]) {
      const mk = new THREE.Mesh(g, mat);
      const x = p0.x + rx * s, z = p0.z + rz * s;
      mk.position.set(x, visualHeight(x, z) + 0.12, z);
      mk.castShadow = true;
      group.add(mk);
    }
  }

  // pin, flag and cup
  const pinGroup = new THREE.Group();
  const pin = h.pin;
  const py = world.height(pin.x, pin.z);
  pinGroup.position.set(pin.x, py, pin.z);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0d0f0d' }));
  cup.position.y = 0.012;
  pinGroup.add(cup);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f4f4f4' }));
  rim.position.y = 0.013;
  pinGroup.add(rim);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: '#f8f8f8', roughness: 0.3 }));
  pole.castShadow = true;
  pinGroup.add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.75, 0.48, 10, 4).translate(0.375, 0, 0);
  const flagBase = (flagGeo.attributes.position.array as Float32Array).slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: t.flag, side: THREE.DoubleSide, roughness: 0.7 }));
  flag.position.y = 2.15;
  flag.castShadow = true;
  pinGroup.add(flag);
  group.add(pinGroup);

  // distant scenery
  const far = new THREE.Group();
  const mrng = new RNG(h.seed + 3);
  const cx = (h.bbox.minX + h.bbox.maxX) / 2;
  const cz = (h.bbox.minZ + h.bbox.maxZ) / 2;
  const mtnMat = new THREE.MeshLambertMaterial({ color: t.mountains, flatShading: true });
  const snowMat = new THREE.MeshLambertMaterial({ color: '#f4f6f8', flatShading: true });
  const nM = quality === 'low' ? 14 : 26;
  for (let i = 0; i < nM; i++) {
    const a = (i / nM) * Math.PI * 2 + mrng.range(-0.1, 0.1);
    const dx = Math.cos(a), dz = Math.sin(a);
    if (t.ocean) {
      // keep the ocean side open
      const sideX = t.ocean.side * (h.mirrored ? -1 : 1);
      if (dx * sideX > 0.2) continue;
    }
    const r = mrng.range(1500, 2200);
    const hgt = t.id === 'highland' ? mrng.range(260, 520) : t.id === 'desert' ? mrng.range(90, 200) : mrng.range(110, 260);
    let geo: THREE.BufferGeometry;
    if (t.id === 'desert') geo = new THREE.CylinderGeometry(mrng.range(80, 160), mrng.range(160, 260), hgt, 7);
    else geo = new THREE.ConeGeometry(mrng.range(260, 420), hgt, 7);
    const m = new THREE.Mesh(geo, mtnMat);
    m.position.set(cx + dx * r, hgt / 2 - 10, cz + dz * r);
    m.rotation.y = mrng.range(0, 3);
    far.add(m);
    if (t.id === 'highland' && hgt > 380) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(110, hgt * 0.25, 7), snowMat);
      cap.position.set(m.position.x, hgt - 10 - hgt * 0.125, m.position.z);
      cap.rotation.y = m.rotation.y;
      far.add(cap);
    }
  }
  // clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#d8e4ec' });
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(mrng.range(18, 34), 0), cloudMat);
      s.position.set(k * 26 - 40, mrng.range(-5, 8), mrng.range(-10, 10));
      s.scale.y = 0.6;
      cl.add(s);
    }
    const a = mrng.range(0, Math.PI * 2);
    const r = mrng.range(500, 1300);
    cl.position.set(cx + Math.cos(a) * r, mrng.range(180, 320), cz + Math.sin(a) * r);
    far.add(cl);
  }
  if (t.ocean) {
    // a lighthouse on a distant headland
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 10), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
    tower.position.y = 13;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 5, 10), new THREE.MeshLambertMaterial({ color: '#d83a3a' }));
    band.position.y = 15;
    const top = new THREE.Mesh(new THREE.ConeGeometry(4, 5, 10), new THREE.MeshLambertMaterial({ color: '#202020' }));
    top.position.y = 28.5;
    lh.add(tower, band, top);
    const sideX = t.ocean.side * (h.mirrored ? -1 : 1);
    lh.position.set(cx + sideX * 520, OCEAN_LEVEL + 20, cz - 300);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(30, 0), new THREE.MeshLambertMaterial({ color: t.rockColor, flatShading: true }));
    rock.position.set(lh.position.x, OCEAN_LEVEL - 4, lh.position.z);
    rock.scale.y = 0.85;
    far.add(rock, lh);
  }
  group.add(far);
  return { group, flag, flagGeo, flagBase, pinGroup };
}
