import { sound } from '../audio/sound';
import { clamp, DEG, wrapAngle, yawOf } from '../core/math';
import { RNG } from '../core/rng';
import { MS_TO_MPH, yd } from '../core/units';
import { abilityState, describeAbility } from '../data/abilities';
import { ARCHETYPE_INFO, DIFFICULTY_INFO, type BotDef, type Difficulty } from '../data/bots';
import { clubPerformance, SUBTYPES } from '../data/clubs';
import { courseById } from '../data/courses';
import { FEATURE_UNLOCKS, levelFromXp } from '../data/progression';
import { botSetup, decideBotShot } from '../golf/ai';
import { Match, type MatchLength, type PlayerState, type ShotReport } from '../golf/match';
import { FRAME_DT, type SimResult } from '../golf/physics';
import { makeBotPlayer, makePlayer } from '../golf/players';
import { scoreName } from '../golf/scoring';
import { executeShot, isPutter, previewShot, shotType, swingTuning, type ClubRef, type ShotPlan, type ShotPreview, type ShotSetup, type Trajectory } from '../golf/shot';
import type { V3 } from '../core/math';
import { useHud, useSwing, type CamMode, type HudState, type Message, type Phase } from '../state/matchStore';
import { recordMatch, type Profile } from '../state/profile';
import { useStore } from '../state/store';
import { CourseMap, HK, type Camera } from './course';
import { Golfer } from './golfer';
import { host, type View2D } from './host';
import { drawBag, drawGolfer, INK, project, Px } from './sprites';

export interface MatchSetup {
  courseId: string;
  length: MatchLength;
  difficulty: Difficulty;
  opponents: BotDef[];
  profile: Profile;
  bag: ClubRef[];
}

interface Flight {
  pi: number;
  setup: ShotSetup;
  plan: ShotPlan;
  result: SimResult;
  t: number;
  speed: number;
  evIdx: number;
  done: boolean;
  doneT: number;
  final: V3;
}

interface Particle {
  x: number; z: number; y: number;
  vx: number; vz: number; vy: number;
  life: number; max: number; g: number; c: string;
}
type Burst = 'splash' | 'sand' | 'confetti' | 'sparkle' | 'dirt';
const BURST_COLORS: Record<Burst, string[]> = {
  splash: ['#ffffff', '#bfe6ff', '#7cc4ff'],
  sand: ['#f0dca0', '#e2c88a', '#fff0c8'],
  dirt: ['#6a8a3a', '#8aa04a', '#5a4a30'],
  sparkle: ['#fff6a0', '#ffd23a', '#ffffff'],
  confetti: ['#e43b44', '#feae34', '#2ce8f5', '#63c74d', '#b55088', '#ffffff'],
};

let msgId = 1;
const ROLL_GUESS: Record<string, number> = { driver: 22, wood: 15, hybrid: 9, iron: 5, wedge: 2, putter: 0 };

const COMMENTS = {
  birdie: ['What a birdie!', 'Red number on the card!', 'Lovely stuff.'],
  eagle: ['EAGLE! Spectacular!', 'The crowd goes wild for that eagle!'],
  par: ['Solid par.', 'Par is never a bad score.', 'Steady as she goes.'],
  bogey: ['A dropped shot.', 'Bogey. Shake it off.', 'Not the cleanest hole.'],
  worse: ['One to forget.', 'That hole bit back.', 'Tough hole, move on.'],
};

/** Runs a round: turns, shots, bots, scoring, and draws it as a top-down pixel-art course. */
export class MatchController implements View2D {
  match: Match;
  map: CourseMap | null = null;
  private golfers = new Map<number, Golfer>();
  private rng: RNG;
  phase: Phase = 'loading';
  cur = 0;
  private aimYaw = 0;
  private clubIdx = 0;
  private shape = 0;
  private traj: Trajectory = 'normal';
  power = 0;
  private needlePhase = 0;
  needle = 0;
  pulling = false;
  preview: ShotPreview | null = null;
  private previewAt = 0;
  private previewPower = -1;
  private camMode: CamMode = 'behind';
  private cam: Camera = { u: 0, w: 0, ppm: 2 };
  private des: Camera = { u: 0, w: 0, ppm: 2 };
  private camLerp = 3;
  private flight: Flight | null = null;
  /** where the active golfer stands (the ball they are hitting) */
  private stance = { x: 0, z: 0 };
  private flightBall: V3 | null = null;
  private trail: Array<{ x: number; z: number; h: number }> = [];
  private particles: Particle[] = [];
  private introT = 0;
  private resultTimer = 0;
  private disposed = false;
  private level: number;
  private settings: Profile['settings'];
  private humanIdx = 0;
  private lastReport: ShotReport | null = null;
  private W = 320;
  private H = 480;
  readonly setup: MatchSetup;

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.settings = setup.profile.settings;
    this.level = levelFromXp(setup.profile.xp).level;
    const seed = (Date.now() & 0x7fffffff) ^ 0x2545f491;
    this.rng = new RNG(seed);
    const human = makePlayer('you', setup.profile.name || 'You', '#ffffff', setup.profile.outfit, setup.bag);
    const players: PlayerState[] = [human, ...setup.opponents.map(makeBotPlayer)];
    this.match = new Match({ courseId: setup.courseId, length: setup.length, difficulty: setup.difficulty, seed, startHole: setup.length === 3 ? this.rng.int(0, 6) : 0 }, players);
    this.humanIdx = 0;
    this.match.players.forEach((p, i) => this.golfers.set(i, new Golfer(p.bag[0].def)));
    useHud.setState({ ...useHud.getState(), phase: 'loading', outcome: null, finalRows: null, holeSummary: null, message: null });
    setTimeout(() => this.loadHole(), 30);
  }

  // ------------------------------------------------------------------ setup
  private loadHole() {
    if (this.disposed) return;
    this.setPhase('loading');
    setTimeout(() => {
      if (this.disposed) return;
      const t0 = performance.now();
      this.map = new CourseMap(this.match.world, this.settings.quality);
      console.info(`hole painted in ${(performance.now() - t0).toFixed(0)} ms`);
      for (const [, g] of this.golfers) g.reset();
      this.introT = 0;
      this.trail = [];
      this.particles = [];
      const w = this.match.world;
      const pin = this.map.toMap(w.hole.pin.x, w.hole.pin.z);
      this.cam = { u: pin.u, w: pin.w, ppm: 5 };
      this.des = { ...this.cam };
      useHud.setState({
        holeNumber: this.match.holeNumber,
        totalHoles: this.match.totalHoles,
        par: w.hole.par,
        holeName: w.hole.name,
        holeYards: Math.round(yd(w.hole.pathLen)),
        pars: this.match.holes.map((_, i) => this.match.holePar(i)),
        holeSummary: null,
        commentary: null,
        showHint: useStore.getState().profile.lifetime.rounds === 0 && this.match.holeIdx === 0,
        wind: this.windHud(),
      });
      this.refreshPlayers();
      this.setPhase('intro');
      sound.play('whoosh');
    }, 40);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    useHud.setState({ phase: p });
  }

  /** Bots' rows on the scoreboard, as of the end of the last hole (their shots aren't shown live). */
  private botRows = new Map<number, HudState['players'][number]>();

  private refreshPlayers(revealBots = false) {
    const m = this.match;
    useHud.setState({
      players: m.players.map((p, i) => (p.isBot && !revealBots && this.botRows.has(i) ? this.botRows.get(i)! : {
        name: p.name,
        color: p.isBot ? p.color : '#3d9bff',
        isBot: p.isBot,
        holeStrokes: p.strokes,
        rel: m.totalRel(p),
        thru: p.scores.filter((s) => s !== null).length,
        holed: p.holed || p.pickedUp,
        scores: [...p.scores],
        difficulty: p.bot ? DIFFICULTY_INFO[p.bot.difficulty].label : undefined,
        archetype: p.bot ? ARCHETYPE_INFO[p.bot.archetype].label : undefined,
      })),
      current: this.cur,
    });
    if (revealBots || this.botRows.size === 0) useHud.getState().players.forEach((row, i) => row.isBot && this.botRows.set(i, { ...row, holeStrokes: 0, holed: false }));
  }

  // ------------------------------------------------------------------ turns
  startTurn() {
    let pi = this.match.nextPlayer();
    // opponents' shots are played instantly off screen; you only see their scores after each hole
    for (let guard = 0; pi !== -1 && this.match.players[pi].isBot && guard < 300; guard++) {
      this.playBotShot(pi);
      pi = this.match.nextPlayer();
    }
    if (pi === -1) {
      this.endHole();
      return;
    }
    this.cur = pi;
    const p = this.match.players[pi];
    this.flight = null;
    this.flightBall = null;
    this.trail = [];
    this.shape = 0;
    this.traj = 'normal';
    this.power = 0;
    this.pulling = false;
    this.preview = null;
    this.stance = { x: p.ball.x, z: p.ball.z };
    useSwing.setState({ pulling: false, power: 0, needle: 0 });
    const onGreen = p.lie === 'green' || p.lie === 'fringe';
    this.camMode = onGreen ? 'green' : 'behind';
    this.clubIdx = this.autoClubIdx(pi);
    this.aimYaw = this.defaultAim(pi);
    this.placeGolfer();
    this.setPhase('aim');
    useHud.setState({ isHumanTurn: true, botThinking: null, bag: this.bagHud(), camModes: this.camModes() });
    this.refreshAim(true);
    this.refreshPlayers();
  }

  private playBotShot(pi: number) {
    const d = decideBotShot(this.match, pi, this.rng);
    const setup = botSetup(this.match, pi, d);
    const { plan, result } = executeShot(this.match.world, setup, d.needle, this.match.nextSeed());
    this.match.applyShot(pi, setup, plan, result);
  }

  private pinYaw(pi: number) {
    const p = this.match.players[pi];
    const pin = this.match.world.hole.pin;
    return yawOf(pin.x - p.ball.x, pin.z - p.ball.z);
  }

  currentClub(): ClubRef {
    const p = this.match.players[this.cur];
    return p.bag[clamp(this.clubIdx, 0, p.bag.length - 1)];
  }

  private autoClubIdx(pi: number): number {
    const p = this.match.players[pi];
    const d = this.match.world.distToPin(p.ball.x, p.ball.z);
    const pIdx = p.bag.findIndex(isPutter);
    if (p.lie === 'green' || (p.lie === 'fringe' && d < 15)) return pIdx;
    let best = -1;
    p.bag.forEach((c, i) => {
      if (isPutter(c)) return;
      if (c.def.category === 'driver' && p.lie !== 'tee') return;
      const carry = clubPerformance(c.def, c.level).maxCarry;
      if (carry >= d * 0.92) best = i; // bag is sorted longest → shortest, keep the shortest that reaches
    });
    if (best === -1) best = p.bag.findIndex((c) => !isPutter(c) && !(c.def.category === 'driver' && p.lie !== 'tee'));
    return Math.max(0, best);
  }

  private defaultAim(pi: number): number {
    const p = this.match.players[pi];
    const w = this.match.world;
    const club = p.bag[this.clubIdx];
    const d = w.distToPin(p.ball.x, p.ball.z);
    const carry = clubPerformance(club.def, club.level).maxCarry;
    if (isPutter(club) || carry * 1.15 >= d) return this.pinYaw(pi);
    // aim down the fairway toward the centre line at our carry distance
    let along = 0;
    let bestD = Infinity;
    for (let s = 0; s < w.hole.pathLen; s += 5) {
      const f = w.frame(s, 0);
      const dd = Math.abs(Math.hypot(f.x - p.ball.x, f.z - p.ball.z) - carry);
      const ahead = (f.x - p.ball.x) * (w.hole.pin.x - p.ball.x) + (f.z - p.ball.z) * (w.hole.pin.z - p.ball.z) > 0;
      if (ahead && dd < bestD) { bestD = dd; along = s; }
    }
    const f = w.frame(along, 0);
    return yawOf(f.x - p.ball.x, f.z - p.ball.z);
  }

  private bagHud() {
    const p = this.match.players[this.humanIdx];
    return p.bag.map((c) => ({
      id: c.def.id,
      name: c.def.name,
      short: SUBTYPES[c.def.subtype].short,
      rarity: c.def.rarity,
      color: c.def.color,
      category: c.def.category,
      carry: Math.round(yd(clubPerformance(c.def, c.level).maxCarry)),
      level: c.level,
    }));
  }

  private camModes(): CamMode[] {
    const p = this.match.players[this.cur];
    const onGreen = p.lie === 'green' || p.lie === 'fringe';
    return onGreen ? ['green', 'behind', 'overview'] : ['behind', 'target', 'overview'];
  }

  private placeGolfer() {
    const g = this.golfers.get(this.cur)!;
    g.setClub(this.currentClub().def);
    g.reset();
  }

  // --------------------------------------------------------- player input API
  selectClub(i: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    const p = this.match.players[this.cur];
    if (i < 0 || i >= p.bag.length) return;
    const wasPutter = isPutter(this.currentClub());
    this.clubIdx = i;
    if (wasPutter !== isPutter(this.currentClub())) this.aimYaw = this.defaultAim(this.cur);
    this.placeGolfer();
    sound.play('click');
    this.refreshAim(true);
  }

  cycleClub(dir: number) {
    const p = this.match.players[this.cur];
    this.selectClub((this.clubIdx + dir + p.bag.length) % p.bag.length);
  }

  nudgeAim(deg: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    this.aimYaw = wrapAngle(this.aimYaw + deg * DEG);
    this.refreshAim(true);
  }

  /** Horizontal drag on the course turns the aim (CSS pixels). */
  aimDrag(dxPixels: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    const k = isPutter(this.currentClub()) ? 0.0015 : 0.0035;
    this.aimYaw = wrapAngle(this.aimYaw + dxPixels * k);
    this.refreshAim(false);
  }

  aimAt(x: number, z: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    const p = this.match.players[this.cur];
    if (Math.hypot(x - p.ball.x, z - p.ball.z) < 0.5) return;
    this.aimYaw = yawOf(x - p.ball.x, z - p.ball.z);
    this.refreshAim(true);
  }

  setShape(s: number) {
    if (this.level < FEATURE_UNLOCKS.shaping) return;
    this.shape = clamp(s, -1, 1);
    this.refreshAim(true);
  }

  setTraj(t: Trajectory) {
    if (this.level < FEATURE_UNLOCKS.trajectory) return;
    this.traj = t;
    this.refreshAim(true);
  }

  cycleCamera() {
    if (this.phase !== 'aim') return;
    const modes = this.camModes();
    const i = modes.indexOf(this.camMode);
    this.camMode = modes[(i + 1) % modes.length];
    useHud.setState({ camMode: this.camMode });
    sound.play('click');
  }

  beginPull() {
    if (this.phase !== 'aim') return false;
    this.pulling = true;
    this.power = 0;
    this.needlePhase = -Math.PI / 2;
    useHud.setState({ showHint: false });
    return true;
  }

  /** dx, dy normalised (-1..1) drag from the swing pad; dy > 0 = pulled back */
  updatePull(dx: number, dy: number) {
    if (!this.pulling) return;
    this.power = clamp(dy, 0, 1.1);
    if (this.level >= FEATURE_UNLOCKS.shaping && !isPutter(this.currentClub())) this.shape = clamp(-dx * 1.6, -1, 1);
    this.golfers.get(this.cur)?.setBackswing(this.power);
    useSwing.setState({ power: this.power, pullX: dx, pullY: dy });
    useHud.setState({ shape: this.shape });
  }

  cancelPull() {
    this.pulling = false;
    this.power = 0;
    this.golfers.get(this.cur)?.setBackswing(0);
    useSwing.setState({ pulling: false, power: 0 });
    this.refreshAim(true);
  }

  release() {
    if (!this.pulling) return;
    this.pulling = false;
    if (this.power < 0.03) {
      this.cancelPull();
      return;
    }
    const pi = this.cur;
    const setup = this.makeSetup(this.power);
    const needle = this.needle;
    useSwing.setState({ pulling: false });
    this.setPhase('swing');
    this.golfers.get(pi)!.swing(() => this.fire(pi, setup, needle), this.power);
  }

  skip() {
    if (this.flight) this.flight.speed = 8;
    if (this.phase === 'intro') this.introT = 99;
    if (this.phase === 'result') this.resultTimer = 99;
  }

  private makeSetup(power: number): ShotSetup {
    return this.match.makeSetup(this.cur, this.currentClub(), power, this.aimYaw, this.shape, this.traj);
  }

  private refreshAim(force: boolean) {
    if (this.phase !== 'aim' || !this.map) return;
    const now = performance.now();
    const putt = isPutter(this.currentClub());
    const pw = this.pulling ? Math.max(0.05, this.power) : putt ? this.suggestPuttPower() : 1;
    if (!force && now - this.previewAt < 70 && Math.abs(pw - this.previewPower) < 0.02) {
      this.updateAimHud(this.preview, pw);
      return;
    }
    this.previewAt = now;
    this.previewPower = pw;
    const setup = this.makeSetup(pw);
    this.preview = previewShot(this.match.world, setup);
    const tune = swingTuning(setup);
    useSwing.setState({ perfectWindow: tune.perfectWindow });
    this.updateAimHud(this.preview, pw, tune.liePenalty);
  }

  suggestPuttPower(): number {
    const p = this.match.players[this.cur];
    const club = this.currentClub();
    const d = this.match.world.distToPin(p.ball.x, p.ball.z);
    return clamp((d * 1.08) / clubPerformance(club.def, club.level).maxCarry, 0.05, 1.1);
  }

  /** Wind arrow relative to the top of the screen (the map never rotates). */
  private windHud() {
    const wind = this.match.wind;
    return { mph: Math.hypot(wind.x, wind.z) * MS_TO_MPH, angle: Math.atan2(wind.x, -wind.z) - (this.map?.upYaw ?? 0) };
  }

  private updateAimHud(pv: ShotPreview | null, pw: number, liePenalty?: number) {
    const p = this.match.players[this.cur];
    const w = this.match.world;
    const club = this.currentClub();
    const ctx = this.match.abilityContext(this.cur);
    ctx.power = pw;
    const st = abilityState(club.def.ability, ctx);
    const putt = isPutter(club);
    useHud.setState({
      clubIdx: this.clubIdx,
      ability: { name: club.def.ability.name, desc: describeAbility(club.def.ability, club.def.stats.ability + (club.level - 1) * 2), state: st },
      distToPin: w.distToPin(p.ball.x, p.ball.z),
      lie: p.lie,
      elevation: w.height(w.hole.pin.x, w.hole.pin.z) - p.ball.y,
      wind: this.windHud(),
      preview: pv ? { carry: pv.carry, total: pv.total } : null,
      camMode: this.camMode,
      shape: this.shape,
      traj: this.traj,
      canShape: this.level >= FEATURE_UNLOCKS.shaping,
      canTraj: this.level >= FEATURE_UNLOCKS.trajectory,
      ...(liePenalty !== undefined ? { liePenalty } : {}),
      isPutt: putt,
      shotType: shotType(club, p.lie, pv ? pv.carry : 100),
      suggestPower: putt ? this.suggestPuttPower() : clamp((w.distToPin(p.ball.x, p.ball.z) - ROLL_GUESS[club.def.category]) / clubPerformance(club.def, club.level).maxCarry, 0.05, 1),
      puttFeet: putt ? clubPerformance(club.def, club.level).maxCarry * pw * 3.28 : 0,
    });
  }

  // ------------------------------------------------------------------- shots
  private fire(pi: number, setup: ShotSetup, needle: number) {
    if (this.disposed) return;
    const w = this.match.world;
    const { plan, result } = executeShot(w, setup, needle, this.match.nextSeed());
    const p = this.match.players[pi];
    const putt = isPutter(setup.club);
    const b = setup.ball;
    sound.play(putt ? 'putt' : 'hit', Math.min(1, setup.power));
    if (plan.perfect && !putt) {
      this.burst(b.x, b.y + 0.1, b.z, 'sparkle', 24);
      sound.play('perfect');
    }
    if (!putt && (p.lie === 'rough' || p.lie === 'deepRough' || p.lie === 'fringe' || p.lie === 'fairway')) this.burst(b.x, b.y, b.z, 'dirt', 10);
    if (p.lie === 'bunker' || p.lie === 'waste') { this.burst(b.x, b.y, b.z, 'sand', 30); sound.play('sand'); }
    const msgs: Message[] = [];
    if (plan.perfect) msgs.push({ text: 'PERFECT!', kind: 'perfect', id: msgId++ });
    if (plan.abilityActive) {
      msgs.push({ text: setup.club.def.ability.name, sub: 'Club ability activated', kind: 'ability', id: msgId++ });
      if (!p.isBot) setTimeout(() => sound.play('ability'), 150);
    }
    if (msgs.length) {
      useHud.setState({ message: msgs[0] });
      if (msgs[1]) setTimeout(() => !this.disposed && useHud.setState({ message: msgs[1] }), 800);
    }
    const speed = 2.4;
    const n = result.frameCount - 1;
    const final = { x: result.frames[n * 3], y: result.frames[n * 3 + 1], z: result.frames[n * 3 + 2] };
    this.flight = { pi, setup, plan, result, t: 0, speed, evIdx: 0, done: false, doneT: 0, final };
    this.flightBall = { ...b };
    this.trail = [];
    this.setPhase('flight');
    useHud.setState({ botThinking: null });
  }

  private ballPosAt(f: Flight, t: number): V3 {
    const fr = f.result.frames;
    const n = f.result.frameCount;
    const idx = Math.min(n - 1, t / FRAME_DT);
    const i = Math.floor(idx);
    const k = idx - i;
    const j = Math.min(n - 1, i + 1);
    return {
      x: fr[i * 3] + (fr[j * 3] - fr[i * 3]) * k,
      y: fr[i * 3 + 1] + (fr[j * 3 + 1] - fr[i * 3 + 1]) * k,
      z: fr[i * 3 + 2] + (fr[j * 3 + 2] - fr[i * 3 + 2]) * k,
    };
  }

  private updateFlight(dt: number) {
    const f = this.flight!;
    const total = (f.result.frameCount - 1) * FRAME_DT;
    if (!f.done) {
      f.t = Math.min(total, f.t + dt * f.speed);
      const pos = this.ballPosAt(f, f.t);
      this.flightBall = pos;
      if (!isPutter(f.setup.club)) {
        this.trail.push({ x: pos.x, z: pos.z, h: Math.max(0, pos.y - this.match.world.height(pos.x, pos.z)) });
        if (this.trail.length > 160) this.trail.shift();
      }
      const evs = f.result.events;
      while (f.evIdx < evs.length && evs[f.evIdx].t <= f.t + 0.001) {
        const e = evs[f.evIdx++];
        if (e.type === 'water') { this.burst(e.x, e.y, e.z, 'splash', 40); sound.play('splash'); }
        else if (e.type === 'skip') { this.burst(e.x, e.y, e.z, 'splash', 14); sound.play('bounce'); }
        else if (e.type === 'sand') { this.burst(e.x, e.y, e.z, 'sand', 24); sound.play('sand'); }
        else if (e.type === 'tree') sound.play('tree');
        else if (e.type === 'rock') sound.play('bounce', 1);
        else if (e.type === 'land' || e.type === 'bounce') sound.play('bounce', 0.6);
        else if (e.type === 'lip') sound.play('bounce', 0.4);
        else if (e.type === 'holed') sound.play('cup');
      }
      if (f.t >= total) {
        f.done = true;
        f.doneT = 0;
      }
    } else {
      f.doneT += dt;
      if (f.doneT > 0.3) this.finishShot();
    }
  }

  private finishShot() {
    const f = this.flight!;
    this.flight = null;
    this.flightBall = null;
    const p = this.match.players[f.pi];
    const report = this.match.applyShot(f.pi, f.setup, f.plan, f.result);
    this.lastReport = report;
    const g = this.golfers.get(f.pi)!;
    let text = report.text;
    let kind: Message['kind'] = report.kind;
    const dist = report.distance;
    let sub = report.sub;
    if (report.holed) {
      const name = scoreName(p.strokes, this.match.par);
      text = p.strokes === 1 ? 'HOLE IN ONE!' : name === 'Par' ? 'Par' : name;
      kind = p.strokes - this.match.par < 0 ? 'great' : 'good';
      sub = `${p.isBot ? p.name : 'You'} holed out${dist > 1.5 ? ` from ${Math.round(dist * 3.28)} ft` : ''}`;
      if (p.strokes - this.match.par < 0) {
        const pin = this.match.world.hole.pin;
        this.burst(pin.x, this.match.world.height(pin.x, pin.z) + 0.3, pin.z, 'confetti', 90);
        if (!p.isBot) sound.haptic(60);
        sound.play('cheer');
        g.react('celebrate');
      }
    } else if (!report.penalty) {
      const left = this.match.world.distToPin(p.ball.x, p.ball.z);
      sub = isPutter(f.setup.club) ? `${Math.round(left * 3.28)} ft left` : `${Math.round(yd(dist))} yd · ${left < 18 ? `${Math.round(left * 3.28)} ft` : `${Math.round(yd(left))} yd`} to pin`;
      if (f.result.events.some((e) => e.type === 'lip')) { text = 'Lipped out!'; kind = 'bad'; }
      else if (isPutter(f.setup.club) && left < 1) text = 'Close! Tap-in left';
      if (p.lie === 'green' && f.setup.lie !== 'green') kind = 'good';
    } else {
      g.react('sad');
      if (!p.isBot) sound.play('groan');
    }
    if (p.isBot) text = `${p.name.split(' ')[0]}: ${text}`;
    useHud.setState({ message: { text, sub, kind, id: msgId++ } });
    this.refreshPlayers();
    this.resultTimer = 0;
    this.setPhase('result');
  }

  private endHole() {
    const m = this.match;
    const par = m.par;
    const rows = m.players.map((p) => {
      const s = p.scores[m.holeIdx] ?? p.strokes;
      return { name: p.name, color: p.isBot ? p.color : '#3d9bff', strokes: s, par, label: scoreName(s, par), rel: s - par, total: m.totalRel(p) };
    });
    const me = rows[this.humanIdx];
    const bucket = me.strokes === 1 || me.rel <= -2 ? 'eagle' : me.rel === -1 ? 'birdie' : me.rel === 0 ? 'par' : me.rel === 1 ? 'bogey' : 'worse';
    const lines = COMMENTS[bucket];
    const lead = m.standings()[0];
    const leaderNote = lead.index === this.humanIdx ? 'You lead the match.' : `${lead.player.name} leads.`;
    this.refreshPlayers(true);
    useHud.setState({ holeSummary: rows, commentary: `${lines[this.rng.int(0, lines.length - 1)]} ${leaderNote}` });
    if (bucket === 'eagle' || bucket === 'birdie') sound.play('levelup');
    this.setPhase('holeOver');
  }

  /** Called from the hole summary overlay. */
  continueAfterHole() {
    if (this.phase !== 'holeOver') return;
    if (this.match.advance()) this.loadHole();
    else this.finishRound();
  }

  private finishRound() {
    const m = this.match;
    const st = m.standings();
    const me = m.players[this.humanIdx];
    const myRow = st.find((r) => r.index === this.humanIdx)!;
    const won = m.players.length > 1 && myRow.position === 1 && st.filter((r) => r.position === 1).length === 1;
    const scores = me.scores.map((s) => s ?? 0);
    const bogeyFree = scores.every((s, i) => s - m.holePar(i) <= 0);
    const usedRare = me.stats.usedRarity.some((r) => r === 'rare' || r === 'epic' || r === 'legendary');
    const outcome = useStore.getState().mutate((p) =>
      recordMatch(p, {
        holes: m.totalHoles,
        position: myRow.position,
        players: m.players.length,
        relPar: myRow.rel,
        birdies: me.stats.birdies,
        eagles: me.stats.eagles,
        holeInOnes: me.stats.holeInOnes,
        perfectShots: me.stats.perfectShots,
        courseMul: courseById(m.config.courseId).rewardMul,
        difficulty: this.setup.difficulty,
        won,
        courseId: m.config.courseId,
        strokes: myRow.strokes,
        opponents: m.players.slice(1).map((x) => x.name),
        fairways: me.stats.fairwaysHit,
        gir: me.stats.greensInReg,
        longestDrive: me.stats.longestDrive,
        longestPutt: me.stats.longestPutt,
        usedRareClub: usedRare,
        bogeyFree,
        scores,
      }),
    );
    if (won) sound.play('cheer');
    if (outcome.levelAfter > outcome.levelBefore) setTimeout(() => sound.play('levelup'), 900);
    useHud.setState({
      outcome,
      finalRows: st.map((r) => ({ name: r.player.name, color: r.player.isBot ? r.player.color : '#3d9bff', rel: r.rel, strokes: r.strokes, position: r.position, isBot: r.player.isBot })),
    });
    this.setPhase('roundOver');
  }

  // ---------------------------------------------------------------- particles
  private burst(x: number, y: number, z: number, kind: Burst, count: number) {
    if (this.settings.quality === 'low') count = Math.ceil(count / 2);
    const cols = BURST_COLORS[kind];
    const h0 = Math.max(0, y - this.match.world.height(x, z));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'confetti' ? 2 + Math.random() * 6 : kind === 'sparkle' ? 0.5 + Math.random() * 2 : 1 + Math.random() * 3;
      const up = kind === 'confetti' ? 5 + Math.random() * 7 : kind === 'splash' ? 3 + Math.random() * 4 : 1.5 + Math.random() * 2.5;
      this.particles.push({
        x, z, y: h0, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: up,
        life: 0, max: kind === 'confetti' ? 2.6 : 1.1, g: kind === 'confetti' ? 4 : kind === 'sparkle' ? 1 : 9.8,
        c: cols[i % cols.length],
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) { p.vx *= 0.8; p.vz *= 0.8; }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ------------------------------------------------------------------ camera
  /** Part of the screen not covered by the HUD, in game pixels. */
  private viewport() {
    const W = this.W, H = this.H;
    const portrait = H > W;
    const top = portrait ? H * 0.2 : H * 0.2;
    const bottom = portrait ? H * 0.4 : H * 0.22;
    const left = portrait ? W * 0.06 : W * 0.08;
    const right = portrait ? W * 0.06 : W * 0.24;
    return { x0: left, x1: W - right, y0: top, y1: H - bottom };
  }

  /** Camera that fits the given map points inside the uncovered part of the screen. */
  private fit(pts: Array<{ x: number; z: number; h?: number }>, minPpm: number, maxPpm: number, pad = 10): Camera {
    const m = this.map!;
    const vp = this.viewport();
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const p of pts) {
      const q = m.toMap(p.x, p.z);
      u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u);
      w0 = Math.min(w0, q.w); w1 = Math.max(w1, q.w + (p.h ?? 0) * HK);
    }
    const vw = Math.max(20, vp.x1 - vp.x0 - pad * 2), vh = Math.max(20, vp.y1 - vp.y0 - pad * 2);
    const ppm = clamp(Math.min(vw / Math.max(1, u1 - u0), vh / Math.max(1, w1 - w0)), minPpm, maxPpm);
    // centre of the uncovered area, converted back into a camera centre
    const cu = (u0 + u1) / 2 - ((vp.x0 + vp.x1) / 2 - this.W / 2) / ppm;
    let cw = (w0 + w1) / 2 + ((vp.y0 + vp.y1) / 2 - this.H / 2) / ppm;
    // zoom limit reached: keep the first point (the ball) above the controls
    const a = m.toMap(pts[0].x, pts[0].z);
    const ay = (cw - a.w) * ppm + this.H / 2;
    if (ay > vp.y1 - pad) cw -= (ay - (vp.y1 - pad)) / ppm;
    return { u: cu, w: cw, ppm };
  }

  private computeDesired() {
    const m = this.match;
    const w = m.world;
    const map = this.map!;
    const pin = w.hole.pin;
    const p = m.players[this.cur];
    this.camLerp = 4;
    if (this.phase === 'intro') {
      if (this.introT < 1.3) {
        this.des = this.fit([pin, { x: pin.x, z: pin.z, h: 6 }], 5.5, 6, 30);
      } else {
        this.des = map.overview(this.W, this.H);
        this.camLerp = 2.2;
      }
      return;
    }
    if (this.flight) {
      const f = this.flight;
      const b = this.flightBall ?? f.setup.ball;
      const putt = isPutter(f.setup.club);
      const h = Math.max(0, b.y - w.height(b.x, b.z));
      this.des = this.fit([{ x: b.x, z: b.z, h }, f.final], putt ? 7 : 1, putt ? 16 : 7, putt ? 30 : 24);
      this.camLerp = putt ? 3 : 2.5;
      return;
    }
    if (this.phase === 'result') {
      const r = this.lastReport ? m.players[this.lastReport.player] : p;
      const at = r.holed ? pin : r.ball;
      this.des = this.fit([at], 5, 5, 0);
      this.camLerp = 2;
      return;
    }
    if (this.phase === 'holeOver' || this.phase === 'roundOver') {
      this.des = this.fit([pin], 7, 7, 0);
      this.camLerp = 1.5;
      return;
    }
    // aiming / thinking / swinging
    let mode = this.camMode;
    if (p.isBot) mode = p.lie === 'green' || p.lie === 'fringe' ? 'green' : 'behind';
    const ball = p.ball;
    const land = this.preview?.landing;
    if (mode === 'overview') this.des = map.overview(this.W, this.H);
    else if (mode === 'target' && land) this.des = this.fit([land], 6, 6, 0);
    else if (mode === 'green') this.des = this.fit([ball, pin, ...(this.preview?.puttLine ? [this.preview.puttLine[this.preview.puttLine.length - 1]] : [])], 6, 16, 26);
    else {
      // the golfer and the landing zone both in view
      const golferTop = { x: ball.x, z: ball.z, h: 7 };
      this.des = this.fit(land ? [ball, golferTop, land, pin].slice(0, land && w.distToPin(land.x, land.z) < 40 ? 4 : 3) : [ball, golferTop, pin], 0.6, 7, 16);
    }
  }

  // ------------------------------------------------------------------- loop
  update(dt: number, time: number) {
    if (this.disposed) return;
    void time;
    if (!this.map) return;
    if (this.phase === 'intro') {
      this.introT += dt;
      if (this.introT > 3.6) this.startTurn();
    }
    if (this.pulling) {
      const tune = swingTuning(this.makeSetup(Math.max(0.05, this.power)));
      this.needlePhase += tune.needleSpeed * dt;
      this.needle = Math.sin(this.needlePhase);
      useSwing.setState({ needle: this.needle, perfectWindow: tune.perfectWindow, pulling: true });
      this.refreshAim(false);
    }
    if (this.flight) this.updateFlight(dt);
    this.fpsCheck(dt);
    if (this.phase === 'result') {
      this.resultTimer += dt;
      if (this.resultTimer > 1.3) this.startTurn();
    }
    this.golfers.get(this.cur)?.update(dt);
    this.updateParticles(dt);
    this.computeDesired();
    const k = 1 - Math.exp(-this.camLerp * dt);
    // zoom in log space so big zoom changes feel even
    this.cam.ppm = Math.exp(Math.log(this.cam.ppm) + (Math.log(this.des.ppm) - Math.log(this.cam.ppm)) * k);
    this.cam.u += (this.des.u - this.cam.u) * Math.min(1, k * 1.4);
    this.cam.w += (this.des.w - this.cam.w) * Math.min(1, k * 1.4);
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
  }

  // -------------------------------------------------------------------- draw
  draw(px: Px, W: number, H: number, time: number) {
    this.W = W;
    this.H = H;
    const map = this.map;
    if (!map) {
      px.rect(0, 0, W, H, '#124e89');
      return;
    }
    const cam = this.cam;
    const w = this.match.world;
    const S = (x: number, z: number, h = 0) => map.toScreen(cam, W, H, x, z, h);
    map.draw(px, cam, W, H, time);
    const aiming = this.phase === 'aim';
    const p = this.match.players[this.cur];
    const putt = isPutter(this.currentClub());

    // slope arrows on the green while putting
    if (aiming && putt && this.settings.showSlopeGrid && cam.ppm >= 4.5) this.drawSlopes(px, W, H, time);

    // cup and flag
    const pin = w.hole.pin;
    const pq = S(pin.x, pin.z);
    if (cam.ppm >= 3) px.ellipse(pq.x, pq.y, Math.max(1, 0.11 * cam.ppm), Math.max(0.6, 0.07 * cam.ppm), INK);

    // aim preview
    if (aiming && this.preview) this.drawPreview(px, W, H, time, putt);

    // trail
    for (let i = 0; i < this.trail.length; i += 2) {
      const t = this.trail[i];
      const q = S(t.x, t.z, t.h);
      px.dot(q.x, q.y, i > this.trail.length - 30 ? '#ffffff' : '#c0cbdc');
    }

    // flag pole (drawn after balls on the green so it stands on top)
    const poleH = Math.max(10, 2.3 * cam.ppm * HK * 1.6);
    px.rect(pq.x, pq.y - poleH, 1, poleH, '#f4f4f4');
    const wave = Math.floor(time * 6) % 2;
    const flagW = Math.max(4, Math.round(poleH * 0.45)), flagH = Math.max(3, Math.round(poleH * 0.28));
    const windDir = Math.sign(Math.sin(this.windHud().angle)) || 1;
    for (let r = 0; r < flagH; r++) {
      const len = Math.round(flagW * (1 - r / (flagH * 1.6)));
      px.rect(windDir > 0 ? pq.x + 1 : pq.x - len, pq.y - poleH + r + (r === 1 ? wave : 0), len, 1, w.hole.theme.flag);
    }

    // the golfer and their bag
    const g = this.golfers.get(this.cur);
    if (g && this.phase !== 'intro' && this.phase !== 'holeOver' && this.phase !== 'roundOver' && this.phase !== 'loading') this.drawGolferAt(px, W, H, g, p);

    // the active ball
    const fb = this.flightBall;
    if (fb) {
      const gh = w.height(fb.x, fb.z);
      const hgt = Math.max(0, fb.y - gh);
      const q = S(fb.x, fb.z, hgt);
      const sh = S(fb.x, fb.z);
      this.drawBall(px, q.x, q.y, sh.y, cam.ppm, hgt);
    } else if (!p.holed && !p.pickedUp && this.phase !== 'intro') {
      const q = S(p.ball.x, p.ball.z);
      this.drawBall(px, q.x, q.y, q.y, cam.ppm);
    }

    // particles
    for (const pa of this.particles) {
      const q = S(pa.x, pa.z, pa.y);
      px.dot(q.x, q.y, pa.c);
    }

    // distance to the pin above the flag
    if (this.phase !== 'intro' || this.introT > 2.4) {
      const b = fb ?? p.ball;
      const d = w.distToPin(b.x, b.z);
      const txt = d < 18 ? `${Math.round(d * 3.28)}FT` : `${Math.round(yd(d))}Y`;
      if (pq.x > -20 && pq.x < W + 20 && pq.y > 0 && pq.y < H) px.text(txt, pq.x, pq.y - poleH - 10, '#ffffff', 'center', 8);
    }
  }

  private drawBall(px: Px, x: number, y: number, groundY: number, ppm: number, height = 0) {
    // the ball grows a little as it climbs, so it reads clearly in flight
    const r = (ppm > 9 ? 1.5 : 1) + Math.min(1.5, height / 12);
    if (height > 0.05) px.ellipse(x + 1, groundY + 1, 1.5, 0.6, 'rgba(10,20,20,0.45)');
    else px.dot(x + 1, y + 1, 'rgba(10,20,20,0.5)');
    if (r > 1) {
      px.disc(x, y, r + 1, INK);
      px.disc(x, y, r, '#ffffff');
    } else {
      px.rect(x - 1, y - 1, 3, 3, INK);
      px.rect(x, y, 2, 2, '#ffffff');
      px.dot(x + 1, y + 1, '#c0cbdc');
    }
  }

  private drawGolferAt(px: Px, W: number, H: number, g: Golfer, p: PlayerState) {
    const map = this.map!;
    const cam = this.cam;
    const at = this.stance;
    const q = map.toScreen(cam, W, H, at.x, at.z);
    // aim direction in screen terms (map u = right, w = up)
    const a = { x: Math.sin(this.aimYaw), z: -Math.cos(this.aimYaw) };
    const au = a.x * map.rx + a.z * map.rz, aw = a.x * map.fx + a.z * map.fz;
    const yaw = Math.atan2(-au, aw);
    const s = clamp(cam.ppm * 1.4, Math.min(W, H) / 11, Math.min(W, H) / 8);
    const view = { x: 0, y: 0, s, yaw };
    const pb = project({ x: g.ballOffset, y: 0.03, z: 0 }, view);
    view.x = q.x - pb.x;
    view.y = q.y - pb.y;
    // bag a step behind the golfer
    const bagP = project({ x: -0.55, y: 0, z: 0.55 }, view);
    if (bagP.d < 0) drawBag(px, bagP.x, bagP.y, s, p.outfit);
    drawGolfer(px, g.skeleton(), p.outfit, view, { color: g.club?.color ?? '#fff', category: g.club?.category ?? 'iron' });
    if (bagP.d >= 0) drawBag(px, bagP.x, bagP.y, s, p.outfit);
  }

  private drawPreview(px: Px, W: number, H: number, time: number, putt: boolean) {
    const map = this.map!;
    const w = this.match.world;
    const pv = this.preview!;
    const S = (v: V3) => map.toScreen(this.cam, W, H, v.x, v.z, Math.max(0, v.y - w.height(v.x, v.z)));
    // marching dots along the arc
    const arc = pv.arc;
    const off = Math.floor(time * 8) % 3;
    let last = { x: -99, y: -99 };
    let n = 0;
    for (let i = 0; i < arc.length; i++) {
      const q = S(arc[i]);
      // evenly spaced on screen, marching toward the target
      if (Math.hypot(q.x - last.x, q.y - last.y) < 4) continue;
      last = q;
      px.rect(q.x - 1, q.y - 1, 3, 3, 'rgba(24,20,37,0.55)');
      px.rect(q.x, q.y, 2, 2, (n++ + 3 - off) % 3 === 0 ? '#feae34' : '#ffffff');
    }
    if (putt) {
      if (pv.puttLine) for (let i = 0; i < pv.puttLine.length; i += 2) {
        const q = S(pv.puttLine[i]);
        px.dot(q.x, q.y, '#7affc8');
      }
      return;
    }
    // landing ellipse (lateral × long spread) around the predicted carry point
    const L = pv.landing;
    const dir = { x: Math.sin(this.aimYaw), z: -Math.cos(this.aimYaw) };
    const side = { x: -dir.z, z: dir.x };
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const x = L.x + side.x * Math.cos(t) * pv.spreadLat + dir.x * Math.sin(t) * pv.spreadLong;
      const z = L.z + side.z * Math.cos(t) * pv.spreadLat + dir.z * Math.sin(t) * pv.spreadLong;
      const q = map.toScreen(this.cam, W, H, x, z);
      px.rect(q.x, q.y, 2, 2, i % 2 ? '#ffffff' : '#feae34');
    }
    const c = map.toScreen(this.cam, W, H, L.x, L.z);
    px.rect(c.x - 2, c.y, 5, 1, '#ffffff');
    px.rect(c.x, c.y - 2, 1, 5, '#ffffff');
  }

  private drawSlopes(px: Px, W: number, H: number, time: number) {
    const map = this.map!;
    const w = this.match.world;
    const g = w.hole.green;
    const step = 2.2;
    const R = Math.max(g.rx, g.rz) + 2;
    for (let du = -R; du <= R; du += step) {
      for (let dw = -R; dw <= R; dw += step) {
        const x = g.c.x + du, z = g.c.z + dw;
        if (!map.onGreen(x, z)) continue;
        const nrm = w.normal(x, z);
        const sl = Math.hypot(nrm.x, nrm.z);
        if (sl < 0.004) continue;
        const k = Math.min(1, sl / 0.04);
        // downhill direction on screen
        const mu = nrm.x * map.rx + nrm.z * map.rz, mw = nrm.x * map.fx + nrm.z * map.fz;
        const len = Math.hypot(mu, mw);
        const dx = mu / len, dy = -mw / len;
        const q = map.toScreen(this.cam, W, H, x, z);
        const Lp = 2 + k * 4;
        const c = k > 0.66 ? '#e43b44' : k > 0.33 ? '#feae34' : '#c0cbdc';
        px.line(q.x, q.y, q.x + dx * Lp, q.y + dy * Lp, 'rgba(24,20,37,0.35)');
        const ph = ((time * (0.6 + k)) % 1) * Lp;
        px.dot(q.x + dx * ph, q.y + dy * ph, c);
      }
    }
  }

  private lowFpsT = 0;
  private fpsWarned = false;
  private fpsCheck(dt: number) {
    if (this.fpsWarned || host.pixelSize === 'chunky') return;
    if (host.fps < 22) this.lowFpsT += dt;
    else this.lowFpsT = Math.max(0, this.lowFpsT - dt);
    if (this.lowFpsT > 6) {
      this.fpsWarned = true;
      useStore.getState().toast('The game is running slowly on this device. Try Pixel size: Chunky in Settings.', 'bad', '🐢');
    }
  }

  /** Where the current shot preview lands (for the mini-map). */
  aimPreviewPoint(): { x: number; z: number } | null {
    if (this.phase !== 'aim' || !this.preview) return null;
    return { x: this.preview.landing.x, z: this.preview.landing.z };
  }

  /** Screen (CSS client coordinates) → course point, for tap-to-aim. */
  pickGround(clientX: number, clientY: number): { x: number; z: number } | null {
    if (!this.map) return null;
    const g = host.toGame(clientX, clientY);
    return this.map.fromScreen(this.cam, this.W, this.H, g.x, g.y);
  }

  hudSnapshot(): HudState {
    return useHud.getState();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
  }
}
