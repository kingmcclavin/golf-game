/**
 * Data-driven club ability system.
 *
 * An ability = trigger (when it is active) + effect (what it changes) + magnitude.
 * Effects write into ShotMods / PhysMods which the shot engine and physics simulation consume,
 * so every ability has a real gameplay effect.
 */
import type { Surface } from '../golf/types';

export interface AbilityContext {
  lie: Surface;
  distToPin: number; // meters
  power: number; // 0..1.1
  perfect: boolean | null; // null = not yet known (pre-release preview)
  isTeeShot: boolean;
  par: number;
  strokeOnHole: number;
  holeNumber: number;
  totalHoles: number;
  windSpeed: number; // m/s
  headwind: number; // m/s, + = into the player
  crosswind: number;
  trailing: boolean;
  leading: boolean;
  elevationDiff: number; // pin height - ball height (m)
  slope: number; // terrain slope at ball (0..1)
  prevShotSurface: Surface | null;
  prevHoleRelPar: number | null;
  afterPenalty: boolean;
  themeId: string;
  onGreen: boolean;
}

export interface ShotMods {
  carryMul: number;
  speedMul: number;
  perfectWindowMul: number;
  needleSpeedMul: number;
  dirErrorMul: number;
  distErrorMul: number;
  headwindMul: number;
  tailwindMul: number;
  crosswindMul: number;
  backspinMul: number;
  sideSpinMul: number;
  roughPenaltyMul: number;
  sandPenaltyMul: number;
  unevenPenaltyMul: number;
  puttErrorMul: number;
  previewClarity: number;
  launchAdd: number;
  // physics-level
  liftMul: number;
  rollMul: number;
  bounceMul: number;
  slopeMul: number;
  cupRadiusMul: number;
  lipCaptureMul: number;
  waterSkips: number;
  canopyPass: number;
  homing: number;
  pinMagnet: number;
  checkMul: number;
}

export const defaultShotMods = (): ShotMods => ({
  carryMul: 1,
  speedMul: 1,
  perfectWindowMul: 1,
  needleSpeedMul: 1,
  dirErrorMul: 1,
  distErrorMul: 1,
  headwindMul: 1,
  tailwindMul: 1,
  crosswindMul: 1,
  backspinMul: 1,
  sideSpinMul: 1,
  roughPenaltyMul: 1,
  sandPenaltyMul: 1,
  unevenPenaltyMul: 1,
  puttErrorMul: 1,
  previewClarity: 0,
  launchAdd: 0,
  liftMul: 1,
  rollMul: 1,
  bounceMul: 1,
  slopeMul: 1,
  cupRadiusMul: 1,
  lipCaptureMul: 1,
  waterSkips: 0,
  canopyPass: 0,
  homing: 0,
  pinMagnet: 0,
  checkMul: 1,
});

// ------------------------------------------------------------------ triggers
export interface TriggerDef {
  label: string;
  /** true when evaluation needs the release result */
  needsRelease?: boolean;
  test: (c: AbilityContext) => boolean;
}

const offFairwayLies: Surface[] = ['rough', 'deepRough'];

export const TRIGGERS = {
  always: { label: 'Always', test: () => true },
  perfect: { label: 'On a perfect release', needsRelease: true, test: (c) => c.perfect === true },
  fullPower: { label: 'At 95%+ power', test: (c) => c.power >= 0.95 },
  overdrive: { label: 'In the overpower zone (100%+)', test: (c) => c.power > 1.0 },
  softSwing: { label: 'Below 70% power', test: (c) => c.power < 0.7 },
  teeShot: { label: 'From the tee', test: (c) => c.isTeeShot },
  fairwayLie: { label: 'From the fairway', test: (c) => c.lie === 'fairway' },
  roughLie: { label: 'From the rough', test: (c) => offFairwayLies.includes(c.lie) },
  sandLie: { label: 'From sand', test: (c) => c.lie === 'bunker' || c.lie === 'waste' },
  hazardLie: { label: 'From rough or sand', test: (c) => c.lie !== 'fairway' && c.lie !== 'tee' && c.lie !== 'green' && c.lie !== 'fringe' },
  headwind: { label: 'Into a headwind', test: (c) => c.headwind > 1.5 },
  tailwind: { label: 'With a tailwind', test: (c) => c.headwind < -1.5 },
  crosswind: { label: 'In a crosswind', test: (c) => Math.abs(c.crosswind) > 2 },
  strongWind: { label: 'In wind over 11 mph', test: (c) => c.windSpeed > 5 },
  calm: { label: 'In calm air (under 6 mph)', test: (c) => c.windSpeed < 2.7 },
  trailing: { label: 'When trailing the leader', test: (c) => c.trailing },
  leading: { label: 'While leading the match', test: (c) => c.leading },
  finalHole: { label: 'On the final hole', test: (c) => c.holeNumber === c.totalHoles },
  firstHole: { label: 'On the opening hole', test: (c) => c.holeNumber === 1 },
  par3Tee: { label: 'Tee shots on par 3s', test: (c) => c.par === 3 && c.isTeeShot },
  par5: { label: 'On par 5s', test: (c) => c.par === 5 },
  approach: { label: 'Within 160 yd of the pin', test: (c) => c.distToPin < 146 && !c.onGreen },
  shortGame: { label: 'Within 50 yd of the pin', test: (c) => c.distToPin < 46 && !c.onGreen },
  longShot: { label: 'More than 200 yd from the pin', test: (c) => c.distToPin > 183 },
  uphill: { label: 'Playing uphill', test: (c) => c.elevationDiff > 2 },
  downhill: { label: 'Playing downhill', test: (c) => c.elevationDiff < -2 },
  unevenLie: { label: 'From an uneven lie', test: (c) => c.slope > 0.06 },
  afterFairway: { label: 'After hitting the fairway', test: (c) => c.prevShotSurface === 'fairway' },
  afterBirdie: { label: 'After a birdie or better', test: (c) => c.prevHoleRelPar !== null && c.prevHoleRelPar < 0 },
  afterBogey: { label: 'After a bogey or worse', test: (c) => c.prevHoleRelPar !== null && c.prevHoleRelPar > 0 },
  afterPenalty: { label: 'After a penalty stroke', test: (c) => c.afterPenalty },
  longPutt: { label: 'Putts over 25 ft', test: (c) => c.onGreen && c.distToPin > 7.6 },
  shortPutt: { label: 'Putts inside 12 ft', test: (c) => c.onGreen && c.distToPin <= 3.7 },
  putting: { label: 'On the green', test: (c) => c.onGreen },
  coastal: { label: 'On seaside courses', test: (c) => c.themeId === 'coast' },
  desert: { label: 'On desert courses', test: (c) => c.themeId === 'desert' },
  mountain: { label: 'On mountain courses', test: (c) => c.themeId === 'highland' },
  secondShot: { label: 'On your second shot of a hole', test: (c) => c.strokeOnHole === 2 },
} satisfies Record<string, TriggerDef>;

export type TriggerId = keyof typeof TRIGGERS;

// ------------------------------------------------------------------- effects
export interface EffectDef {
  /** describe effect with magnitude m (already scaled) */
  text: (m: number) => string;
  apply: (mods: ShotMods, m: number) => void;
  /** category used for UI icon */
  kind: 'distance' | 'accuracy' | 'spin' | 'terrain' | 'putting' | 'special';
}

const pct = (m: number) => `${Math.round(m)}%`;

export const EFFECTS = {
  carry: { kind: 'distance', text: (m) => `+${pct(m)} carry distance`, apply: (s, m) => { s.carryMul *= 1 + m / 100; } },
  speed: { kind: 'distance', text: (m) => `+${pct(m)} ball speed`, apply: (s, m) => { s.speedMul *= 1 + m / 100; } },
  headwindCut: { kind: 'distance', text: (m) => `${pct(m)} less headwind effect`, apply: (s, m) => { s.headwindMul *= 1 - m / 100; } },
  tailwindRide: { kind: 'distance', text: (m) => `+${pct(m)} tailwind boost`, apply: (s, m) => { s.tailwindMul *= 1 + m / 100; } },
  crosswindCut: { kind: 'accuracy', text: (m) => `${pct(m)} less crosswind drift`, apply: (s, m) => { s.crosswindMul *= 1 - m / 100; } },
  rollout: { kind: 'distance', text: (m) => `+${pct(m)} roll after landing`, apply: (s, m) => { s.rollMul *= 1 + m / 100; s.bounceMul *= 1 + m / 300; } },
  hangTime: { kind: 'distance', text: (m) => `+${pct(m)} lift (higher, softer flight)`, apply: (s, m) => { s.liftMul *= 1 + m / 100; s.launchAdd += m / 10; } },
  sweetSpot: { kind: 'accuracy', text: (m) => `+${pct(m)} perfect window`, apply: (s, m) => { s.perfectWindowMul *= 1 + m / 100; } },
  laser: { kind: 'accuracy', text: (m) => `${pct(m)} less direction error`, apply: (s, m) => { s.dirErrorMul *= 1 - m / 100; } },
  pinpoint: { kind: 'accuracy', text: (m) => `${pct(m)} less distance error`, apply: (s, m) => { s.distErrorMul *= 1 - m / 100; } },
  steady: { kind: 'accuracy', text: (m) => `${pct(m)} slower swing needle`, apply: (s, m) => { s.needleSpeedMul *= 1 - m / 100; } },
  clearSight: { kind: 'accuracy', text: (m) => `+${pct(m)} shot preview clarity`, apply: (s, m) => { s.previewClarity += m / 100; } },
  backspin: { kind: 'spin', text: (m) => `+${pct(m)} backspin bite`, apply: (s, m) => { s.backspinMul *= 1 + m / 100; s.checkMul *= 1 + m / 100; } },
  topspin: { kind: 'spin', text: (m) => `${pct(m)} less backspin, more run`, apply: (s, m) => { s.backspinMul *= 1 - m / 200; s.rollMul *= 1 + m / 150; } },
  shaper: { kind: 'spin', text: (m) => `+${pct(m)} draw/fade shaping`, apply: (s, m) => { s.sideSpinMul *= 1 + m / 100; } },
  roughRider: { kind: 'terrain', text: (m) => `${pct(m)} smaller rough penalty`, apply: (s, m) => { s.roughPenaltyMul *= 1 - m / 100; } },
  beachPro: { kind: 'terrain', text: (m) => `${pct(m)} smaller sand penalty`, apply: (s, m) => { s.sandPenaltyMul *= 1 - m / 100; } },
  mountainGoat: { kind: 'terrain', text: (m) => `${pct(m)} smaller uneven-lie penalty`, apply: (s, m) => { s.unevenPenaltyMul *= 1 - m / 100; } },
  skimmer: { kind: 'terrain', text: (m) => `Ball skips across water ${m >= 1.5 ? 'twice' : 'once'}`, apply: (s, m) => { s.waterSkips += m >= 1.5 ? 2 : 1; } },
  timber: { kind: 'terrain', text: (m) => `${pct(m)} chance to slip through tree branches`, apply: (s, m) => { s.canopyPass = Math.min(0.9, s.canopyPass + m / 100); } },
  puttTouch: { kind: 'putting', text: (m) => `${pct(m)} less putt power error`, apply: (s, m) => { s.puttErrorMul *= 1 - m / 100; } },
  flatliner: { kind: 'putting', text: (m) => `${pct(m)} less green slope break`, apply: (s, m) => { s.slopeMul *= 1 - m / 100; } },
  wideCup: { kind: 'putting', text: (m) => `+${pct(m)} effective cup size`, apply: (s, m) => { s.cupRadiusMul *= 1 + m / 100; } },
  lipLock: { kind: 'putting', text: (m) => `+${pct(m)} capture speed (fewer lip-outs)`, apply: (s, m) => { s.lipCaptureMul *= 1 + m / 100; } },
  homing: { kind: 'special', text: (m) => `Ball gently homes toward your target (${pct(m)} strength)`, apply: (s, m) => { s.homing += m / 100; } },
  pinMagnet: { kind: 'special', text: (m) => `Ball is drawn toward the cup on the green (${pct(m)})`, apply: (s, m) => { s.pinMagnet += (m / 100) * 0.6; } },
  allRound: { kind: 'special', text: (m) => `+${pct(m)} to power, accuracy and perfect window`, apply: (s, m) => { s.carryMul *= 1 + m / 200; s.dirErrorMul *= 1 - m / 100; s.perfectWindowMul *= 1 + m / 100; } },
  bounceKing: { kind: 'distance', text: (m) => `+${pct(m)} bounce energy`, apply: (s, m) => { s.bounceMul *= 1 + m / 100; } },
} satisfies Record<string, EffectDef>;

export type EffectId = keyof typeof EFFECTS;

export interface AbilityDef {
  name: string;
  trigger: TriggerId;
  effect: EffectId;
  /** magnitude at 100 ability-strength */
  value: number;
  /** optional second effect */
  effect2?: EffectId;
  value2?: number;
}

/** Ability magnitude scales with the club's ability stat (50 = 75%, 100 = 100%). */
export function abilityMagnitude(base: number, abilityStat: number): number {
  return base * (0.5 + abilityStat / 200);
}

export function describeAbility(a: AbilityDef, abilityStat: number): string {
  const t = TRIGGERS[a.trigger].label;
  const e1 = EFFECTS[a.effect].text(abilityMagnitude(a.value, abilityStat));
  const e2 = a.effect2 ? ` and ${EFFECTS[a.effect2].text(abilityMagnitude(a.value2 ?? 0, abilityStat))}` : '';
  return `${t}: ${e1}${e2}.`;
}

export type AbilityState = 'active' | 'conditional' | 'inactive';

export function abilityState(a: AbilityDef, ctx: AbilityContext): AbilityState {
  const trig: TriggerDef = TRIGGERS[a.trigger];
  if (trig.needsRelease && ctx.perfect === null) return 'conditional';
  return trig.test(ctx) ? 'active' : 'inactive';
}

export function applyAbility(a: AbilityDef, abilityStat: number, ctx: AbilityContext, mods: ShotMods): boolean {
  const trig: TriggerDef = TRIGGERS[a.trigger];
  if (!trig.test(ctx)) return false;
  (EFFECTS[a.effect] as EffectDef).apply(mods, abilityMagnitude(a.value, abilityStat));
  if (a.effect2) (EFFECTS[a.effect2] as EffectDef).apply(mods, abilityMagnitude(a.value2 ?? 0, abilityStat));
  return true;
}
