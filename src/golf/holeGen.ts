import { RNG, hashString } from '../core/rng';
import { cumulative, pointAt, yawOf, type V2 } from '../core/math';
import { YD_TO_M } from '../core/units';
import type { Bunker, CourseTheme, Ellipse, Hill, HoleLayout, HoleSpec, Rock, Tree, TreeKind, WaterBody } from './types';

/** Convert a compact hole spec into a full layout description. Deterministic for a given seed. */
export function generateHole(
  spec: HoleSpec,
  theme: CourseTheme,
  index: number,
  courseId: string,
  mirrored = false,
): HoleLayout {
  const seed = hashString(`${courseId}:${index}:${mirrored ? 'b' : 'f'}`);
  const rng = new RNG(seed);
  const mir = mirrored ? -1 : 1;
  const L = spec.length * YD_TO_M;
  const bend = (spec.bend ?? 0) * YD_TO_M * mir;
  const bend2 = (spec.bend2 ?? 0) * YD_TO_M * mir;

  // --- centre line --------------------------------------------------------
  let fr: number[];
  let off: number[];
  if (spec.bend2 !== undefined) {
    fr = [0, 0.36, 0.7, 1];
    off = [0, 0, bend, bend + bend2];
  } else if (spec.bend) {
    const b = spec.bendAt ?? 0.58;
    fr = [0, b, 1];
    off = [0, 0, bend];
  } else {
    fr = [0, 0.5, 1];
    off = [0, 0, 0];
  }
  let zScale = L;
  let path: V2[] = [];
  for (let it = 0; it < 4; it++) {
    path = fr.map((f, i) => ({ x: off[i], z: -f * zScale }));
    const c = cumulative(path);
    zScale *= L / c[c.length - 1];
  }
  const cum = cumulative(path);
  const pathLen = cum[cum.length - 1];
  const greenC = path[path.length - 1];
  const lastSeg = { x: greenC.x - path[path.length - 2].x, z: greenC.z - path[path.length - 2].z };
  const approachYaw = yawOf(lastSeg.x, lastSeg.z);

  const greenR = (spec.greenR ?? (spec.par === 3 ? 13 : spec.par === 4 ? 15 : 16)) * YD_TO_M * 1.05;
  const green: Ellipse = { c: greenC, rx: greenR, rz: greenR * 1.22, rot: approachYaw };

  // Pin: local (lateral, along) within green
  const [pl, pa] = spec.pin ?? [rng.range(-0.45, 0.45), rng.range(-0.4, 0.4)];
  const pin = localToWorld(green, pl * green.rx * mir, pa * green.rz);

  const fairwayHalf = ((spec.fw ?? 42) * YD_TO_M) / 2;
  const fairwayStart = spec.par === 3 ? pathLen - greenR - 30 : Math.min(115 * YD_TO_M, pathLen * 0.33);
  const fairwayEnd = pathLen;

  // --- heights ------------------------------------------------------------
  const teeH = spec.teeElev ?? 0;
  const greenH = spec.elev ?? 0;
  const profile: Array<[number, number]> = [[0, teeH]];
  if (teeH > 2) profile.push([45, teeH * 0.15]);
  const roll = theme.noiseAmp * 0.6;
  const mids = Math.max(1, Math.floor(pathLen / 120));
  for (let i = 1; i <= mids; i++) {
    const s = (pathLen * i) / (mids + 1);
    if (s < 50) continue;
    const base = (teeH > 2 ? teeH * 0.15 : teeH) + (greenH - (teeH > 2 ? teeH * 0.15 : teeH)) * (s / pathLen);
    profile.push([s, base + rng.range(-roll, roll)]);
  }
  profile.push([pathLen, greenH]);

  const tiltDeg = spec.greenTilt ?? rng.range(-40, 40);
  const grade = (spec.greenSlope ?? 1.6) / 100;
  // slope vector: height increases along direction (approach yaw + tilt) => ball breaks toward tee by default
  const tyaw = approachYaw + ((tiltDeg * Math.PI) / 180) * mir;
  const greenSlope = { x: Math.sin(tyaw) * grade, z: -Math.cos(tyaw) * grade };
  const greenBumps: Hill[] = [];
  const nb = rng.int(1, 2);
  for (let i = 0; i < nb; i++) {
    greenBumps.push({
      c: localToWorld(green, rng.range(-0.6, 0.6) * green.rx, rng.range(-0.6, 0.6) * green.rz),
      r: rng.range(4, 7),
      h: rng.range(-0.18, 0.22) * (grade * 50),
    });
  }

  // --- hazards ----------------------------------------------------------------
  const frame = (along: number, lateral: number): V2 => {
    const p = pointAt(path, cum, along);
    // right normal of tangent (tx,tz) with forward=-z => (-tz, tx)
    return { x: p.x + -p.tz * lateral, z: p.z + p.tx * lateral };
  };
  const yawAt = (along: number) => {
    const p = pointAt(path, cum, along);
    return yawOf(p.tx, p.tz);
  };

  const bunkers: Bunker[] = [];
  for (const b of spec.bunkers ?? []) {
    const along = b[0] * YD_TO_M;
    const lat = b[1] * YD_TO_M * mir;
    const size = b[2] * YD_TO_M;
    bunkers.push({
      c: frame(along, lat),
      rx: size * 0.6,
      rz: size * (b[3] ?? 1.1),
      rot: yawAt(along) + rng.range(-0.4, 0.4),
      depth: 0.7,
      kind: 'bunker',
    });
  }
  const gb: Record<string, [number, number]> = {
    L: [-1, 0], R: [1, 0], F: [0, 1], B: [0, -1], FL: [-0.75, 0.75], FR: [0.75, 0.75], BL: [-0.75, -0.75], BR: [0.75, -0.75],
  };
  for (const k of spec.greenBunkers ?? []) {
    const [lx, lz] = gb[k];
    const nx = lx * mir;
    const dist = 1.32;
    const c = localToWorld(green, nx * green.rx * dist, lz * green.rz * dist);
    bunkers.push({
      c,
      rx: rng.range(3.5, 5),
      rz: rng.range(6, 9),
      rot: green.rot + Math.atan2(nx, lz) + Math.PI / 2,
      depth: 0.9,
      kind: 'bunker',
    });
  }
  for (const w of spec.waste ?? []) {
    bunkers.push({
      c: frame(w[0] * YD_TO_M, w[1] * YD_TO_M * mir),
      rx: w[2] * YD_TO_M,
      rz: w[3] * YD_TO_M,
      rot: yawAt(w[0] * YD_TO_M) + rng.range(-0.3, 0.3),
      depth: 0.25,
      kind: 'waste',
    });
  }

  const water: WaterBody[] = [];
  for (const w of spec.water ?? []) {
    water.push({
      c: frame(w[0] * YD_TO_M, w[1] * YD_TO_M * mir),
      rx: w[2] * YD_TO_M,
      rz: w[3] * YD_TO_M,
      rot: yawAt(w[0] * YD_TO_M),
      level: 0,
    });
  }
  for (const along of spec.creek ?? []) {
    const a = along * YD_TO_M;
    water.push({ c: frame(a, 0), rx: fairwayHalf + 70, rz: 5.5, rot: yawAt(a), level: 0 });
  }

  const hills: Hill[] = [];
  const nh = Math.round((spec.hills ?? 1) * (pathLen / 70));
  for (let i = 0; i < nh; i++) {
    const along = rng.range(20, pathLen - 30);
    const side = rng.chance(0.5) ? 1 : -1;
    const lat = side * rng.range(fairwayHalf * 0.6, fairwayHalf + 35);
    hills.push({ c: frame(along, lat), r: rng.range(12, 28), h: rng.range(0.8, 3.2) * (spec.hills ?? 1) });
  }

  const boundsHalf = fairwayHalf + 62;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const margin = boundsHalf + 55;
  const bbox = { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };

  const layout: HoleLayout = {
    index,
    name: spec.name,
    par: spec.par,
    seed,
    tee: { x: 0, z: 0 },
    pin,
    path,
    cum,
    pathLen,
    fairwayHalf,
    fairwayStart,
    fairwayEnd,
    green,
    greenSlope,
    greenBumps,
    bunkers,
    water,
    hills,
    trees: [],
    rocks: [],
    heights: { tee: teeH, green: greenH, profile },
    boundsHalf,
    bbox,
    theme,
    mirrored,
    treeMul: spec.treeMul ?? 1,
    rockMul: spec.rocks ?? 1,
  };
  return layout;
}

export function localToWorld(e: Ellipse, lx: number, lz: number): V2 {
  // local: x = right, z = "forward" (toward back of green) in ellipse frame with yaw rot
  const s = Math.sin(e.rot);
  const c = Math.cos(e.rot);
  // forward dir = (s, -c), right dir = (c, s)
  return { x: e.c.x + c * lx + s * lz, z: e.c.z + s * lx - c * lz };
}

/** Normalised ellipse radius (<1 inside). */
export function ellipseN(e: Ellipse, x: number, z: number): number {
  const dx = x - e.c.x;
  const dz = z - e.c.z;
  const s = Math.sin(e.rot);
  const c = Math.cos(e.rot);
  const lx = c * dx + s * dz;
  const lz = s * dx - c * dz;
  return Math.sqrt((lx / e.rx) ** 2 + (lz / e.rz) ** 2);
}

export const TREE_SHAPES: Record<TreeKind, { trunkR: number; canopyY: number; canopyR: number }> = {
  pine: { trunkR: 0.35, canopyY: 6, canopyR: 3.2 },
  oak: { trunkR: 0.45, canopyY: 6.5, canopyR: 4.2 },
  birch: { trunkR: 0.25, canopyY: 7, canopyR: 2.8 },
  cypress: { trunkR: 0.3, canopyY: 6, canopyR: 2.2 },
  palm: { trunkR: 0.3, canopyY: 8.5, canopyR: 3.0 },
  cactus: { trunkR: 0.45, canopyY: 2.2, canopyR: 1.2 },
};

export function makeTree(x: number, z: number, s: number, kind: TreeKind): Tree {
  const sh = TREE_SHAPES[kind];
  return { x, z, s, kind, trunkR: sh.trunkR * s, canopyY: sh.canopyY * s, canopyR: sh.canopyR * s };
}

export function makeRock(x: number, z: number, r: number): Rock {
  return { x, z, r };
}
