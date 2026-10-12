import * as THREE from 'three';
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
import { BALL_R, FRAME_DT, type SimResult } from '../golf/physics';
import { makeBotPlayer, makePlayer } from '../golf/players';
import { scoreName } from '../golf/scoring';
import { executeShot, isPutter, previewShot, shotType, swingTuning, type ClubRef, type ShotPlan, type ShotPreview, type ShotSetup, type Trajectory } from '../golf/shot';
import { useHud, useSwing, type CamMode, type HudState, type Message, type Phase } from '../state/matchStore';
import { recordMatch, type Profile } from '../state/profile';
import { useStore } from '../state/store';
import { GolferModel } from './golferModel';
import { HoleScene } from './holeScene';
import { host, type Quality, type View } from './renderer';
import { DotLine, labelSprite, Particles, Trail, updateLabel } from './visuals';

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
  dir: THREE.Vector3;
  landing: THREE.Vector3 | null;
  long: boolean;
}

let msgId = 1;
const ROLL_GUESS: Record<string, number> = { driver: 22, wood: 15, hybrid: 9, iron: 5, wedge: 2, putter: 0 };

const COMMENTS = {
  birdie: ['What a birdie!', 'Red number on the card!', 'Lovely stuff.'],
  eagle: ['EAGLE! Spectacular!', 'The crowd goes wild for that eagle!'],
  par: ['Solid par.', 'Par is never a bad score.', 'Steady as she goes.'],
  bogey: ['A dropped shot.', 'Bogey. Shake it off.', 'Not the cleanest hole.'],
  worse: ['One to forget.', 'That hole bit back.', 'Tough hole, move on.'],
};

export class MatchController implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
  match: Match;
  hole: HoleScene | null = null;
  private quality: Quality;
  private golfers = new Map<number, GolferModel>();
  private balls: THREE.Mesh[] = [];
  private ballLabels: THREE.Sprite[] = [];
  private pinLabel: THREE.Sprite;
  private aimDots = new DotLine('#ffffff', 7, 90);
  private trueLine = new DotLine('#7affc8', 6, 120);
  private landRing: THREE.Mesh;
  private trail = new Trail(500);
  private particles = new Particles(500);
  private rng: RNG;
  phase: Phase = 'loading';
  private cur = 0;
  private aimYaw = 0;
  private clubIdx = 0;
  private shape = 0;
  private traj: Trajectory = 'normal';
  private power = 0;
  private needlePhase = 0;
  private needle = 0;
  private pulling = false;
  private preview: ShotPreview | null = null;
  private previewAt = 0;
  private previewPower = -1;
  private camMode: CamMode = 'behind';
  private camPos = new THREE.Vector3(0, 10, 10);
  private camLook = new THREE.Vector3();
  private desPos = new THREE.Vector3();
  private desLook = new THREE.Vector3();
  private camLerp = 3;
  private flight: Flight | null = null;
  private introT = 0;
  private resultTimer = 0;
  private time = 0;
  private disposed = false;
  private level: number;
  private settings: Profile['settings'];
  private humanIdx = 0;
  private lastReport: ShotReport | null = null;
  private botTimer: number | null = null;
  readonly setup: MatchSetup;

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.settings = setup.profile.settings;
    this.quality = this.settings.quality;
    this.level = levelFromXp(setup.profile.xp).level;
    const seed = (Date.now() & 0x7fffffff) ^ 0x2545f491;
    this.rng = new RNG(seed);
    const human = makePlayer('you', setup.profile.name || 'You', '#ffffff', setup.profile.outfit, setup.bag);
    const players: PlayerState[] = [human, ...setup.opponents.map(makeBotPlayer)];
    this.match = new Match({ courseId: setup.courseId, length: setup.length, difficulty: setup.difficulty, seed, startHole: setup.length === 3 ? this.rng.int(0, 6) : 0 }, players);
    this.humanIdx = 0;
    this.scene.add(this.aimDots.points, this.trueLine.points, this.trail.line, this.particles.points);
    this.landRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }),
    );
    this.landRing.renderOrder = 19;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthTest: false, depthWrite: false }));
    fill.renderOrder = 18;
    this.landRing.add(fill);
    this.scene.add(this.landRing);
    this.pinLabel = labelSprite('⛳', 'rgba(20,30,40,0.75)');
    this.scene.add(this.pinLabel);
    // balls
    this.match.players.forEach((p, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.15 }));
      b.castShadow = true;
      this.balls.push(b);
      this.scene.add(b);
      const lbl = labelSprite(i === 0 ? 'YOU' : p.name.split(' ')[0], p.isBot ? p.color : 'rgba(30,120,255,0.9)', '#ffffff', 0.038);
      this.ballLabels.push(lbl);
      this.scene.add(lbl);
      const g = new GolferModel(p.outfit, p.bag[0].def);
      g.root.visible = false;
      g.bag.visible = false;
      this.golfers.set(i, g);
      this.scene.add(g.root, g.bag);
    });
    useHud.setState({ ...useHud.getState(), phase: 'loading', outcome: null, finalRows: null, holeSummary: null, message: null });
    setTimeout(() => this.loadHole(), 30);
  }

  // ------------------------------------------------------------------ setup
  private loadHole() {
    if (this.disposed) return;
    this.setPhase('loading');
    setTimeout(() => {
      if (this.disposed) return;
      this.hole?.dispose(this.scene);
      const t0 = performance.now();
      this.hole = new HoleScene(this.match.world, this.scene, this.quality);
      console.info(`hole built in ${(performance.now() - t0).toFixed(0)} ms`);
      const pin = this.match.world.hole.pin;
      this.pinLabel.position.set(pin.x, this.match.world.height(pin.x, pin.z) + 2.7, pin.z);
      for (const [, g] of this.golfers) g.reset();
      this.introT = 0;
      this.updateBalls();
      const w = this.match.world;
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

  private refreshPlayers() {
    const m = this.match;
    useHud.setState({
      players: m.players.map((p) => ({
        name: p.name,
        color: p.isBot ? p.color : '#3d9bff',
        isBot: p.isBot,
        holeStrokes: p.strokes,
        rel: m.totalRel(p) + (p.holed || p.pickedUp ? 0 : 0),
        thru: p.scores.filter((s) => s !== null).length,
        holed: p.holed || p.pickedUp,
        scores: [...p.scores],
        difficulty: p.bot ? DIFFICULTY_INFO[p.bot.difficulty].label : undefined,
        archetype: p.bot ? ARCHETYPE_INFO[p.bot.archetype].label : undefined,
      })),
      current: this.cur,
    });
  }

  // ------------------------------------------------------------------ turns
  private startTurn() {
    const pi = this.match.nextPlayer();
    if (pi === -1) {
      this.endHole();
      return;
    }
    this.cur = pi;
    const p = this.match.players[pi];
    for (const [i, g] of this.golfers) {
      g.root.visible = i === pi;
      g.bag.visible = i === pi;
    }
    this.flight = null;
    this.trail.reset();
    this.shape = 0;
    this.traj = 'normal';
    this.power = 0;
    this.pulling = false;
    useSwing.setState({ pulling: false, power: 0, needle: 0 });
    const onGreen = p.lie === 'green' || p.lie === 'fringe';
    this.camMode = onGreen ? 'green' : 'behind';
    if (p.isBot) {
      this.clubIdx = 0;
      this.aimYaw = this.pinYaw(pi);
      this.placeGolfer();
      this.setPhase('botThink');
      useHud.setState({ isHumanTurn: false, botThinking: `${p.name} is lining up...`, message: null, bag: [] });
      this.aimDots.clear();
      this.trueLine.clear();
      this.landRing.visible = false;
      this.hole?.setSlopeArrows(false);
      const delay = this.settings.botSpeed === 'instant' ? 120 : this.settings.botSpeed === 'fast' ? 350 : 800;
      this.botTimer = window.setTimeout(() => this.botThink(), delay);
    } else {
      this.clubIdx = this.autoClubIdx(pi);
      this.aimYaw = this.defaultAim(pi);
      this.placeGolfer();
      this.setPhase('aim');
      const prevBot = this.lastReport ? this.match.players[this.lastReport.player].isBot : false;
      useHud.setState({ isHumanTurn: true, botThinking: null, message: prevBot ? { text: 'Your shot', kind: 'neutral', id: msgId++ } : null, bag: this.bagHud(), camModes: this.camModes() });
      this.hole?.setSlopeArrows(onGreen && this.settings.showSlopeGrid);
      this.refreshAim(true);
    }
    this.refreshPlayers();
    this.updateBalls();
    this.snapCamera();
  }

  private botThink() {
    if (this.disposed || this.phase !== 'botThink') return;
    const pi = this.cur;
    const p = this.match.players[pi];
    const d = decideBotShot(this.match, pi, this.rng);
    this.clubIdx = p.bag.indexOf(d.club);
    this.aimYaw = d.aimYaw;
    this.placeGolfer();
    useHud.setState({ botThinking: `${p.name}: ${d.thinking}` });
    const g = this.golfers.get(pi)!;
    this.setPhase('swing');
    g.autoSwing(isPutter(d.club) ? Math.min(1, d.power * 1.5) : d.power, () => this.fire(pi, botSetup(this.match, pi, d), d.needle));
  }

  private pinYaw(pi: number) {
    const p = this.match.players[pi];
    const pin = this.match.world.hole.pin;
    return yawOf(pin.x - p.ball.x, pin.z - p.ball.z);
  }

  private currentClub(): ClubRef {
    const p = this.match.players[this.cur];
    return p.bag[clamp(this.clubIdx, 0, p.bag.length - 1)];
  }

  private autoClubIdx(pi: number): number {
    const p = this.match.players[pi];
    const w = this.match.world;
    const d = w.distToPin(p.ball.x, p.ball.z);
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
    const pr = w.hole.path;
    let along = 0;
    let bestD = Infinity;
    for (let s = 0; s < w.hole.pathLen; s += 5) {
      const f = w.frame(s, 0);
      const dd = Math.abs(Math.hypot(f.x - p.ball.x, f.z - p.ball.z) - carry);
      const ahead = (f.x - p.ball.x) * (w.hole.pin.x - p.ball.x) + (f.z - p.ball.z) * (w.hole.pin.z - p.ball.z) > 0;
      if (ahead && dd < bestD) { bestD = dd; along = s; }
    }
    void pr;
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
    const p = this.match.players[this.cur];
    const g = this.golfers.get(this.cur)!;
    const club = this.currentClub();
    g.setClub(club.def);
    g.reset();
    const vh = this.hole ? this.hole.terrain.visualHeight : (x: number, z: number) => this.match.world.height(x, z);
    g.placeAtBall(new THREE.Vector3(p.ball.x, p.ball.y, p.ball.z), this.aimYaw, vh);
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
    this.placeGolfer();
    this.refreshAim(true);
  }

  aimDrag(dxPixels: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    const k = isPutter(this.currentClub()) ? 0.0012 : this.camMode === 'target' || this.camMode === 'overview' ? 0.0016 : 0.003;
    this.aimYaw = wrapAngle(this.aimYaw + dxPixels * k);
    this.placeGolfer();
    this.refreshAim(false);
  }

  aimAt(x: number, z: number) {
    if (this.phase !== 'aim' || this.pulling) return;
    const p = this.match.players[this.cur];
    this.aimYaw = yawOf(x - p.ball.x, z - p.ball.z);
    this.placeGolfer();
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
    const g = this.golfers.get(this.cur);
    g?.setBackswing(this.power);
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
    this.aimDots.clear();
    this.trueLine.clear();
    this.landRing.visible = false;
    this.hole?.setSlopeArrows(false);
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
    if (this.phase !== 'aim' || !this.hole) return;
    const now = performance.now();
    const club = this.currentClub();
    const putt = isPutter(club);
    const pw = this.pulling ? Math.max(0.05, this.power) : putt ? this.suggestPuttPower() : 1;
    if (!force && now - this.previewAt < 70 && Math.abs(pw - this.previewPower) < 0.02) {
      this.updateAimHud(this.preview, pw);
      return;
    }
    this.previewAt = now;
    this.previewPower = pw;
    const setup = this.makeSetup(pw);
    const pv = previewShot(this.match.world, setup);
    this.preview = pv;
    const tune = swingTuning(setup);
    useSwing.setState({ perfectWindow: tune.perfectWindow });
    if (putt) {
      this.aimDots.set(pv.arc);
      this.landRing.visible = false;
      if (pv.puttLine) this.trueLine.set(pv.puttLine);
      else this.trueLine.clear();
    } else {
      this.aimDots.set(pv.arc);
      this.trueLine.clear();
      this.landRing.visible = true;
      const lp = pv.landing;
      this.landRing.position.set(lp.x, this.hole.terrain.visualHeight(lp.x, lp.z) + 0.25, lp.z);
      this.landRing.scale.set(pv.spreadLat, 1, pv.spreadLong);
      this.landRing.rotation.y = -this.aimYaw;
    }
    this.updateAimHud(pv, pw, tune.liePenalty);
  }

  private suggestPuttPower(): number {
    const p = this.match.players[this.cur];
    const club = this.currentClub();
    const d = this.match.world.distToPin(p.ball.x, p.ball.z);
    return clamp((d * 1.08) / clubPerformance(club.def, club.level).maxCarry, 0.05, 1.1);
  }

  private updateAimHud(pv: ShotPreview | null, pw: number, liePenalty?: number) {
    const p = this.match.players[this.cur];
    const w = this.match.world;
    const club = this.currentClub();
    const ctx = this.match.abilityContext(this.cur);
    ctx.power = pw;
    const st = abilityState(club.def.ability, ctx);
    const wind = this.match.wind;
    const putt = isPutter(club);
    useHud.setState({
      clubIdx: this.clubIdx,
      ability: { name: club.def.ability.name, desc: describeAbility(club.def.ability, club.def.stats.ability + (club.level - 1) * 2), state: st },
      distToPin: w.distToPin(p.ball.x, p.ball.z),
      lie: p.lie,
      elevation: w.height(w.hole.pin.x, w.hole.pin.z) - p.ball.y,
      wind: { mph: Math.hypot(wind.x, wind.z) * MS_TO_MPH, angle: Math.atan2(wind.x, -wind.z) - this.aimYaw },
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
    sound.play(putt ? 'putt' : 'hit', Math.min(1, setup.power));
    if (plan.perfect && !putt) {
      this.particles.burst(setup.ball.x, setup.ball.y + 0.1, setup.ball.z, 'sparkle', 30);
      sound.play('perfect');
    }
    if (!putt && (p.lie === 'rough' || p.lie === 'deepRough' || p.lie === 'fringe' || p.lie === 'fairway')) this.particles.burst(setup.ball.x, setup.ball.y, setup.ball.z, 'dirt', 14);
    if (p.lie === 'bunker' || p.lie === 'waste') { this.particles.burst(setup.ball.x, setup.ball.y, setup.ball.z, 'sand', 40); sound.play('sand'); }
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
    const dir = new THREE.Vector3(Math.sin(setup.aimYaw), 0, -Math.cos(setup.aimYaw));
    const carryD = result.carry ? Math.hypot(result.carry.x - setup.ball.x, result.carry.z - setup.ball.z) : 0;
    const speed = p.isBot ? (this.settings.botSpeed === 'normal' ? 1.15 : this.settings.botSpeed === 'fast' ? 2.2 : 5) : 1.1;
    this.flight = {
      pi, setup, plan, result, t: 0, speed, evIdx: 0, done: false, doneT: 0, dir,
      landing: result.carry ? new THREE.Vector3(result.carry.x, result.carry.y, result.carry.z) : null,
      long: carryD > 70,
    };
    this.trail.reset();
    this.setPhase('flight');
    useHud.setState({ botThinking: null });
  }

  private ballPosAt(f: Flight, t: number): THREE.Vector3 {
    const fr = f.result.frames;
    const n = f.result.frameCount;
    const idx = Math.min(n - 1, t / FRAME_DT);
    const i = Math.floor(idx);
    const k = idx - i;
    const j = Math.min(n - 1, i + 1);
    return new THREE.Vector3(
      fr[i * 3] + (fr[j * 3] - fr[i * 3]) * k,
      fr[i * 3 + 1] + (fr[j * 3 + 1] - fr[i * 3 + 1]) * k,
      fr[i * 3 + 2] + (fr[j * 3 + 2] - fr[i * 3 + 2]) * k,
    );
  }

  private updateFlight(dt: number) {
    const f = this.flight!;
    const total = (f.result.frameCount - 1) * FRAME_DT;
    if (!f.done) {
      f.t = Math.min(total, f.t + dt * f.speed);
      const pos = this.ballPosAt(f, f.t);
      const ball = this.balls[f.pi];
      ball.position.copy(pos);
      if (!isPutter(f.setup.club)) this.trail.push(pos.x, pos.y, pos.z);
      // events
      const evs = f.result.events;
      while (f.evIdx < evs.length && evs[f.evIdx].t <= f.t + 0.001) {
        const e = evs[f.evIdx++];
        if (e.type === 'water') { this.particles.burst(e.x, e.y, e.z, 'splash', 60); sound.play('splash'); }
        else if (e.type === 'skip') { this.particles.burst(e.x, e.y, e.z, 'splash', 20); sound.play('bounce'); }
        else if (e.type === 'sand') { this.particles.burst(e.x, e.y, e.z, 'sand', 30); sound.play('sand'); }
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
      if (f.doneT > (this.match.players[f.pi].isBot && this.settings.botSpeed !== 'normal' ? 0.25 : 0.5)) this.finishShot();
    }
  }

  private finishShot() {
    const f = this.flight!;
    this.flight = null;
    const p = this.match.players[f.pi];
    const report = this.match.applyShot(f.pi, f.setup, f.plan, f.result);
    this.lastReport = report;
    this.updateBalls();
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
      const b = this.balls[f.pi].position;
      if (p.strokes - this.match.par < 0) {
        this.particles.burst(b.x, b.y + 0.3, b.z, 'confetti', 120);
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

  private updateBalls() {
    const m = this.match;
    m.players.forEach((p, i) => {
      const b = this.balls[i];
      const vis = !p.holed && !p.pickedUp;
      b.visible = vis || (this.flight?.pi === i);
      if (!this.flight || this.flight.pi !== i) b.position.set(p.ball.x, this.hole ? Math.max(p.ball.y, this.hole.terrain.visualHeight(p.ball.x, p.ball.z) + BALL_R) : p.ball.y, p.ball.z);
      const l = this.ballLabels[i];
      l.visible = vis && i !== this.cur && p.teedOff;
      l.position.set(p.ball.x, b.position.y + 0.6, p.ball.z);
    });
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
    useHud.setState({ holeSummary: rows, commentary: `${lines[this.rng.int(0, lines.length - 1)]} ${leaderNote}` });
    this.refreshPlayers();
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
    let outcome = null;
    outcome = useStore.getState().mutate((p) =>
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

  // ------------------------------------------------------------------ camera
  private snapCamera() {
    this.computeDesired(0);
    this.camPos.copy(this.desPos);
    this.camLook.copy(this.desLook);
  }

  private computeDesired(dt: number) {
    const m = this.match;
    const w = m.world;
    const p = m.players[this.cur];
    const ball = new THREE.Vector3(p.ball.x, p.ball.y, p.ball.z);
    const dir = new THREE.Vector3(Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));
    const club = p.bag[this.clubIdx] ?? p.bag[0];
    const putt = isPutter(club);
    this.camLerp = 4;
    if (this.phase === 'intro') {
      const pin = w.hole.pin;
      const k = clamp(this.introT / 3.2, 0, 1);
      const e = k * k * (3 - 2 * k);
      const tee = w.hole.tee;
      const pinV = new THREE.Vector3(pin.x, w.height(pin.x, pin.z), pin.z);
      const teeV = new THREE.Vector3(tee.x, w.height(tee.x, tee.z), tee.z);
      const back = teeV.clone().sub(pinV).setY(0).normalize();
      const start = pinV.clone().addScaledVector(back, 40).add(new THREE.Vector3(0, 32, 0));
      const end = teeV.clone().addScaledVector(back, 9).add(new THREE.Vector3(0, 3.2, 0));
      const mid = pinV.clone().lerp(teeV, 0.5).add(new THREE.Vector3(0, 70 + w.hole.pathLen * 0.12, 0));
      // quadratic bezier
      const a = start.clone().lerp(mid, e);
      const b = mid.clone().lerp(end, e);
      this.desPos.copy(a.lerp(b, e));
      this.desLook.copy(pinV.clone().lerp(teeV.clone().addScaledVector(back, -40), e));
      this.camLerp = 20;
      return;
    }
    if (this.flight) {
      const f = this.flight;
      const pos = this.balls[f.pi].position;
      const putt2 = isPutter(f.setup.club);
      if (putt2) {
        const side = new THREE.Vector3(-f.dir.z, 0, f.dir.x);
        this.desPos.copy(new THREE.Vector3(f.setup.ball.x, f.setup.ball.y, f.setup.ball.z)).addScaledVector(f.dir, -3.2).addScaledVector(side, 1.3).add(new THREE.Vector3(0, 2.2, 0));
        this.desPos.lerp(pos.clone().addScaledVector(f.dir, -3).addScaledVector(side, 1.0).add(new THREE.Vector3(0, 1.9, 0)), 0.5);
        this.desLook.copy(pos);
        this.camLerp = 3;
        return;
      }
      const origin = new THREE.Vector3(f.setup.ball.x, f.setup.ball.y, f.setup.ball.z);
      const flown = pos.distanceTo(origin);
      const toLand = f.landing ? Math.hypot(pos.x - f.landing.x, pos.z - f.landing.z) : 999;
      if (f.long && f.landing && (toLand < 60 || f.t > 0 && pos.y < f.landing.y + 6 && flown > 40)) {
        // landing camera: off to the side of the landing zone, looking at the ball
        const side = new THREE.Vector3(-f.dir.z, 0, f.dir.x);
        this.desPos.copy(f.landing).addScaledVector(f.dir, 14).addScaledVector(side, 16).add(new THREE.Vector3(0, 7, 0));
        this.desPos.y = Math.max(this.desPos.y, w.height(this.desPos.x, this.desPos.z) + 4);
        this.desLook.copy(pos);
        this.camLerp = 2.2;
      } else {
        this.desPos.copy(pos).addScaledVector(f.dir, -10).add(new THREE.Vector3(0, 3.5, 0));
        this.desPos.y = Math.max(this.desPos.y, w.height(this.desPos.x, this.desPos.z) + 2);
        this.desLook.copy(pos).addScaledVector(f.dir, 8);
        this.camLerp = 5;
      }
      return;
    }
    if (this.phase === 'result' || this.phase === 'holeOver' || this.phase === 'roundOver') {
      const b = this.balls[this.lastReport?.player ?? this.cur].position;
      this.desLook.copy(b);
      this.desPos.copy(b).addScaledVector(dir, -9).add(new THREE.Vector3(0, 4.5, 0));
      if (this.phase !== 'result') {
        const t = this.time * 0.15;
        const pin = w.hole.pin;
        const py = w.height(pin.x, pin.z);
        this.desLook.set(pin.x, py, pin.z);
        this.desPos.set(pin.x + Math.cos(t) * 22, py + 9, pin.z + Math.sin(t) * 22);
      }
      this.desPos.y = Math.max(this.desPos.y, w.height(this.desPos.x, this.desPos.z) + 1.5);
      this.camLerp = 1.5;
      return;
    }
    // aiming / thinking / swinging
    let mode = this.camMode;
    if (p.isBot) mode = p.lie === 'green' || p.lie === 'fringe' ? 'green' : 'behind';
    if (mode === 'behind') {
      const big = club.def.category === 'driver' || club.def.category === 'wood';
      const D = (putt ? 3.4 : big ? 6.5 : 5.2) * (this.portrait ? 1.25 : 1);
      const H = (putt ? 1.5 : 2.3) * (this.portrait ? 1.3 : 1);
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      this.desPos.copy(ball).addScaledVector(dir, -D).addScaledVector(right, putt ? 0 : this.portrait ? -0.7 : 0.6).add(new THREE.Vector3(0, H, 0));
      this.desLook.copy(ball).addScaledVector(dir, putt ? 3 : 25).addScaledVector(right, this.portrait && !putt ? -1.5 : 0).add(new THREE.Vector3(0, putt ? 0 : 3, 0));
    } else if (mode === 'green') {
      const pin = w.hole.pin;
      const pinV = new THREE.Vector3(pin.x, w.height(pin.x, pin.z), pin.z);
      const d = Math.max(3, ball.distanceTo(pinV));
      this.desPos.copy(ball).addScaledVector(dir, -2.5 - d * 0.25).add(new THREE.Vector3(0, 1.4 + d * 0.22, 0));
      this.desLook.copy(ball).lerp(pinV, 0.6);
    } else if (mode === 'target') {
      const L = this.preview ? new THREE.Vector3(this.preview.landing.x, this.preview.landing.y, this.preview.landing.z) : ball.clone().addScaledVector(dir, 100);
      this.desPos.copy(L).addScaledVector(dir, -28).add(new THREE.Vector3(0, 32, 0));
      this.desLook.copy(L);
    } else {
      const pin = w.hole.pin;
      const mid = new THREE.Vector3((ball.x + pin.x) / 2, 0, (ball.z + pin.z) / 2);
      const d = Math.hypot(ball.x - pin.x, ball.z - pin.z);
      mid.y = w.height(mid.x, mid.z);
      this.desPos.copy(mid).addScaledVector(dir, -d * 0.18).add(new THREE.Vector3(0, Math.max(40, d * 0.75), 0));
      this.desLook.copy(mid);
    }
    this.desPos.y = Math.max(this.desPos.y, w.height(this.desPos.x, this.desPos.z) + 0.8);
    void dt;
  }

  // ------------------------------------------------------------------- loop
  update(dt: number, time: number) {
    if (this.disposed) return;
    this.time = time;
    if (!this.hole) {
      this.camera.position.set(0, 50, 50);
      return;
    }
    if (this.phase === 'intro') {
      this.introT += dt;
      if (this.introT > 3.6) this.startTurn();
    }
    if (this.pulling) {
      const club = this.currentClub();
      const tune = swingTuning(this.makeSetup(Math.max(0.05, this.power)));
      this.needlePhase += tune.needleSpeed * dt;
      this.needle = Math.sin(this.needlePhase);
      useSwing.setState({ needle: this.needle, perfectWindow: tune.perfectWindow, pulling: true });
      void club;
      this.refreshAim(false);
    }
    if (this.flight) this.updateFlight(dt);
    this.fpsCheck(dt);
    if (this.phase === 'result') {
      this.resultTimer += dt;
      const p = this.match.players[this.lastReport?.player ?? 0];
      const wait = p.isBot ? (this.settings.botSpeed === 'normal' ? 2.0 : 1.1) : 1.8;
      if (this.resultTimer > wait) this.startTurn();
    }
    for (const [, g] of this.golfers) if (g.root.visible) g.update(dt);
    this.particles.update(dt);
    this.hole.update(dt, time, this.match.wind);
    // camera
    this.computeDesired(dt);
    const k = 1 - Math.exp(-this.camLerp * dt);
    this.camPos.lerp(this.desPos, k);
    this.camLook.lerp(this.desLook, Math.min(1, k * 1.6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // ball visibility scaling
    this.balls.forEach((b) => {
      const d = b.position.distanceTo(this.camPos);
      const s = Math.max(1.6, d * 0.0042 / BALL_R);
      b.scale.setScalar(Math.min(s, 30));
    });
    const focus = this.flight ? this.balls[this.flight.pi].position : new THREE.Vector3(this.match.players[this.cur].ball.x, this.match.players[this.cur].ball.y, this.match.players[this.cur].ball.z);
    this.hole.setFocus(focus);
    this.updatePinLabel();
  }

  private lowFpsT = 0;
  private fpsWarned = false;
  private fpsCheck(dt: number) {
    if (this.fpsWarned || this.quality === 'low') return;
    if (host.fps < 22) this.lowFpsT += dt;
    else this.lowFpsT = Math.max(0, this.lowFpsT - dt);
    if (this.lowFpsT > 6) {
      this.fpsWarned = true;
      useStore.getState().toast('The game is running slowly on this device. Try Graphics quality: Low in Settings.', 'bad', '🐢');
    }
  }

  private lastPinText = '';
  private updatePinLabel() {
    const p = this.match.players[this.cur];
    const ballPos = this.flight ? this.balls[this.flight.pi].position : p.ball;
    const d = this.match.world.distToPin(ballPos.x, ballPos.z);
    const txt = d < 18 ? `⛳ ${Math.round(d * 3.28)} ft` : `⛳ ${Math.round(yd(d))} yd`;
    if (txt !== this.lastPinText && (!this.flight || Math.floor(this.time * 4) % 2 === 0)) {
      this.lastPinText = txt;
      updateLabel(this.pinLabel, txt, 'rgba(20,30,40,0.75)');
    }
    this.pinLabel.visible = this.phase !== 'intro' || this.introT > 2.4;
  }

  private portrait = false;
  /** Phones held upright get a wider vertical field of view so the target stays in frame. */
  resize(w: number, h: number) {
    this.portrait = h > w;
    this.camera.fov = this.portrait ? 72 : 55;
    // shift the picture up so the ball and golfer sit above the thumb controls
    if (this.portrait) this.camera.setViewOffset(w, h, 0, h * 0.14, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Where the current shot preview lands (for the mini-map). */
  aimPreviewPoint(): { x: number; z: number } | null {
    if (this.phase !== 'aim' || !this.preview) return null;
    return { x: this.preview.landing.x, z: this.preview.landing.z };
  }

  /** Screen → ground pick (for tap-to-aim on the course). */
  pickGround(nx: number, ny: number): THREE.Vector3 | null {
    if (!this.hole) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const terrain = this.hole.terrain.group.getObjectByName('terrain');
    if (!terrain) return null;
    const hit = rc.intersectObject(terrain, false)[0];
    return hit ? hit.point : null;
  }

  hudSnapshot(): HudState {
    return useHud.getState();
  }

  forfeit() {
    this.dispose();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.hole?.dispose(this.scene);
    for (const [, g] of this.golfers) g.dispose();
    this.aimDots.dispose();
    this.trueLine.dispose();
  }

  static attach(c: MatchController) {
    host.setView(c);
  }
}

