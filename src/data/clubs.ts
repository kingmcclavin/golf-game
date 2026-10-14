import type { AbilityDef, EffectId, TriggerId } from './abilities';
import { YD_TO_M } from '../core/units';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_INFO: Record<Rarity, { label: string; color: string; glow: string; dupeCoins: number; upgradeCost: number }> = {
  common: { label: 'Common', color: '#c0cbdc', glow: '#ffffff', dupeCoins: 40, upgradeCost: 80 },
  uncommon: { label: 'Uncommon', color: '#63c74d', glow: '#b4e05a', dupeCoins: 80, upgradeCost: 140 },
  rare: { label: 'Rare', color: '#2ce8f5', glow: '#a8e4f8', dupeCoins: 160, upgradeCost: 240 },
  epic: { label: 'Epic', color: '#d06cd8', glow: '#f0b0f0', dupeCoins: 320, upgradeCost: 400 },
  legendary: { label: 'Legendary', color: '#feae34', glow: '#fee761', dupeCoins: 700, upgradeCost: 700 },
};

export type ClubCategory = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
export const CATEGORY_LABEL: Record<ClubCategory, string> = {
  driver: 'Driver', wood: 'Fairway Wood', hybrid: 'Hybrid', iron: 'Iron', wedge: 'Wedge', putter: 'Putter',
};

export interface SubtypeDef {
  cat: ClubCategory;
  label: string;
  short: string;
  /** base full-power carry in yards (or flat-green roll for putters) */
  carry: number;
  launch: number;
  spin: number;
  maxErr: number;
  length: number; // visual shaft length (m)
}

export const SUBTYPES = {
  driver: { cat: 'driver', label: 'Driver', short: 'DR', carry: 240, launch: 11, spin: 2600, maxErr: 8, length: 1.15 },
  wood3: { cat: 'wood', label: '3 Wood', short: '3W', carry: 220, launch: 13, spin: 3500, maxErr: 7, length: 1.08 },
  wood5: { cat: 'wood', label: '5 Wood', short: '5W', carry: 205, launch: 14.5, spin: 4000, maxErr: 6.5, length: 1.05 },
  hybrid3: { cat: 'hybrid', label: '3 Hybrid', short: '3H', carry: 195, launch: 15, spin: 4300, maxErr: 6, length: 1.02 },
  hybrid4: { cat: 'hybrid', label: '4 Hybrid', short: '4H', carry: 185, launch: 16, spin: 4600, maxErr: 5.8, length: 1.0 },
  iron4: { cat: 'iron', label: '4 Iron', short: '4i', carry: 180, launch: 16.5, spin: 4700, maxErr: 5.5, length: 0.98 },
  iron5: { cat: 'iron', label: '5 Iron', short: '5i', carry: 170, launch: 18, spin: 5200, maxErr: 5.2, length: 0.97 },
  iron6: { cat: 'iron', label: '6 Iron', short: '6i', carry: 160, launch: 19.5, spin: 5800, maxErr: 5, length: 0.96 },
  iron7: { cat: 'iron', label: '7 Iron', short: '7i', carry: 150, launch: 21.5, spin: 6500, maxErr: 4.8, length: 0.95 },
  iron8: { cat: 'iron', label: '8 Iron', short: '8i', carry: 140, launch: 23.5, spin: 7300, maxErr: 4.5, length: 0.94 },
  iron9: { cat: 'iron', label: '9 Iron', short: '9i', carry: 130, launch: 26, spin: 8000, maxErr: 4.2, length: 0.93 },
  pw: { cat: 'wedge', label: 'Pitching Wedge', short: 'PW', carry: 118, launch: 29, spin: 8600, maxErr: 4, length: 0.92 },
  gw: { cat: 'wedge', label: 'Gap Wedge', short: 'GW', carry: 105, launch: 32, spin: 9000, maxErr: 3.8, length: 0.91 },
  sw: { cat: 'wedge', label: 'Sand Wedge', short: 'SW', carry: 90, launch: 35, spin: 9500, maxErr: 3.6, length: 0.9 },
  lw: { cat: 'wedge', label: 'Lob Wedge', short: 'LW', carry: 72, launch: 40, spin: 10000, maxErr: 3.5, length: 0.9 },
  putter: { cat: 'putter', label: 'Putter', short: 'PT', carry: 28, launch: 0, spin: 0, maxErr: 2.2, length: 0.86 },
} satisfies Record<string, SubtypeDef>;
export type Subtype = keyof typeof SUBTYPES;

export const STAT_KEYS = ['power', 'accuracy', 'control', 'loft', 'spin', 'forgiveness', 'ability'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type ClubStats = Record<StatKey, number>;
export const STAT_LABEL: Record<StatKey, string> = {
  power: 'Power', accuracy: 'Accuracy', control: 'Control', loft: 'Loft', spin: 'Spin', forgiveness: 'Forgiveness', ability: 'Ability',
};

export interface ClubDef {
  id: string;
  name: string;
  subtype: Subtype;
  category: ClubCategory;
  rarity: Rarity;
  stats: ClubStats;
  ability: AbilityDef;
  color: string;
  flavor: string;
  event?: string;
}

type AbilityTuple = [string, TriggerId, EffectId, number, EffectId?, number?];

function C(
  id: string,
  name: string,
  subtype: Subtype,
  rarity: Rarity,
  s: [number, number, number, number, number, number, number],
  color: string,
  ab: AbilityTuple,
  flavor: string,
  event?: string,
): ClubDef {
  return {
    id,
    name,
    subtype,
    category: SUBTYPES[subtype].cat,
    rarity,
    stats: { power: s[0], accuracy: s[1], control: s[2], loft: s[3], spin: s[4], forgiveness: s[5], ability: s[6] },
    ability: { name: ab[0], trigger: ab[1], effect: ab[2], value: ab[3], effect2: ab[4], value2: ab[5] },
    color,
    flavor,
    event,
  };
}

export const CLUBS: ClubDef[] = [
  // ------------------------------------------------------------- drivers
  C('drv_timberline', 'Timberline Driver', 'driver', 'common', [50, 50, 45, 50, 45, 55, 25], '#a0662d', ['Fresh Tee', 'teeShot', 'sweetSpot', 25], 'Laminated maple head. Honest and forgiving.'),
  C('drv_comet', 'Blue Comet Driver', 'driver', 'common', [58, 42, 40, 52, 42, 46, 40], '#3a6fd8', ['Launch Pad', 'teeShot', 'carry', 4], 'A hot face with a wild streak.'),
  C('drv_fairfinder', 'Fairfinder Driver', 'driver', 'uncommon', [52, 56, 48, 48, 44, 54, 38], '#2f9e6a', ['Crosswind Keel', 'crosswind', 'crosswindCut', 45], 'Built to keep the ball between the trees.'),
  C('drv_gale', 'Gale Splitter', 'driver', 'uncommon', [60, 48, 42, 44, 40, 50, 56], '#6b8fa8', ['Wind Cutter', 'headwind', 'headwindCut', 45], 'Low-spin head that bores through the breeze.'),
  C('drv_sunburst', 'Sunburst Driver', 'driver', 'rare', [64, 50, 44, 52, 40, 52, 58], '#ff8a2a', ['Afterburner', 'perfect', 'carry', 7], 'Nail it and watch it go.'),
  C('drv_express', 'Tailwind Express', 'driver', 'rare', [58, 52, 48, 50, 42, 54, 56], '#41c4d8', ['Tailwind Rider', 'tailwind', 'tailwindRide', 60, 'rollout', 20], 'Rides every gust downwind.'),
  C('drv_thunder', 'Thunderclap Driver', 'driver', 'epic', [74, 44, 40, 50, 40, 50, 82], '#7b3fe4', ['Full Send', 'fullPower', 'speed', 5], 'Huge power, huge risk. Swing out of your shoes.'),
  C('drv_sharp', 'Sharpshooter Driver', 'driver', 'epic', [56, 70, 56, 48, 44, 56, 50], '#e04444', ['Laser Line', 'teeShot', 'laser', 40], 'Gives up yards for a dead-straight ball.'),
  C('drv_aurora', 'Aurora Driver', 'driver', 'legendary', [70, 60, 52, 52, 46, 58, 62], '#38e8c0', ['Comet Tail', 'perfect', 'carry', 6, 'bounceKing', 25], 'Shimmers green and violet at impact.'),
  // -------------------------------------------------------------- woods
  C('w3_meadow', 'Meadow 3 Wood', 'wood3', 'common', [50, 50, 48, 50, 46, 52, 24], '#5a8f3a', ['Clean Sweep', 'fairwayLie', 'pinpoint', 30], 'Sweeps it cleanly off tight turf.'),
  C('w5_kestrel', 'Kestrel 5 Wood', 'wood5', 'common', [46, 52, 50, 54, 48, 50, 20], '#b07a4a', ['High Glide', 'always', 'hangTime', 10], 'Floats it up like a hovering kestrel.'),
  C('w3_driftwood', 'Driftwood 3 Wood', 'wood3', 'uncommon', [56, 48, 46, 48, 44, 54, 44], '#8c7a5c', ['Rough Runner', 'roughLie', 'roughRider', 40], 'Cuts through the thick stuff.'),
  C('w5_harbor', 'Harbor 5 Wood', 'wood5', 'uncommon', [50, 52, 52, 52, 46, 52, 36], '#2a6fa8', ['Sea Breeze', 'coastal', 'crosswindCut', 40], 'Tuned for seaside winds.'),
  C('w3_mirage', 'Mirage 3 Wood', 'wood3', 'rare', [60, 52, 48, 48, 44, 52, 56], '#e8b04a', ['Par Five Pro', 'par5', 'carry', 6], 'Reach the long holes in two.'),
  C('w3_typhoon', 'Typhoon 3 Wood', 'wood3', 'epic', [64, 56, 50, 50, 44, 56, 60], '#3c4fd8', ['Storm Chaser', 'strongWind', 'headwindCut', 40, 'crosswindCut', 30], 'The windier it gets, the better it plays.'),
  C('w5_phoenix', 'Phoenix 5 Wood', 'wood5', 'legendary', [62, 62, 56, 54, 48, 58, 60], '#ff5a1f', ['Rising Phoenix', 'secondShot', 'allRound', 14], 'Second shots rise from the ashes.'),
  // ------------------------------------------------------------- hybrids
  C('h4_trail', 'Trailblazer 4 Hybrid', 'hybrid4', 'common', [50, 50, 48, 50, 48, 56, 18], '#4a7a4a', ['Easy Lift', 'roughLie', 'roughRider', 30], 'Gets the ball airborne from anywhere.'),
  C('h3_scout', 'Scout 3 Hybrid', 'hybrid3', 'common', [54, 48, 46, 50, 46, 52, 24], '#7a6a3a', ['Long Look', 'longShot', 'clearSight', 40], 'Sharper previews on long approaches.'),
  C('h4_badger', 'Badger 4 Hybrid', 'hybrid4', 'uncommon', [50, 52, 50, 50, 48, 62, 28], '#5a5a5a', ['Dig Deep', 'sandLie', 'beachPro', 40], 'Digs out of fairway bunkers.'),
  C('h3_canyon', 'Canyon 3 Hybrid', 'hybrid3', 'rare', [56, 54, 50, 50, 46, 58, 46], '#c0603a', ['Sure Footed', 'unevenLie', 'mountainGoat', 60], 'Stable from any stance.'),
  C('h4_rescue', 'Rescue Ranger', 'hybrid4', 'epic', [56, 60, 54, 52, 48, 64, 46], '#d83a3a', ['Second Wind', 'afterPenalty', 'allRound', 25], 'Bounce back after trouble.'),
  C('h3_dragonfly', 'Dragonfly 3 Hybrid', 'hybrid3', 'legendary', [64, 62, 56, 54, 48, 60, 56], '#2ad8a0', ['Dragonfly Dance', 'hazardLie', 'roughRider', 60, 'timber', 40], 'Darts out of trouble and through the trees.'),
  // --------------------------------------------------------------- irons
  C('i5_forge', 'Forge 5 Iron', 'iron5', 'common', [50, 52, 50, 50, 48, 50, 20], '#8a8f96', ['Fundamentals', 'fairwayLie', 'sweetSpot', 20], 'A no-frills forged classic.'),
  C('i8_forge', 'Forge 8 Iron', 'iron8', 'common', [48, 54, 52, 50, 50, 48, 18], '#8a8f96', ['Pure Strike', 'perfect', 'pinpoint', 30], 'Rewards a crisp strike.'),
  C('i4_copper', 'Copperline 4 Iron', 'iron4', 'common', [54, 48, 46, 48, 46, 54, 24], '#c87a4a', ['Stinger', 'headwind', 'headwindCut', 30], 'Hit it low under the wind.'),
  C('i7_copper', 'Copperline 7 Iron', 'iron7', 'common', [48, 52, 50, 52, 52, 48, 18], '#c87a4a', ['Soft Landing', 'approach', 'backspin', 20], 'Lands soft on approaches.'),
  C('i6_ridge', 'Ridgeback 6 Iron', 'iron6', 'uncommon', [52, 54, 52, 50, 50, 52, 30], '#5a7a9a', ['Uphill Charge', 'uphill', 'carry', 6], 'Extra punch when the green sits above you.'),
  C('i9_ridge', 'Ridgeback 9 Iron', 'iron9', 'uncommon', [48, 58, 54, 52, 54, 50, 24], '#5a7a9a', ['Dart Thrower', 'approach', 'laser', 25], 'Throw darts at the flag.'),
  C('i5_silver', 'Silverleaf 5 Iron', 'iron5', 'uncommon', [54, 52, 50, 50, 48, 54, 32], '#c0c8d0', ['Downhill Racer', 'downhill', 'rollout', 40], 'Chases down the slope.'),
  C('i9_pine', 'Pine Needle 9 Iron', 'iron9', 'uncommon', [48, 56, 54, 52, 52, 52, 26], '#2f6a3a', ['Timber!', 'always', 'timber', 40], 'Threads gaps in the branches.'),
  C('i7_cobalt', 'Cobalt 7 Iron', 'iron7', 'rare', [54, 60, 54, 50, 52, 52, 38], '#2a5ad8', ['Steady Hands', 'always', 'steady', 18], 'Calms your tempo.'),
  C('i4_cobalt', 'Cobalt 4 Iron', 'iron4', 'rare', [58, 54, 50, 46, 44, 56, 52], '#2a5ad8', ['Ground Game', 'always', 'topspin', 40], 'A low runner that eats up yards on the ground.'),
  C('i8_ember', 'Ember 8 Iron', 'iron8', 'rare', [50, 58, 56, 52, 58, 50, 36], '#ff6a3a', ['Hot Streak', 'afterBirdie', 'allRound', 20], 'Stays hot after a birdie.'),
  C('i6_skip', 'Skipstone 6 Iron', 'iron6', 'rare', [54, 56, 52, 48, 46, 54, 50], '#6ab0d8', ['Stone Skipper', 'always', 'skimmer', 1], 'Skips like a flat stone on a pond.'),
  C('i6_glacier', 'Glacier 6 Iron', 'iron6', 'epic', [58, 62, 56, 50, 52, 56, 46], '#9ae0ff', ['Ice Water', 'finalHole', 'sweetSpot', 60, 'laser', 30], 'Ice in your veins on the last hole.'),
  C('i9_vortex', 'Vortex 9 Iron', 'iron9', 'epic', [50, 62, 58, 54, 64, 52, 40], '#9a3ad8', ['Vortex Spin', 'always', 'backspin', 30, 'shaper', 30], 'Spin it, bend it, stop it.'),
  C('i7_excal', 'Excalibur 7 Iron', 'iron7', 'legendary', [60, 66, 60, 52, 56, 56, 50], '#ffd84a', ['Excalibur', 'approach', 'homing', 22], 'Approaches seem to find the flag.'),
  // -------------------------------------------------------------- wedges
  C('pw_pitch', 'Pitchfork Wedge', 'pw', 'common', [50, 52, 52, 50, 52, 48, 16], '#9a8a6a', ['Feather Touch', 'shortGame', 'pinpoint', 30], 'Soft hands around the green.'),
  C('sw_sandpiper', 'Sandpiper Wedge', 'sw', 'common', [46, 50, 50, 52, 54, 52, 16], '#d8c08a', ['Sand Save', 'sandLie', 'beachPro', 40], 'Splashes it out every time.'),
  C('lw_lobster', 'Lobster Lob Wedge', 'lw', 'common', [44, 50, 52, 56, 56, 46, 16], '#d84a3a', ['Flop Shot', 'shortGame', 'hangTime', 15], 'Straight up, straight down.'),
  C('gw_runner', 'Gap Runner Wedge', 'gw', 'uncommon', [52, 54, 54, 50, 54, 48, 28], '#4a9ad8', ['Bump and Run', 'shortGame', 'topspin', 35], 'Runs it up the slope like a putt.'),
  C('sw_rose', 'Desert Rose Wedge', 'sw', 'uncommon', [48, 52, 52, 52, 54, 56, 26], '#e87a8a', ['Dune Walker', 'desert', 'beachPro', 60], 'Born in the dunes.'),
  C('pw_check', 'Checkmate Wedge', 'pw', 'rare', [50, 56, 56, 50, 66, 48, 34], '#202020', ['Checkmate', 'approach', 'backspin', 45], 'One hop and stop.'),
  C('lw_mistral', 'Mistral Lob Wedge', 'lw', 'rare', [46, 56, 58, 58, 60, 50, 32], '#8ac8e8', ['Calm Before', 'calm', 'sweetSpot', 40], 'Deadly in still air.'),
  C('gw_comeback', 'Comeback Wedge', 'gw', 'epic', [52, 60, 58, 52, 60, 52, 46], '#e8a02a', ['Comeback Kid', 'trailing', 'allRound', 22], 'Fights back when you are behind.'),
  C('sw_halo', 'Halo Sand Wedge', 'sw', 'epic', [50, 60, 60, 54, 62, 58, 36], '#f8f0c0', ['Halo', 'sandLie', 'pinpoint', 40, 'beachPro', 50], 'Angelic out of bunkers.'),
  C('lw_zenith', 'Zenith Lob Wedge', 'lw', 'legendary', [50, 64, 64, 58, 66, 52, 46], '#c040ff', ['Zenith', 'shortGame', 'pinMagnet', 40, 'sweetSpot', 30], 'The flag seems to pull it in.'),
  // ------------------------------------------------------------- putters
  C('pt_brass', 'Brass Tack Putter', 'putter', 'common', [50, 52, 50, 50, 40, 52, 26], '#c8a040', ['Lag Master', 'longPutt', 'puttTouch', 30], 'Good pace on long putts.'),
  C('pt_blade', 'Blade Classic Putter', 'putter', 'common', [46, 56, 54, 50, 40, 48, 26], '#a0a8b0', ['True Roll', 'shortPutt', 'laser', 30], 'Starts short putts on line.'),
  C('pt_mallet', 'Mallet Pro Putter', 'putter', 'uncommon', [50, 56, 54, 50, 40, 56, 34], '#3a3a4a', ['Level Head', 'putting', 'flatliner', 18], 'Smooths out the breaks.'),
  C('pt_croquet', 'Croquet King Putter', 'putter', 'uncommon', [54, 52, 52, 50, 40, 54, 38], '#4a8a3a', ['Never Up Never In', 'longPutt', 'lipLock', 25], 'Charge the hole without fear.'),
  C('pt_spirit', 'Spirit Level Putter', 'putter', 'rare', [50, 60, 56, 50, 40, 56, 48], '#e8e04a', ['Flatliner', 'putting', 'flatliner', 30], 'Greens look flatter than they are.'),
  C('pt_bucket', 'Big Bucket Putter', 'putter', 'rare', [50, 58, 56, 50, 40, 58, 48], '#3a8ae8', ['Wide Cup', 'putting', 'wideCup', 25], 'The hole looks like a bucket.'),
  C('pt_clutch', 'Clutch Putter', 'putter', 'epic', [52, 62, 60, 50, 40, 58, 58], '#e83a6a', ['Clutch', 'finalHole', 'wideCup', 40, 'puttTouch', 40], 'Built for the 18th green.'),
  C('pt_oracle', 'Oracle Putter', 'putter', 'legendary', [52, 66, 62, 50, 40, 62, 68], '#8a4aff', ["Oracle's Eye", 'putting', 'clearSight', 100, 'flatliner', 20], 'See the true line of every putt.'),
  // --------------------------------------------------------- event clubs
  C('ev_harvest', 'Harvest Moon Driver', 'driver', 'epic', [64, 58, 50, 52, 44, 56, 56], '#ff9a2a', ['Moonrise', 'calm', 'carry', 6], 'Glows orange under the autumn moon.', 'harvest'),
  C('ev_frost', 'Frostbite 7 Iron', 'iron7', 'epic', [56, 62, 56, 50, 54, 52, 50], '#bfe8ff', ['Cold Snap', 'strongWind', 'pinpoint', 40, 'crosswindCut', 30], 'Frozen precision in a gale.', 'frost'),
  C('ev_blossom', 'Blossom Gap Wedge', 'gw', 'epic', [50, 60, 60, 54, 62, 54, 40], '#ff9ad0', ['Petal Soft', 'approach', 'backspin', 35, 'hangTime', 10], 'Lands like a falling petal.', 'bloom'),
  C('ev_sparkler', 'Sparkler Putter', 'putter', 'epic', [52, 62, 58, 50, 40, 58, 60], '#ffe04a', ['Sparkler', 'shortPutt', 'lipLock', 40, 'wideCup', 15], 'Short putts crackle into the cup.', 'summer'),
];

export const clubById = (id: string): ClubDef => {
  const c = CLUBS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown club ${id}`);
  return c;
};

export const MAX_CLUB_LEVEL = 5;
/** duplicates needed to go from level L to L+1 */
export const shardsForLevel = (level: number) => level;
export const upgradeCost = (rarity: Rarity, level: number) => RARITY_INFO[rarity].upgradeCost * level;

export function effectiveStats(def: ClubDef, level: number): ClubStats {
  const out = { ...def.stats };
  const bonus = (level - 1) * 2;
  for (const k of STAT_KEYS) out[k] = Math.min(100, out[k] + bonus);
  return out;
}

export interface ClubPerformance {
  maxCarry: number; // m
  launchDeg: number;
  backspin: number;
  perfectWindow: number;
  needleSpeed: number;
  maxDirErr: number; // degrees
  distErr: number;
  forgiveness: number;
}

export function clubPerformance(def: ClubDef, level: number): ClubPerformance {
  const st = SUBTYPES[def.subtype];
  const s = effectiveStats(def, level);
  return {
    maxCarry: st.carry * YD_TO_M * (0.9 + (s.power / 100) * 0.2),
    launchDeg: st.launch + (s.loft - 50) * 0.06,
    backspin: st.spin * (0.75 + (s.spin / 100) * 0.5),
    perfectWindow: 0.08 + (s.accuracy / 100) * 0.08,
    needleSpeed: 2.3 * (1.35 - (s.control / 100) * 0.7),
    maxDirErr: st.maxErr * (1.4 - (s.accuracy / 100) * 0.8),
    distErr: 0.12 * (1.3 - (s.forgiveness / 100) * 0.8),
    forgiveness: s.forgiveness / 100,
  };
}

// ----------------------------------------------------------------- golf bag
export type BagSlot = 'driver' | 'wood' | 'hybrid' | 'iron1' | 'iron2' | 'iron3' | 'wedge1' | 'wedge2' | 'putter';
export const BAG_SLOTS: BagSlot[] = ['driver', 'wood', 'hybrid', 'iron1', 'iron2', 'iron3', 'wedge1', 'wedge2', 'putter'];
export const SLOT_CATEGORY: Record<BagSlot, ClubCategory> = {
  driver: 'driver', wood: 'wood', hybrid: 'hybrid', iron1: 'iron', iron2: 'iron', iron3: 'iron', wedge1: 'wedge', wedge2: 'wedge', putter: 'putter',
};
export const SLOT_LABEL: Record<BagSlot, string> = {
  driver: 'Driver', wood: 'Wood', hybrid: 'Hybrid', iron1: 'Iron', iron2: 'Iron', iron3: 'Iron', wedge1: 'Wedge', wedge2: 'Wedge', putter: 'Putter',
};

export const STARTER_CLUBS = ['drv_timberline', 'w3_meadow', 'h4_trail', 'i5_forge', 'i7_copper', 'i8_forge', 'pw_pitch', 'sw_sandpiper', 'pt_brass'];
