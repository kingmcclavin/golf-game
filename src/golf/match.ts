import { RNG } from '../core/rng';
import type { V2, V3 } from '../core/math';
import type { AbilityContext } from '../data/abilities';
import type { BotDef } from '../data/bots';
import type { Outfit } from '../data/cosmetics';
import { courseById } from '../data/courses';
import { getHoleWorld } from './course';
import { BALL_R, type SimResult } from './physics';
import type { ClubRef, ShotPlan, ShotSetup, Trajectory } from './shot';
import type { Surface } from './types';
import type { HoleWorld } from './world';

export type MatchLength = 3 | 9 | 18;

export interface PlayerStats {
  fairwaysHit: number;
  fairwayChances: number;
  greensInReg: number;
  putts: number;
  longestDrive: number;
  perfectShots: number;
  shots: number;
  penalties: number;
  longestPutt: number;
  abilityTriggers: number;
  birdies: number;
  eagles: number;
  holeInOnes: number;
  pars: number;
  usedRarity: string[];
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  bot?: BotDef;
  color: string;
  outfit: Outfit;
  bag: ClubRef[];
  scores: (number | null)[];
  // per hole
  ball: V3;
  lie: Surface;
  strokes: number;
  holed: boolean;
  pickedUp: boolean;
  teedOff: boolean;
  prevShotSurface: Surface | null;
  afterPenalty: boolean;
  reachedGreenIn: number | null;
  stats: PlayerStats;
}

export interface ShotReport {
  player: number;
  text: string;
  sub?: string;
  kind: 'good' | 'neutral' | 'bad' | 'great';
  holed: boolean;
  penalty: boolean;
  distance: number;
}

export const emptyStats = (): PlayerStats => ({
  fairwaysHit: 0, fairwayChances: 0, greensInReg: 0, putts: 0, longestDrive: 0, perfectShots: 0, shots: 0, penalties: 0,
  longestPutt: 0, abilityTriggers: 0, birdies: 0, eagles: 0, holeInOnes: 0, pars: 0, usedRarity: [],
});

export interface MatchConfig {
  courseId: string;
  length: MatchLength;
  difficulty: BotDef['difficulty'];
  seed: number;
  startHole?: number;
}

export class Match {
  readonly holes: number[];
  holeIdx = 0;
  winds: V2[] = [];
  readonly rng: RNG;
  shotCounter = 0;

  constructor(public readonly config: MatchConfig, public players: PlayerState[]) {
    const course = courseById(config.courseId);
    const n = course.holes.length;
    const start = config.startHole ?? 0;
    if (config.length === 18) this.holes = Array.from({ length: n * 2 }, (_, i) => i);
    else if (config.length === 9) this.holes = Array.from({ length: n }, (_, i) => i);
    else this.holes = Array.from({ length: 3 }, (_, i) => (start + i) % n);
    this.rng = new RNG(config.seed);
    const t = course.theme;
    for (let i = 0; i < this.holes.length; i++) {
      const sp = this.rng.range(t.wind[0], t.wind[1]);
      const ang = this.rng.range(0, Math.PI * 2);
      this.winds.push({ x: Math.cos(ang) * sp, z: Math.sin(ang) * sp });
    }
    for (const p of players) p.scores = this.holes.map(() => null);
    this.startHole();
  }

  get course() {
    return courseById(this.config.courseId);
  }
  get holeNumber() {
    return this.holeIdx + 1;
  }
  get totalHoles() {
    return this.holes.length;
  }
  get world(): HoleWorld {
    return getHoleWorld(this.config.courseId, this.holes[this.holeIdx]);
  }
  get wind(): V2 {
    return this.winds[this.holeIdx];
  }
  get par(): number {
    return this.world.hole.par;
  }
  get maxStrokes(): number {
    return this.par + 4;
  }

  holePar(i: number) {
    return getHoleWorld(this.config.courseId, this.holes[i]).hole.par;
  }

  startHole() {
    const w = this.world;
    const tee = w.hole.tee;
    for (const p of this.players) {
      p.ball = { x: tee.x, y: w.height(tee.x, tee.z) + BALL_R, z: tee.z };
      p.lie = 'tee';
      p.strokes = 0;
      p.holed = false;
      p.pickedUp = false;
      p.teedOff = false;
      p.prevShotSurface = null;
      p.afterPenalty = false;
      p.reachedGreenIn = null;
    }
  }

  /** Index of the player who plays next, or -1 when the hole is complete. */
  nextPlayer(): number {
    const active = this.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.holed && !p.pickedUp);
    if (active.length === 0) return -1;
    const notTeed = active.filter(({ p }) => !p.teedOff);
    if (notTeed.length > 0) {
      // honours: best score on previous hole tees first
      if (this.holeIdx === 0) return notTeed[0].i;
      const prev = this.holeIdx - 1;
      notTeed.sort((a, b) => (a.p.scores[prev] ?? 99) - (b.p.scores[prev] ?? 99) || a.i - b.i);
      return notTeed[0].i;
    }
    const w = this.world;
    active.sort((a, b) => w.distToPin(b.p.ball.x, b.p.ball.z) - w.distToPin(a.p.ball.x, a.p.ball.z));
    return active[0].i;
  }

  totalRel(p: PlayerState): number {
    let rel = 0;
    p.scores.forEach((s, i) => {
      if (s !== null) rel += s - this.holePar(i);
    });
    return rel;
  }

  totalStrokes(p: PlayerState): number {
    return p.scores.reduce<number>((a, s) => a + (s ?? 0), 0);
  }

  /** Standing relative to par including the current hole in progress (for trailing/leading checks). */
  liveRel(p: PlayerState): number {
    return this.totalRel(p);
  }

  abilityContext(pi: number): AbilityContext {
    const p = this.players[pi];
    const w = this.world;
    const wind = this.wind;
    const pin = w.hole.pin;
    const dx = pin.x - p.ball.x, dz = pin.z - p.ball.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d, fz = dz / d;
    const headwind = -(wind.x * fx + wind.z * fz);
    const crosswind = wind.x * -fz + wind.z * fx;
    const rels = this.players.map((q) => this.liveRel(q));
    const mine = rels[pi];
    const best = Math.min(...rels.filter((_, i) => i !== pi));
    const n = w.normal(p.ball.x, p.ball.z);
    const prevRel = this.holeIdx > 0 && p.scores[this.holeIdx - 1] !== null ? (p.scores[this.holeIdx - 1] as number) - this.holePar(this.holeIdx - 1) : null;
    return {
      lie: p.lie,
      distToPin: d,
      power: 1,
      perfect: null,
      isTeeShot: !p.teedOff,
      par: w.hole.par,
      strokeOnHole: p.strokes + 1,
      holeNumber: this.holeNumber,
      totalHoles: this.totalHoles,
      windSpeed: Math.hypot(wind.x, wind.z),
      headwind,
      crosswind,
      trailing: this.players.length > 1 && mine > best,
      leading: this.players.length > 1 && mine < best,
      elevationDiff: w.height(pin.x, pin.z) - p.ball.y,
      slope: Math.sqrt(Math.max(0, 1 - n.y * n.y)),
      prevShotSurface: p.prevShotSurface,
      prevHoleRelPar: prevRel,
      afterPenalty: p.afterPenalty,
      themeId: w.hole.theme.id,
      onGreen: p.lie === 'green',
    };
  }

  makeSetup(pi: number, club: ClubRef, power: number, aimYaw: number, shape = 0, traj: Trajectory = 'normal'): ShotSetup {
    const p = this.players[pi];
    const ctx = this.abilityContext(pi);
    ctx.power = power;
    const w = this.world;
    const n = w.normal(p.ball.x, p.ball.z);
    return {
      club,
      power,
      shape,
      traj,
      aimYaw,
      ball: { ...p.ball },
      lie: p.lie,
      slope: Math.sqrt(Math.max(0, 1 - n.y * n.y)),
      wind: this.wind,
      ctx,
    };
  }

  nextSeed(): number {
    return (this.config.seed * 31 + ++this.shotCounter * 7919) >>> 0;
  }

  /** Apply a finished simulation to the player's state. */
  applyShot(pi: number, setup: ShotSetup, plan: ShotPlan, result: SimResult): ShotReport {
    const p = this.players[pi];
    const w = this.world;
    const origin = { ...p.ball };
    const fromLie = p.lie;
    const wasTee = !p.teedOff;
    p.teedOff = true;
    p.strokes += 1;
    p.stats.shots++;
    if (plan.perfect) p.stats.perfectShots++;
    if (plan.abilityActive) p.stats.abilityTriggers++;
    if (!p.stats.usedRarity.includes(setup.club.def.rarity)) p.stats.usedRarity.push(setup.club.def.rarity);
    const putt = setup.club.def.category === 'putter' && fromLie === 'green';
    if (putt) p.stats.putts++;
    const dist = Math.hypot(result.final.x - origin.x, result.final.z - origin.z);
    let report: ShotReport;
    p.afterPenalty = false;

    if (result.outcome === 'holed') {
      p.holed = true;
      p.ball = { ...result.final };
      p.lie = 'green';
      if (putt) p.stats.longestPutt = Math.max(p.stats.longestPutt, dist);
      const name = p.strokes === 1 ? 'HOLE IN ONE!' : putt ? 'Drained it!' : 'Holed out!';
      report = { player: pi, text: name, kind: 'great', holed: true, penalty: false, distance: dist };
    } else if (result.outcome === 'water') {
      p.strokes += 1;
      p.stats.penalties++;
      const drop = result.dropPoint ?? origin;
      p.ball = { x: drop.x, y: w.height(drop.x, drop.z) + BALL_R, z: drop.z };
      p.lie = w.surface(p.ball.x, p.ball.z);
      if (p.lie === 'water' || p.lie === 'oob') { p.ball = origin; p.lie = fromLie; }
      p.afterPenalty = true;
      report = { player: pi, text: 'Splash! Water hazard', sub: '1 stroke penalty, dropping near the hazard', kind: 'bad', holed: false, penalty: true, distance: dist };
    } else if (result.outcome === 'oob') {
      p.strokes += 1;
      p.stats.penalties++;
      p.ball = origin;
      p.lie = fromLie === 'tee' ? 'tee' : fromLie;
      p.afterPenalty = true;
      report = { player: pi, text: 'Out of bounds', sub: 'Stroke and distance: replay from the same spot', kind: 'bad', holed: false, penalty: true, distance: dist };
    } else {
      p.ball = { ...result.final };
      p.lie = result.surface;
      const label: Record<Surface, string> = {
        tee: 'Tee box', fairway: 'Fairway', rough: 'Rough', deepRough: 'Deep rough', green: 'On the green', fringe: 'Fringe',
        bunker: 'Bunker', waste: 'Waste area', water: 'Water', oob: 'Out of bounds',
      };
      const good = p.lie === 'fairway' || p.lie === 'green' || p.lie === 'fringe';
      report = {
        player: pi,
        text: label[p.lie],
        kind: p.lie === 'green' ? 'good' : good ? 'neutral' : 'bad',
        holed: false,
        penalty: false,
        distance: dist,
      };
    }
    // stats
    if (wasTee && w.hole.par > 3) {
      p.stats.fairwayChances++;
      if (p.lie === 'fairway' && result.outcome === 'rest') p.stats.fairwaysHit++;
      if (setup.club.def.category === 'driver' && result.outcome === 'rest') p.stats.longestDrive = Math.max(p.stats.longestDrive, dist);
    }
    if ((p.lie === 'green' || p.holed) && p.reachedGreenIn === null) {
      p.reachedGreenIn = p.strokes;
      if (p.strokes <= w.hole.par - 2 || (p.holed && p.strokes <= w.hole.par - 1)) p.stats.greensInReg++;
    }
    p.prevShotSurface = result.outcome === 'rest' ? result.surface : null;
    if (!p.holed && p.strokes >= this.maxStrokes) {
      p.pickedUp = true;
      report.sub = `${report.sub ? report.sub + ' · ' : ''}Max strokes reached, picking up`;
    }
    if (p.holed || p.pickedUp) {
      const s = p.strokes;
      p.scores[this.holeIdx] = s;
      const rel = s - w.hole.par;
      if (p.holed && s === 1) p.stats.holeInOnes++;
      if (p.holed && rel <= -2) p.stats.eagles++;
      else if (p.holed && rel === -1) p.stats.birdies++;
      else if (p.holed && rel === 0) p.stats.pars++;
    }
    return report;
  }

  holeComplete(): boolean {
    return this.nextPlayer() === -1;
  }

  /** Advance to the next hole. Returns false when the round is over. */
  advance(): boolean {
    if (this.holeIdx + 1 >= this.holes.length) return false;
    this.holeIdx++;
    this.startHole();
    return true;
  }

  isOver(): boolean {
    return this.holeIdx === this.holes.length - 1 && this.holeComplete();
  }

  standings(): Array<{ player: PlayerState; index: number; rel: number; strokes: number; position: number }> {
    const rows = this.players.map((p, index) => ({ player: p, index, rel: this.totalRel(p), strokes: this.totalStrokes(p), position: 0 }));
    rows.sort((a, b) => a.rel - b.rel || a.index - b.index);
    rows.forEach((r, i) => {
      r.position = i > 0 && rows[i - 1].rel === r.rel ? rows[i - 1].position : i + 1;
    });
    return rows;
  }
}
