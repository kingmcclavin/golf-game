import { ACHIEVEMENTS, emptyLifetime, type LifetimeStats } from '../data/achievements';
import { dailyChallenges, dayKey, templateOf, type ChallengeState, type RoundSummary } from '../data/challenges';
import { BAG_SLOTS, CLUBS, clubById, MAX_CLUB_LEVEL, RARITY_INFO, SLOT_CATEGORY, shardsForLevel, STARTER_CLUBS, upgradeCost, type BagSlot } from '../data/clubs';
import { COSMETICS, cosmeticById, DEFAULT_OUTFIT, OPTIONAL_SLOTS, STARTER_COSMETICS, type CosmeticSlot, type Outfit, HAIR_STYLES, BODY_STYLES, SKIN_TONES, FACES } from '../data/cosmetics';
import { computeRewards, type RewardInput, type RewardLine } from '../data/economy';
import { openPack, packById, type PackReward } from '../data/packs';
import { levelFromXp, levelUpReward } from '../data/progression';
import { COURSES } from '../data/courses';
import type { Difficulty } from '../data/bots';

export const SAVE_VERSION = 2;

export interface OwnedClub {
  level: number;
  shards: number;
  obtainedAt: number;
  seen: boolean;
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  volume: number;
  quality: 'low' | 'medium' | 'high';
  botSpeed: 'normal' | 'fast' | 'instant';
  showSlopeGrid: boolean;
  haptics: boolean;
  fastPacks: boolean;
}

export interface MatchRecord {
  at: number;
  courseId: string;
  holes: number;
  difficulty: Difficulty;
  position: number;
  players: number;
  rel: number;
  strokes: number;
  coins: number;
  opponents: string[];
}

export interface Profile {
  version: number;
  createdAt: number;
  name: string;
  coins: number;
  xp: number;
  clubs: Record<string, OwnedClub>;
  bag: Record<BagSlot, string | null>;
  cosmetics: string[];
  outfit: Outfit;
  lifetime: LifetimeStats;
  achievements: Record<string, { at: number; claimed: boolean }>;
  daily: { day: string; challenges: ChallengeState[] };
  matchHistory: MatchRecord[];
  packHistory: Array<{ at: number; pack: string; items: string[] }>;
  settings: Settings;
  seenCourses: string[];
  lastLevel: number;
}

export const defaultSettings = (): Settings => ({
  sfx: true, music: true, volume: 0.7, quality: 'medium', botSpeed: 'fast', showSlopeGrid: true, haptics: true, fastPacks: false,
});

export function newProfile(now = Date.now()): Profile {
  const clubs: Record<string, OwnedClub> = {};
  for (const id of STARTER_CLUBS) clubs[id] = { level: 1, shards: 0, obtainedAt: now, seen: true };
  const bag = {} as Record<BagSlot, string | null>;
  const order: BagSlot[] = ['driver', 'wood', 'hybrid', 'iron1', 'iron2', 'iron3', 'wedge1', 'wedge2', 'putter'];
  order.forEach((s, i) => (bag[s] = STARTER_CLUBS[i]));
  const p: Profile = {
    version: SAVE_VERSION,
    createdAt: now,
    name: 'You',
    coins: 600,
    xp: 0,
    clubs,
    bag,
    cosmetics: [...STARTER_COSMETICS],
    outfit: { ...DEFAULT_OUTFIT },
    lifetime: emptyLifetime(),
    achievements: {},
    daily: { day: dayKey(new Date(now)), challenges: dailyChallenges(dayKey(new Date(now))) },
    matchHistory: [],
    packHistory: [],
    settings: defaultSettings(),
    seenCourses: ['pinecrest'],
    lastLevel: 1,
  };
  refreshCollectionStats(p);
  return p;
}

// ------------------------------------------------------------- migrations
type Migration = (data: any) => any;
/** MIGRATIONS[n] upgrades a save from version n to n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  1: (d) => {
    // v1 had no daily challenges, pack history or bot speed setting, and stored clubs as an id list
    const out = { ...d, version: 2 };
    if (Array.isArray(d.clubs)) {
      const clubs: Record<string, OwnedClub> = {};
      for (const id of d.clubs as string[]) {
        if (clubs[id]) clubs[id].shards++;
        else clubs[id] = { level: 1, shards: 0, obtainedAt: d.createdAt ?? Date.now(), seen: true };
      }
      out.clubs = clubs;
    }
    out.packHistory = d.packHistory ?? [];
    out.daily = d.daily ?? null;
    out.settings = { ...defaultSettings(), ...(d.settings ?? {}) };
    return out;
  },
};

export function migrate(data: any): any {
  if (!data || typeof data !== 'object') throw new Error('Save data is not an object');
  let v = typeof data.version === 'number' ? data.version : 1;
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v})`);
  let d = data;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from version ${v}`);
    d = m(d);
    v++;
    d.version = v;
  }
  return d;
}

/** Fill missing fields and drop invalid references so a damaged save still loads. */
export function sanitize(raw: any): Profile {
  const base = newProfile(raw?.createdAt ?? Date.now());
  const p: Profile = { ...base, ...raw };
  p.version = SAVE_VERSION;
  p.coins = Number.isFinite(raw?.coins) ? Math.max(0, Math.floor(raw.coins)) : base.coins;
  p.xp = Number.isFinite(raw?.xp) ? Math.max(0, Math.floor(raw.xp)) : 0;
  p.name = typeof raw?.name === 'string' ? raw.name.slice(0, 16) : base.name;
  const clubs: Record<string, OwnedClub> = {};
  const ids = new Set(CLUBS.map((c) => c.id));
  if (raw?.clubs && typeof raw.clubs === 'object') {
    for (const [id, c] of Object.entries<any>(raw.clubs)) {
      if (!ids.has(id) || !c) continue;
      clubs[id] = {
        level: Math.min(MAX_CLUB_LEVEL, Math.max(1, Math.floor(c.level ?? 1))),
        shards: Math.max(0, Math.floor(c.shards ?? 0)),
        obtainedAt: c.obtainedAt ?? Date.now(),
        seen: !!c.seen,
      };
    }
  }
  for (const id of STARTER_CLUBS) if (!clubs[id]) clubs[id] = { level: 1, shards: 0, obtainedAt: Date.now(), seen: true };
  p.clubs = clubs;
  const bag = { ...base.bag } as Record<BagSlot, string | null>;
  for (const s of BAG_SLOTS) {
    const id = raw?.bag?.[s];
    if (id === null) bag[s] = s === 'putter' ? base.bag[s] : null;
    else if (typeof id === 'string' && clubs[id] && clubById(id).category === SLOT_CATEGORY[s]) bag[s] = id;
  }
  // prevent the same club in two slots
  const used = new Set<string>();
  for (const s of BAG_SLOTS) {
    const id = bag[s];
    if (id && used.has(id)) bag[s] = null;
    if (id) used.add(id);
  }
  if (!bag.putter) bag.putter = 'pt_brass';
  p.bag = bag;
  const cosIds = new Set(COSMETICS.map((c) => c.id));
  p.cosmetics = Array.from(new Set([...(Array.isArray(raw?.cosmetics) ? raw.cosmetics : []), ...STARTER_COSMETICS])).filter((id: string) => cosIds.has(id));
  const o = { ...DEFAULT_OUTFIT, ...(raw?.outfit ?? {}) } as Outfit;
  for (const slot of ['hat', 'shirt', 'pants', 'shoes', 'gloves', 'glasses', 'accessory', 'bag'] as CosmeticSlot[]) {
    const id = (o as any)[slot];
    const item = cosmeticById(id);
    if (!id || !item || item.slot !== slot || !p.cosmetics.includes(id)) (o as any)[slot] = OPTIONAL_SLOTS.includes(slot) ? null : (DEFAULT_OUTFIT as any)[slot];
  }
  if (!HAIR_STYLES.includes(o.hairStyle)) o.hairStyle = 'short';
  if (!BODY_STYLES.includes(o.body)) o.body = 'regular';
  o.skin = Math.max(0, Math.min(SKIN_TONES.length - 1, Math.floor(o.skin) || 0));
  o.face = Math.max(0, Math.min(FACES.length - 1, Math.floor(o.face) || 0));
  if (typeof o.hairColor !== 'string') o.hairColor = DEFAULT_OUTFIT.hairColor;
  p.outfit = o;
  p.lifetime = { ...emptyLifetime(), ...(raw?.lifetime ?? {}) };
  p.achievements = raw?.achievements && typeof raw.achievements === 'object' ? raw.achievements : {};
  p.daily = raw?.daily?.day && Array.isArray(raw.daily.challenges) ? raw.daily : base.daily;
  p.matchHistory = Array.isArray(raw?.matchHistory) ? raw.matchHistory.slice(0, 50) : [];
  p.packHistory = Array.isArray(raw?.packHistory) ? raw.packHistory.slice(0, 50) : [];
  p.settings = { ...defaultSettings(), ...(raw?.settings ?? {}) };
  p.seenCourses = Array.isArray(raw?.seenCourses) ? raw.seenCourses : ['pinecrest'];
  p.lastLevel = Number.isFinite(raw?.lastLevel) ? raw.lastLevel : levelFromXp(p.xp).level;
  refreshCollectionStats(p);
  return p;
}

export function loadProfileFromJSON(json: string): Profile {
  return sanitize(migrate(JSON.parse(json)));
}

// ----------------------------------------------------------------- helpers
export function level(p: Profile) {
  return levelFromXp(p.xp).level;
}

export function refreshCollectionStats(p: Profile) {
  p.lifetime.clubsOwned = Object.keys(p.clubs).length;
  p.lifetime.legendaryOwned = Object.keys(p.clubs).filter((id) => clubById(id).rarity === 'legendary').length;
  p.lifetime.cosmeticsOwned = p.cosmetics.length;
}

export function ensureDaily(p: Profile, now = new Date()) {
  const d = dayKey(now);
  if (p.daily.day !== d) p.daily = { day: d, challenges: dailyChallenges(d) };
}

export function checkAchievements(p: Profile, now = Date.now()): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (a.progress(p.lifetime) >= a.target) {
      p.achievements[a.id] = { at: now, claimed: false };
      unlocked.push(a.id);
    }
  }
  return unlocked;
}

export function claimAchievement(p: Profile, id: string): number {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  const st = p.achievements[id];
  if (!a || !st || st.claimed) return 0;
  st.claimed = true;
  p.coins += a.coins;
  p.xp += a.xp;
  return a.coins;
}

export function claimChallenge(p: Profile, index: number): number {
  const c = p.daily.challenges[index];
  if (!c || c.claimed || c.progress < c.target) return 0;
  c.claimed = true;
  p.coins += c.reward;
  p.xp += 25;
  return c.reward;
}

export function spend(p: Profile, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0 || p.coins < amount) return false;
  p.coins -= amount;
  return true;
}

export interface GrantResult {
  defId: string;
  isNew: boolean;
  shardAdded: boolean;
  coins: number;
}

/** Add a club to the collection; duplicates become upgrade shards (or coins once maxed). */
export function grantClub(p: Profile, defId: string, now = Date.now()): GrantResult {
  const def = clubById(defId);
  const owned = p.clubs[defId];
  if (!owned) {
    p.clubs[defId] = { level: 1, shards: 0, obtainedAt: now, seen: false };
    refreshCollectionStats(p);
    return { defId, isNew: true, shardAdded: false, coins: 0 };
  }
  // shards needed to reach max level from current
  let needed = 0;
  for (let l = owned.level; l < MAX_CLUB_LEVEL; l++) needed += shardsForLevel(l);
  if (owned.shards < needed) {
    owned.shards++;
    return { defId, isNew: false, shardAdded: true, coins: 0 };
  }
  const coins = RARITY_INFO[def.rarity].dupeCoins;
  p.coins += coins;
  return { defId, isNew: false, shardAdded: false, coins };
}

export function canUpgrade(p: Profile, defId: string): { ok: boolean; cost: number; shards: number; reason?: string } {
  const o = p.clubs[defId];
  if (!o) return { ok: false, cost: 0, shards: 0, reason: 'Not owned' };
  if (o.level >= MAX_CLUB_LEVEL) return { ok: false, cost: 0, shards: 0, reason: 'Max level' };
  const def = clubById(defId);
  const need = shardsForLevel(o.level);
  const cost = upgradeCost(def.rarity, o.level);
  if (o.shards < need) return { ok: false, cost, shards: need, reason: `Needs ${need} duplicate${need > 1 ? 's' : ''}` };
  if (p.coins < cost) return { ok: false, cost, shards: need, reason: 'Not enough coins' };
  return { ok: true, cost, shards: need };
}

export function upgradeClub(p: Profile, defId: string): boolean {
  const c = canUpgrade(p, defId);
  if (!c.ok) return false;
  const o = p.clubs[defId];
  o.shards -= c.shards;
  o.level++;
  p.coins -= c.cost;
  p.lifetime.upgrades++;
  return true;
}

export function equipClub(p: Profile, slot: BagSlot, defId: string | null): boolean {
  if (defId === null) {
    if (slot === 'putter') return false;
    p.bag[slot] = null;
    return true;
  }
  if (!p.clubs[defId]) return false;
  if (clubById(defId).category !== SLOT_CATEGORY[slot]) return false;
  // move from another slot if already equipped
  for (const s of BAG_SLOTS) if (p.bag[s] === defId) p.bag[s] = null;
  p.bag[slot] = defId;
  return true;
}

export function bagIssues(p: Profile): string[] {
  const issues: string[] = [];
  if (!p.bag.putter) issues.push('You need a putter.');
  if (BAG_SLOTS.filter((s) => s !== 'putter' && p.bag[s]).length === 0) issues.push('Equip at least one club besides the putter.');
  return issues;
}

export function buyPack(p: Profile, packId: string, rand: () => number, now = new Date()): { ok: boolean; reason?: string; rewards?: PackReward[]; grants?: GrantResult[]; cosmeticDupeCoins?: number } {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: 'Unknown pack' };
  if (level(p) < pack.minLevel) return { ok: false, reason: `Requires level ${pack.minLevel}` };
  if (!spend(p, pack.price)) return { ok: false, reason: 'Not enough coins' };
  const rewards = openPack(pack, rand, now);
  const grants: GrantResult[] = [];
  let cosmeticDupeCoins = 0;
  for (const r of rewards) {
    if (r.type === 'club' && r.club) grants.push(grantClub(p, r.club.id, now.getTime()));
    if (r.type === 'cosmetic' && r.cosmetic) {
      if (p.cosmetics.includes(r.cosmetic.id)) {
        cosmeticDupeCoins += Math.round(r.cosmetic.price * 0.5);
        p.coins += Math.round(r.cosmetic.price * 0.5);
      } else p.cosmetics.push(r.cosmetic.id);
    }
  }
  p.lifetime.packsOpened++;
  p.packHistory.unshift({ at: now.getTime(), pack: packId, items: rewards.map((r) => r.club?.id ?? r.cosmetic?.id ?? '?') });
  p.packHistory = p.packHistory.slice(0, 50);
  ensureDaily(p, now);
  for (const c of p.daily.challenges) {
    const t = templateOf(c.kind);
    if (t?.onPack && !c.claimed) c.progress = Math.min(c.target, c.progress + t.onPack());
  }
  refreshCollectionStats(p);
  return { ok: true, rewards, grants, cosmeticDupeCoins };
}

export function buyCosmetic(p: Profile, id: string): { ok: boolean; reason?: string } {
  const item = cosmeticById(id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (p.cosmetics.includes(id)) return { ok: false, reason: 'Already owned' };
  if (item.event) return { ok: false, reason: 'Event items come from Event Packs' };
  if (!spend(p, item.price)) return { ok: false, reason: 'Not enough coins' };
  p.cosmetics.push(id);
  refreshCollectionStats(p);
  return { ok: true };
}

export function equipCosmetic(p: Profile, slot: CosmeticSlot, id: string | null): boolean {
  if (id === null) {
    if (!OPTIONAL_SLOTS.includes(slot)) return false;
    (p.outfit as any)[slot] = null;
    return true;
  }
  const item = cosmeticById(id);
  if (!item || item.slot !== slot || !p.cosmetics.includes(id)) return false;
  (p.outfit as any)[slot] = id;
  return true;
}

// ------------------------------------------------------------ match results
export interface MatchOutcomeInput extends RewardInput {
  courseId: string;
  strokes: number;
  opponents: string[];
  fairways: number;
  gir: number;
  longestDrive: number;
  longestPutt: number;
  usedRareClub: boolean;
  bogeyFree: boolean;
  scores: number[];
}

export interface MatchOutcome {
  lines: RewardLine[];
  coins: number;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  levelRewards: number;
  newAchievements: string[];
  newCourses: string[];
  challengeProgress: Array<{ text: string; progress: number; target: number; done: boolean }>;
}

export function recordMatch(p: Profile, r: MatchOutcomeInput, now = new Date()): MatchOutcome {
  const { lines, coins, xp } = computeRewards(r);
  const levelBefore = level(p);
  p.coins += coins;
  p.xp += xp;
  const L = p.lifetime;
  L.rounds++;
  L.holes += r.holes;
  if (r.won) L.wins++;
  if (r.won && r.difficulty === 'expert') L.expertWins++;
  if (r.won && r.usedRareClub) L.rareWins++;
  L.birdies += r.birdies;
  L.eagles += r.eagles;
  L.holeInOnes += r.holeInOnes;
  L.longestDrive = Math.max(L.longestDrive, r.longestDrive);
  L.longestPutt = Math.max(L.longestPutt, r.longestPutt);
  if (!L.coursesPlayed.includes(r.courseId)) L.coursesPlayed.push(r.courseId);
  if (r.holes >= 9 && r.relPar < 0) L.roundsUnderPar++;
  if (r.holes >= 9 && r.bogeyFree) L.bogeyFreeRounds++;
  L.perfectShots += r.perfectShots;
  L.maxPerfectInRound = Math.max(L.maxPerfectInRound, r.perfectShots);
  if (r.holes >= 9) {
    const key = `${r.courseId}:${r.holes}`;
    if (L.bestRound[key] === undefined || r.relPar < L.bestRound[key]) L.bestRound[key] = r.relPar;
  }
  // daily challenges
  ensureDaily(p, now);
  const summary: RoundSummary = {
    courseId: r.courseId, holes: r.holes, won: r.won, birdies: r.birdies + r.holeInOnes, eagles: r.eagles, fairways: r.fairways, gir: r.gir,
    perfect: r.perfectShots, longestDrive: r.longestDrive, longestPutt: r.longestPutt, underPar: r.relPar < 0,
  };
  for (const c of p.daily.challenges) {
    const t = templateOf(c.kind);
    if (t?.onRound && !c.claimed) c.progress = Math.min(c.target, c.progress + t.onRound(summary, c.param, c.target));
  }
  p.matchHistory.unshift({
    at: now.getTime(), courseId: r.courseId, holes: r.holes, difficulty: r.difficulty, position: r.position, players: r.players,
    rel: r.relPar, strokes: r.strokes, coins, opponents: r.opponents,
  });
  p.matchHistory = p.matchHistory.slice(0, 50);
  // level ups
  const levelAfter = level(p);
  let levelRewards = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) levelRewards += levelUpReward(l);
  p.coins += levelRewards;
  const newAchievements = checkAchievements(p, now.getTime());
  const newCourses = COURSES.filter((c) => c.unlock.level > levelBefore && c.unlock.level <= levelAfter).map((c) => c.id);
  return {
    lines, coins, xp, levelBefore, levelAfter, levelRewards, newAchievements, newCourses,
    challengeProgress: p.daily.challenges.map((c) => ({ text: c.text, progress: c.progress, target: c.target, done: c.progress >= c.target })),
  };
}
