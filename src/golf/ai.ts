import { RNG } from '../core/rng';
import { clamp, DEG, projectOnPath, yawOf, type V2 } from '../core/math';
import { botSkill, type BotSkill } from '../data/bots';
import { clubPerformance } from '../data/clubs';
import { simulate } from './physics';
import { isPutter, planShot, type ClubRef, type ShotSetup, type Trajectory } from './shot';
import type { Match } from './match';
import type { Surface } from './types';
import type { HoleWorld } from './world';

/** Expected strokes to hole out from a position (a simple strokes-gained style baseline). */
export function expectedStrokes(d: number, surf: Surface): number {
  if (surf === 'green') return 1 + Math.min(1.4, 0.42 * Math.log(1 + d / 1.3));
  const base = 2.35 + 0.0047 * d;
  switch (surf) {
    case 'fringe':
      return Math.min(base, 1.08 + Math.min(1.4, 0.42 * Math.log(1 + d / 1.3)) + 0.05);
    case 'fairway':
    case 'tee':
      return base;
    case 'rough':
      return base + 0.22;
    case 'deepRough':
      return base + 0.45;
    case 'bunker':
      return base + 0.35 + (d > 60 ? 0.2 : 0);
    case 'waste':
      return base + 0.18;
    default:
      return base + 1;
  }
}

export interface BotDecision {
  club: ClubRef;
  power: number;
  aimYaw: number;
  shape: number;
  traj: Trajectory;
  needle: number;
  thinking: string;
}

interface Candidate {
  club: ClubRef;
  power: number;
  aimYaw: number;
  shape: number;
  score: number;
  label: string;
}

const EXPECTED_ROLL: Record<string, number> = { driver: 24, wood: 16, hybrid: 10, iron: 6, wedge: 2, putter: 0 };

function evalOutcome(world: HoleWorld, sim: ReturnType<typeof simulate>, curE: number): number {
  const pin = world.hole.pin;
  if (sim.outcome === 'holed') return 0;
  if (sim.outcome === 'water') {
    const d = sim.dropPoint ? Math.hypot(sim.dropPoint.x - pin.x, sim.dropPoint.z - pin.z) : 200;
    return 1 + expectedStrokes(d, 'rough');
  }
  if (sim.outcome === 'oob') return 1 + curE;
  const d = Math.hypot(sim.final.x - pin.x, sim.final.z - pin.z);
  let e = expectedStrokes(d, sim.surface);
  // tree trouble: a ball sitting under trees is penalised a little
  const near = world.nearby(sim.final.x, sim.final.z);
  if (near && sim.surface !== 'green') {
    for (const id of near) {
      if (id < 0) continue;
      const t = world.hole.trees[id];
      if (Math.hypot(t.x - sim.final.x, t.z - sim.final.z) < t.canopyR + 1) { e += 0.25; break; }
    }
  }
  return e;
}

export function decideBotShot(match: Match, pi: number, rng: RNG): BotDecision {
  const p = match.players[pi];
  const bot = p.bot!;
  const skill = botSkill(bot);
  const world = match.world;
  const pin = world.hole.pin;
  const ball = p.ball;
  const pinDist = Math.hypot(pin.x - ball.x, pin.z - ball.z);
  const pinYaw = yawOf(pin.x - ball.x, pin.z - ball.z);
  const curE = expectedStrokes(pinDist, p.lie);
  // the bot's read of the wind
  const w = match.wind;
  const readErr = skill.windRead;
  const wm = 1 + rng.normal() * readErr * 0.6;
  const wa = rng.normal() * readErr * 0.5;
  const estWind: V2 = { x: (w.x * Math.cos(wa) - w.z * Math.sin(wa)) * wm, z: (w.x * Math.sin(wa) + w.z * Math.cos(wa)) * wm };
  const gs = world.hole.theme.greenSpeed;
  const opt = { needle: null, greenSpeed: gs, normalAt: (x: number, z: number) => world.normal(x, z), pin };

  const putter = p.bag.find(isPutter);
  const onGreen = p.lie === 'green' || (p.lie === 'fringe' && pinDist < 18);
  const candidates: Candidate[] = [];

  const trySim = (club: ClubRef, power: number, aimYaw: number, shape: number, wind: V2, needle: number | null = null) => {
    const setup = match.makeSetup(pi, club, power, aimYaw, shape);
    const plan = planShot(setup, { ...opt, needle });
    const r = simulate(world, plan.launch, isPutter(club) ? plan.wind : wind, plan.phys, { record: false, maxTime: 20 });
    return { sim: r, setup };
  };

  if (onGreen && putter) {
    const perf = clubPerformance(putter.def, putter.level);
    // coarse grid then refine
    let best = { score: Infinity, yaw: pinYaw, power: 0.5 };
    const evalPutt = (yaw: number, power: number) => {
      const { sim } = trySim(putter, power, yaw, 0, estWind);
      let s = evalOutcome(world, sim, curE);
      if (sim.outcome !== 'holed') {
        // prefer leaving it slightly past the hole
        const past = (sim.final.x - pin.x) * Math.sin(yaw) + (sim.final.z - pin.z) * -Math.cos(yaw);
        if (past < 0) s += 0.04;
      }
      if (s < best.score) best = { score: s, yaw, power };
    };
    for (let a = -0.3; a <= 0.3001; a += 0.06) {
      for (const k of [0.95, 1.1, 1.3]) evalPutt(pinYaw + a, clamp((pinDist * k) / perf.maxCarry, 0.03, 1.1));
    }
    const c = best;
    for (let a = -0.05; a <= 0.0501; a += 0.0125) {
      for (const k of [0.92, 1, 1.08]) evalPutt(c.yaw + a, clamp(c.power * k, 0.03, 1.1));
    }
    const needle = sampleNeedle(rng, skill, skill.puttMul * 0.8);
    const powerErr = 1 + rng.normal() * skill.puttPowerSigma * skill.puttMul;
    return {
      club: putter,
      power: clamp(best.power * powerErr, 0.02, 1.1),
      aimYaw: best.yaw + rng.normal() * skill.puttAimSigmaDeg * skill.puttMul * DEG,
      shape: 0,
      traj: 'normal',
      needle,
      thinking: pinDist > 8 ? 'Lagging it close' : 'Going for the cup',
    };
  }

  // -------- full / partial shots
  const clubs = p.bag.filter((c) => !isPutter(c) && !(c.def.category === 'driver' && p.lie !== 'tee' && pinDist < 230));
  const targets: Array<{ x: number; z: number; label: string }> = [{ x: pin.x, z: pin.z, label: 'pin' }];
  // lay-up points along the centre line
  const pr = projectOnPath(world.hole.path, world.hole.cum, ball.x, ball.z);
  for (const c of clubs) {
    const perf = clubPerformance(c.def, c.level);
    const reach = perf.maxCarry + EXPECTED_ROLL[c.def.category];
    const along = pr.along + reach * 0.97;
    if (along < world.hole.pathLen - 20) {
      const pt = world.frame(along, 0);
      targets.push({ x: pt.x, z: pt.z, label: 'layup' });
    }
  }
  // AI evaluates each target with the clubs that fit it
  for (const t of targets) {
    const d = Math.hypot(t.x - ball.x, t.z - ball.z);
    const yaw = yawOf(t.x - ball.x, t.z - ball.z);
    const maxPow = bot.archetype === 'power' ? 1.04 : 1.0;
    let fits = clubs
      .map((c) => {
        const perf = clubPerformance(c.def, c.level);
        const roll = t.label === 'pin' ? EXPECTED_ROLL[c.def.category] * (p.lie === 'rough' ? 1.4 : 1) * Math.min(1, d / 120) : 0;
        const need = Math.max(3, d - roll);
        return { c, power: need / perf.maxCarry };
      })
      .filter((f) => f.power <= maxPow * skill.aggression && f.power >= 0.25)
      .sort((a, b) => b.power - a.power)
      .slice(0, 2);
    if (fits.length === 0 && t.label === 'pin') {
      const shortest = clubs[clubs.length - 1];
      const perf = shortest ? clubPerformance(shortest.def, shortest.level) : null;
      if (shortest && perf && d < perf.maxCarry) fits = [{ c: shortest, power: Math.max(0.06, d / perf.maxCarry) }];
      else if (clubs[0]) fits = [{ c: clubs[0], power: 1 }];
    }
    for (const f of fits) {
      const powers = t.label === 'pin' ? [f.power * 0.96, f.power * 1.03] : [Math.min(maxPow, f.power)];
      for (const pw of powers) {
        for (const off of skill.aimOffsets) {
          const ay = yaw + off * DEG;
          const { sim } = trySim(f.c, clamp(pw, 0.05, 1.05), ay, 0, estWind);
          let s = evalOutcome(world, sim, curE);
          s += Math.abs(off) * 0.002;
          candidates.push({ club: f.c, power: clamp(pw, 0.05, 1.05), aimYaw: ay, shape: 0, score: s, label: t.label });
        }
      }
    }
  }
  if (candidates.length === 0) {
    const c = clubs[clubs.length - 1] ?? p.bag[0];
    candidates.push({ club: c, power: 0.6, aimYaw: pinYaw, shape: 0, score: 9, label: 'pin' });
  }
  candidates.sort((a, b) => a.score - b.score);
  // risk analysis: re-simulate top candidates with execution noise
  const top = candidates.slice(0, 5);
  const riskRng = new RNG(rng.int(1, 1e9));
  let chosen = top[0];
  let chosenScore = Infinity;
  for (const c of top) {
    const outs: number[] = [];
    for (let k = 0; k < 4; k++) {
      const needle = clamp(riskRng.normal() * skill.needleSigma, -1, 1);
      const pw = c.power * (1 + riskRng.normal() * skill.powerSigma);
      const { sim } = trySim(c.club, clamp(pw, 0.04, 1.08), c.aimYaw, c.shape, estWind, needle);
      outs.push(evalOutcome(world, sim, curE));
    }
    const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
    const worst = Math.max(...outs);
    const score = 0.5 * c.score + 0.5 * mean + skill.risk * 0.25 * (worst - mean);
    if (score < chosenScore) { chosenScore = score; chosen = c; }
  }
  const isShort = pinDist < 55;
  const sigmaMul = isShort ? skill.shortGameMul : skill.longGameMul;
  const needle = sampleNeedle(rng, skill, sigmaMul);
  const power = clamp(chosen.power * (1 + rng.normal() * skill.powerSigma * sigmaMul), 0.04, 1.08);
  const aimYaw = chosen.aimYaw + rng.normal() * skill.aimSigmaDeg * sigmaMul * DEG;
  const thinking =
    chosen.label === 'layup' ? `Laying up with the ${chosen.club.def.name}` : pinDist < 50 ? 'Pitching at the flag' : `Attacking the pin with the ${chosen.club.def.name}`;
  return { club: chosen.club, power, aimYaw, shape: chosen.shape, traj: 'normal', needle, thinking };
}

function sampleNeedle(rng: RNG, skill: BotSkill, mul: number): number {
  if (rng.chance(skill.blunder)) return (rng.chance(0.5) ? 1 : -1) * rng.range(0.7, 1);
  return clamp(rng.normal() * skill.needleSigma * mul, -1, 1);
}

export function botSetup(match: Match, pi: number, d: BotDecision): ShotSetup {
  return match.makeSetup(pi, d.club, d.power, d.aimYaw, d.shape, d.traj);
}
