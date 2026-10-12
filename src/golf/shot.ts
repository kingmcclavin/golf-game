import { applyAbility, defaultShotMods, type AbilityContext, type ShotMods } from '../data/abilities';
import { clubPerformance, SUBTYPES, type ClubDef } from '../data/clubs';
import { clamp, DEG, type V2, type V3 } from '../core/math';
import { BALL_R, defaultPhysMods, simulate, speedForCarry, type Launch, type PhysMods, type SimResult } from './physics';
import type { HoleWorld } from './world';
import type { Surface } from './types';

export type Trajectory = 'low' | 'normal' | 'high';

export interface ClubRef {
  def: ClubDef;
  level: number;
}

export interface ShotSetup {
  club: ClubRef;
  power: number; // 0..1.1
  shape: number; // -1 (draw) .. 1 (fade)
  traj: Trajectory;
  aimYaw: number;
  ball: V3;
  lie: Surface;
  slope: number;
  wind: V2;
  ctx: AbilityContext;
}

export interface SwingTuning {
  perfectWindow: number;
  needleSpeed: number;
  abilityActive: boolean;
  liePenalty: number;
}

export interface ShotPlan {
  launch: Launch;
  wind: V2;
  phys: PhysMods;
  perfect: boolean;
  targetCarry: number;
  dirErrDeg: number;
  abilityActive: boolean;
  mods: ShotMods;
}

export const isPutter = (c: ClubRef) => c.def.category === 'putter';

export type ShotType = 'Drive' | 'Fairway wood' | 'Hybrid' | 'Iron' | 'Approach' | 'Pitch' | 'Chip' | 'Sand shot' | 'Recovery' | 'Putt' | 'Texas wedge';

/** Human-readable shot type; chips also change the launch (lower, more roll). */
export function shotType(club: ClubRef, lie: Surface, carry: number): ShotType {
  const cat = club.def.category;
  if (cat === 'putter') return lie === 'green' ? 'Putt' : 'Texas wedge';
  if (lie === 'bunker') return 'Sand shot';
  if ((lie === 'deepRough' || lie === 'waste') && cat !== 'wedge') return 'Recovery';
  if ((cat === 'wedge' || cat === 'iron') && carry < 26) return 'Chip';
  if (cat === 'wedge' && carry < 65) return 'Pitch';
  if (cat === 'driver') return lie === 'tee' ? 'Drive' : 'Recovery';
  if (cat === 'wood') return 'Fairway wood';
  if (cat === 'hybrid') return 'Hybrid';
  return carry < 150 ? 'Approach' : 'Iron';
}

function lieModifiers(club: ClubRef, lie: Surface, slope: number, mods: ShotMods, forg: number) {
  let dist = 1;
  let dir = 1;
  let launchAdd = 0;
  let spinMul = 1;
  const cat = club.def.category;
  const sub = club.def.subtype;
  if (cat === 'putter') return { dist, dir, launchAdd, spinMul, window: 1, needle: 1 };
  switch (lie) {
    case 'rough':
      dist = 1 - 0.13 * (1 - forg * 0.5) * mods.roughPenaltyMul;
      dir = 1 + 0.25 * mods.roughPenaltyMul;
      spinMul = 0.65;
      break;
    case 'deepRough':
      dist = 1 - 0.3 * (1 - forg * 0.4) * mods.roughPenaltyMul;
      dir = 1 + 0.5 * mods.roughPenaltyMul;
      spinMul = 0.45;
      break;
    case 'bunker': {
      const wedge = cat === 'wedge';
      const base = wedge ? (sub === 'sw' || sub === 'lw' ? 0.12 : 0.2) : 0.38;
      dist = 1 - base * (1 - forg * 0.3) * mods.sandPenaltyMul;
      dir = 1 + (wedge ? 0.2 : 0.6) * mods.sandPenaltyMul;
      launchAdd = wedge ? 3 : 0;
      spinMul = 0.6;
      break;
    }
    case 'waste':
      dist = 1 - 0.1 * mods.sandPenaltyMul;
      dir = 1 + 0.15 * mods.sandPenaltyMul;
      spinMul = 0.8;
      break;
  }
  if (cat === 'driver' && lie !== 'tee') {
    dist *= 0.93;
    dir *= 1.3;
  }
  const uneven = Math.max(0, slope - 0.04) * mods.unevenPenaltyMul;
  return {
    dist: dist * (1 - uneven * 0.8),
    dir,
    launchAdd,
    spinMul,
    window: clamp(1 - uneven * 3, 0.4, 1),
    needle: 1 + uneven * 4,
  };
}

/** Build modifiers from the club's ability for a given context. */
export function computeMods(club: ClubRef, ctx: AbilityContext): { mods: ShotMods; active: boolean } {
  const mods = defaultShotMods();
  const active = applyAbility(club.def.ability, club.def.stats.ability + (club.level - 1) * 2, ctx, mods);
  return { mods, active };
}

/** Needle / perfect window tuning shown to the player before release. */
export function swingTuning(setup: ShotSetup): SwingTuning {
  const perf = clubPerformance(setup.club.def, setup.club.level);
  const { mods, active } = computeMods(setup.club, { ...setup.ctx, perfect: null });
  const lm = lieModifiers(setup.club, setup.lie, setup.slope, mods, perf.forgiveness);
  const over = Math.max(0, setup.power - 1);
  const putt = isPutter(setup.club);
  const perfectWindow = clamp(perf.perfectWindow * mods.perfectWindowMul * lm.window * (1 - over * 4) * (putt ? 1.3 : 1), 0.02, 0.4);
  const needleSpeed = perf.needleSpeed * mods.needleSpeedMul * lm.needle * (0.55 + 0.5 * Math.min(1.1, setup.power)) * (1 + over * 3) * (putt ? 0.7 : 1);
  return { perfectWindow, needleSpeed, abilityActive: active, liePenalty: 1 - lm.dist };
}

function effectiveWind(wind: V2, aimYaw: number, mods: ShotMods): V2 {
  const fx = Math.sin(aimYaw), fz = -Math.cos(aimYaw);
  const rx = Math.cos(aimYaw), rz = Math.sin(aimYaw);
  let along = wind.x * fx + wind.z * fz; // + = tailwind
  let cross = wind.x * rx + wind.z * rz;
  along *= along < 0 ? mods.headwindMul : mods.tailwindMul;
  cross *= mods.crosswindMul;
  return { x: fx * along + rx * cross, z: fz * along + rz * cross };
}

function physFrom(mods: ShotMods, homingTarget?: V2): PhysMods {
  const p = defaultPhysMods();
  p.liftMul = mods.liftMul;
  p.rollMul = mods.rollMul;
  p.bounceMul = mods.bounceMul;
  p.slopeMul = mods.slopeMul;
  p.cupRadiusMul = mods.cupRadiusMul;
  p.lipCaptureMul = mods.lipCaptureMul;
  p.waterSkips = mods.waterSkips;
  p.canopyPass = mods.canopyPass;
  p.homing = mods.homing;
  p.homingTarget = homingTarget;
  p.pinMagnet = mods.pinMagnet;
  p.checkMul = mods.checkMul;
  return p;
}

export interface PlanOptions {
  /** release needle position -1..1, or null for an ideal preview */
  needle: number | null;
  greenSpeed: number;
  normalAt: (x: number, z: number) => V3;
  pin: V2;
}

export function planShot(setup: ShotSetup, opt: PlanOptions): ShotPlan {
  const club = setup.club;
  const perf = clubPerformance(club.def, club.level);
  const tune = swingTuning(setup);
  const needle = opt.needle ?? 0;
  const perfect = opt.needle !== null && Math.abs(needle) <= tune.perfectWindow;
  const ctx: AbilityContext = { ...setup.ctx, perfect: opt.needle === null ? null : perfect };
  const { mods, active } = computeMods(club, ctx);
  const lm = lieModifiers(club, setup.lie, setup.slope, mods, perf.forgiveness);

  let off = 0;
  if (!perfect && opt.needle !== null) off = (Math.abs(needle) - tune.perfectWindow) / Math.max(0.05, 1 - tune.perfectWindow);
  off = clamp(off, 0, 1);
  const sign = Math.sign(needle) || 1;
  const putt = isPutter(club);
  const dirErrDeg = sign * off * perf.maxDirErr * mods.dirErrorMul * lm.dir * (putt ? mods.puttErrorMul * 0.5 + 0.5 : 1);
  const distFactor = perfect ? 1.015 : 1 - off * perf.distErr * mods.distErrorMul * (putt ? mods.puttErrorMul : 1);
  const yaw = setup.aimYaw + dirErrDeg * DEG;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  const homingTarget = mods.homing > 0 ? opt.pin : undefined;

  if (putt) {
    const D = perf.maxCarry * setup.power * distFactor * mods.carryMul;
    const v0 = Math.sqrt(2 * opt.greenSpeed * 9.81 * Math.max(0.05, D));
    const n = opt.normalAt(setup.ball.x, setup.ball.z);
    let vx = fx * v0, vy = 0, vz = fz * v0;
    const vn = vx * n.x + vy * n.y + vz * n.z;
    vx -= vn * n.x; vy -= vn * n.y; vz -= vn * n.z;
    const l = Math.hypot(vx, vy, vz) || 1;
    vx *= v0 / l; vy *= v0 / l; vz *= v0 / l;
    return {
      launch: { pos: { ...setup.ball }, vel: { x: vx, y: vy, z: vz }, backspin: 0, sidespin: 0, putt: true },
      wind: { x: 0, z: 0 },
      phys: physFrom(mods),
      perfect,
      targetCarry: D,
      dirErrDeg,
      abilityActive: active,
      mods,
    };
  }

  const over = Math.max(0, setup.power - 1);
  const targetCarry = Math.max(1, perf.maxCarry * setup.power * lm.dist * mods.carryMul * distFactor * (1 + over * 0.0));
  const trajAdd = setup.traj === 'low' ? -3.5 : setup.traj === 'high' ? 4 : 0;
  const chip = shotType(club, setup.lie, targetCarry) === 'Chip';
  const launchDeg = clamp((perf.launchDeg + trajAdd + mods.launchAdd + lm.launchAdd) * (chip ? 0.62 : 1), 4, 60);
  const backspin = perf.backspin * mods.backspinMul * lm.spinMul * (setup.traj === 'low' ? 0.8 : setup.traj === 'high' ? 1.15 : 1) * (chip ? 0.45 : 1);
  const speed = speedForCarry(targetCarry, launchDeg, backspin) * mods.speedMul;
  const sub = SUBTYPES[club.def.subtype];
  const shapeScale = club.def.category === 'wedge' ? 0.5 : sub.cat === 'iron' ? 0.8 : 1;
  const sidespin = (setup.shape * 2200 * mods.sideSpinMul * shapeScale + sign * off * 1400) * (club.def.category === 'driver' ? 1 : 0.85);
  const la = launchDeg * DEG;
  return {
    launch: {
      pos: { x: setup.ball.x, y: setup.ball.y + (setup.lie === 'tee' ? 0.03 : 0), z: setup.ball.z },
      vel: { x: fx * speed * Math.cos(la), y: speed * Math.sin(la), z: fz * speed * Math.cos(la) },
      backspin,
      sidespin,
    },
    wind: effectiveWind(setup.wind, setup.aimYaw, mods),
    phys: physFrom(mods, homingTarget),
    perfect,
    targetCarry,
    dirErrDeg,
    abilityActive: active,
    mods,
  };
}

export interface ShotPreview {
  arc: V3[];
  landing: V3;
  carry: number;
  total: number;
  final: V3;
  spreadLat: number;
  spreadLong: number;
  puttLine?: V3[];
  clarity: number;
}

/** Predict where a shot will go. Accuracy of the preview depends on club accuracy and abilities. */
export function previewShot(world: HoleWorld, setup: ShotSetup): ShotPreview {
  const plan = planShot(setup, { needle: null, greenSpeed: world.hole.theme.greenSpeed, normalAt: (x, z) => world.normal(x, z), pin: world.hole.pin });
  const perf = clubPerformance(setup.club.def, setup.club.level);
  const clarity = clamp(setup.club.def.stats.accuracy / 100 * 0.6 + plan.mods.previewClarity, 0, 1);
  const putt = isPutter(setup.club);
  if (putt) {
    // straight aim line of the nominal (flat) distance, plus the true line when the player has the clarity
    const d = plan.targetCarry;
    const yaw = setup.aimYaw;
    const line: V3[] = [];
    for (let i = 0; i <= 24; i++) {
      const s = (d * i) / 24;
      const x = setup.ball.x + Math.sin(yaw) * s;
      const z = setup.ball.z - Math.cos(yaw) * s;
      line.push({ x, y: world.height(x, z) + 0.03, z });
    }
    let puttLine: V3[] | undefined;
    if (clarity >= 0.75) {
      const r = simulate(world, plan.launch, plan.wind, plan.phys, { record: true, maxTime: 20 });
      const keep = Math.floor((r.frameCount * Math.min(1, (clarity - 0.6) * 1.6)));
      puttLine = [];
      for (let i = 0; i < keep; i += 3) puttLine.push({ x: r.frames[i * 3], y: r.frames[i * 3 + 1] + 0.01, z: r.frames[i * 3 + 2] });
    }
    const end = line[line.length - 1];
    return { arc: line, landing: end, carry: d, total: d, final: end, spreadLat: 0, spreadLong: 0, puttLine, clarity };
  }
  // the preview "knows" only part of the wind
  const windK = 0.45 + 0.55 * clarity;
  const w = { x: plan.wind.x * windK, z: plan.wind.z * windK };
  const fly = simulate(world, plan.launch, w, plan.phys, { record: true, stopAtLanding: true, maxTime: 15 });
  const full = simulate(world, plan.launch, w, plan.phys, { record: false, maxTime: 20 });
  const arc: V3[] = [];
  const step = Math.max(1, Math.floor(fly.frameCount / 60));
  for (let i = 0; i < fly.frameCount; i += step) arc.push({ x: fly.frames[i * 3], y: fly.frames[i * 3 + 1], z: fly.frames[i * 3 + 2] });
  const landing = fly.final;
  arc.push(landing);
  const carry = Math.hypot(landing.x - setup.ball.x, landing.z - setup.ball.z);
  const total = Math.hypot(full.final.x - setup.ball.x, full.final.z - setup.ball.z);
  const spreadLat = Math.tan(perf.maxDirErr * 0.45 * DEG) * carry * (1.15 - clarity * 0.6) + 1;
  const spreadLong = carry * perf.distErr * 0.5 * (1.15 - clarity * 0.6) + 1;
  return { arc, landing, carry, total, final: full.final, spreadLat, spreadLong, clarity };
}

export function executeShot(world: HoleWorld, setup: ShotSetup, needle: number, seed: number): { plan: ShotPlan; result: SimResult } {
  const plan = planShot(setup, { needle, greenSpeed: world.hole.theme.greenSpeed, normalAt: (x, z) => world.normal(x, z), pin: world.hole.pin });
  const result = simulate(world, plan.launch, plan.wind, plan.phys, { record: true, seed });
  return { plan, result };
}

export function ballRestPosition(world: HoleWorld, x: number, z: number): V3 {
  return { x, y: world.height(x, z) + BALL_R, z };
}
