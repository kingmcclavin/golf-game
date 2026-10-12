import { describe, it, expect } from 'vitest';
import { RNG } from './core/rng';
import { PACKS, openPack, rollRarity, validateOdds, poolFor } from './data/packs';
import { RARITIES, CLUBS, clubById, MAX_CLUB_LEVEL, STAT_KEYS, SUBTYPES } from './data/clubs';
import { applyAbility, defaultShotMods, TRIGGERS, EFFECTS, type AbilityContext } from './data/abilities';
import { COSMETICS } from './data/cosmetics';
import { BOTS } from './data/bots';
import { computeRewards } from './data/economy';
import { levelFromXp, xpForLevel } from './data/progression';
import * as P from './state/profile';

const ctx = (o: Partial<AbilityContext> = {}): AbilityContext => ({
  lie: 'fairway', distToPin: 150, power: 1, perfect: false, isTeeShot: false, par: 4, strokeOnHole: 2, holeNumber: 3, totalHoles: 9,
  windSpeed: 3, headwind: 0, crosswind: 0, trailing: false, leading: false, elevationDiff: 0, slope: 0, prevShotSurface: null,
  prevHoleRelPar: null, afterPenalty: false, themeId: 'park', onGreen: false, ...o,
});

describe('club packs', () => {
  it('published odds sum to 100% and every rarity has a pool', () => {
    for (const p of PACKS) expect(validateOdds(p)).toBe(true);
    for (const r of RARITIES) expect(poolFor(r).length).toBeGreaterThan(0);
  });

  it('observed drop rates match the published odds', () => {
    const rng = new RNG(42);
    for (const p of PACKS) {
      const N = 60000;
      const counts: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        const r = rollRarity(p, () => rng.next());
        counts[r] = (counts[r] ?? 0) + 1;
      }
      for (const r of RARITIES) {
        const expected = p.odds[r] / 100;
        const got = (counts[r] ?? 0) / N;
        const sd = Math.sqrt((expected * (1 - expected)) / N);
        expect(Math.abs(got - expected)).toBeLessThanOrEqual(Math.max(4.5 * sd, 1e-9));
      }
    }
  });

  it('opens the right number of items and never drops event clubs from normal packs', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 500; i++) {
      const items = openPack(PACKS[1], () => rng.next());
      expect(items).toHaveLength(PACKS[1].clubs);
      expect(items.every((x) => x.club && !x.club.event)).toBe(true);
    }
  });
});

describe('economy & profile', () => {
  it('buying deducts coins and cannot overspend', () => {
    const p = P.newProfile();
    p.coins = 350;
    const rng = new RNG(1);
    const r1 = P.buyPack(p, 'starter', () => rng.next());
    expect(r1.ok).toBe(true);
    expect(p.coins).toBeLessThanOrEqual(50 + 3 * 700);
    const before = p.coins;
    if (before < 300) {
      const r2 = P.buyPack(p, 'starter', () => rng.next());
      expect(r2.ok).toBe(false);
      expect(p.coins).toBe(before);
    }
    expect(P.spend(p, -5)).toBe(false);
    expect(P.spend(p, p.coins + 1)).toBe(false);
  });

  it('duplicates become upgrade shards, then coins once maxed', () => {
    const p = P.newProfile();
    const id = 'drv_timberline';
    let total = 0;
    for (let l = 1; l < MAX_CLUB_LEVEL; l++) total += l;
    for (let i = 0; i < total; i++) expect(P.grantClub(p, id).shardAdded).toBe(true);
    const extra = P.grantClub(p, id);
    expect(extra.shardAdded).toBe(false);
    expect(extra.coins).toBeGreaterThan(0);
    p.coins = 100000;
    let ups = 0;
    while (P.upgradeClub(p, id)) ups++;
    expect(ups).toBe(MAX_CLUB_LEVEL - 1);
    expect(p.clubs[id].level).toBe(MAX_CLUB_LEVEL);
    expect(P.upgradeClub(p, id)).toBe(false);
  });

  it('equipping enforces bag categories and the putter rule', () => {
    const p = P.newProfile();
    expect(P.equipClub(p, 'driver', 'pt_brass')).toBe(false);
    expect(P.equipClub(p, 'putter', null)).toBe(false);
    P.grantClub(p, 'i9_ridge');
    expect(P.equipClub(p, 'iron2', 'i9_ridge')).toBe(true);
    expect(p.bag.iron2).toBe('i9_ridge');
    // equipping a club already in another slot moves it
    expect(P.equipClub(p, 'iron3', 'i9_ridge')).toBe(true);
    expect(p.bag.iron2).toBeNull();
    expect(P.equipClub(p, 'wedge1', 'drv_aurora')).toBe(false); // not owned
    expect(P.bagIssues(p)).toHaveLength(0);
  });

  it('winning pays more than losing, rewards scale with difficulty and course', () => {
    const base = { holes: 9, players: 3, relPar: 0, birdies: 0, eagles: 0, holeInOnes: 0, perfectShots: 0, courseMul: 1, difficulty: 'beginner' as const };
    const win = computeRewards({ ...base, position: 1, won: true });
    const lose = computeRewards({ ...base, position: 3, won: false });
    const hard = computeRewards({ ...base, position: 1, won: true, difficulty: 'expert', courseMul: 2.1 });
    const short = computeRewards({ ...base, holes: 3, position: 1, won: true });
    expect(win.coins).toBeGreaterThan(lose.coins);
    expect(lose.coins).toBeGreaterThan(0);
    expect(hard.coins).toBeGreaterThan(win.coins * 2);
    expect(short.coins * 3).toBeLessThanOrEqual(win.coins + 5);
  });

  it('recording a match awards coins, xp, achievements and challenge progress', () => {
    const p = P.newProfile();
    const c0 = p.coins;
    const out = P.recordMatch(p, {
      holes: 9, position: 1, players: 2, relPar: -2, birdies: 2, eagles: 0, holeInOnes: 0, perfectShots: 4, courseMul: 1, difficulty: 'beginner', won: true,
      courseId: 'pinecrest', strokes: 34, opponents: ['Rusty'], fairways: 5, gir: 5, longestDrive: 240, longestPutt: 8, usedRareClub: false, bogeyFree: true, scores: [4, 4, 3, 4, 3, 3, 4, 5, 4],
    });
    expect(p.coins).toBe(c0 + out.coins + out.levelRewards);
    expect(p.xp).toBe(out.xp);
    expect(out.newAchievements).toContain('first_birdie');
    expect(out.newAchievements).toContain('win1');
    expect(out.newAchievements).toContain('under_par');
    expect(P.claimAchievement(p, 'win1')).toBeGreaterThan(0);
    expect(P.claimAchievement(p, 'win1')).toBe(0);
  });

  it('levels follow the xp curve', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(1)).level).toBe(2);
    expect(levelFromXp(xpForLevel(1) + xpForLevel(2) - 1).level).toBe(2);
  });
});

describe('save system', () => {
  it('round-trips through JSON', () => {
    const p = P.newProfile();
    P.grantClub(p, 'drv_aurora');
    p.coins = 1234;
    const q = P.loadProfileFromJSON(JSON.stringify(p));
    expect(q.coins).toBe(1234);
    expect(q.clubs.drv_aurora).toBeDefined();
  });

  it('migrates a version 1 save', () => {
    const v1 = { version: 1, createdAt: 1, coins: 999, xp: 50, clubs: ['drv_timberline', 'pt_brass', 'i9_ridge', 'i9_ridge'], bag: { putter: 'pt_brass' }, cosmetics: ['hat_cap_red'], settings: { sfx: false } };
    const p = P.loadProfileFromJSON(JSON.stringify(v1));
    expect(p.version).toBe(P.SAVE_VERSION);
    expect(p.coins).toBe(999);
    expect(p.clubs.i9_ridge.shards).toBe(1);
    expect(p.settings.sfx).toBe(false);
    expect(p.settings.botSpeed).toBe('fast');
    expect(p.cosmetics).toContain('hat_cap_red');
    expect(p.daily.challenges).toHaveLength(3);
  });

  it('repairs damaged data instead of crashing', () => {
    const p = P.loadProfileFromJSON(JSON.stringify({ version: 2, coins: 'lots', clubs: { fake_club: { level: 9 } }, bag: { driver: 'pt_brass', putter: 'nope' }, outfit: { hat: 'not_owned' } }));
    expect(p.coins).toBeGreaterThanOrEqual(0);
    expect(p.clubs.fake_club).toBeUndefined();
    expect(p.bag.putter).toBe('pt_brass');
    expect(p.bag.driver).not.toBe('pt_brass');
    expect(() => P.loadProfileFromJSON('not json')).toThrow();
    expect(() => P.loadProfileFromJSON(JSON.stringify({ version: 99 }))).toThrow();
  });
});

describe('clubs & abilities', () => {
  it('all clubs are valid and data-driven', () => {
    const names = new Set<string>();
    for (const c of CLUBS) {
      expect(SUBTYPES[c.subtype].cat).toBe(c.category);
      for (const k of STAT_KEYS) expect(c.stats[k]).toBeGreaterThan(0);
      expect(TRIGGERS[c.ability.trigger]).toBeDefined();
      expect(EFFECTS[c.ability.effect]).toBeDefined();
      expect(names.has(c.ability.name)).toBe(false);
      names.add(c.ability.name);
    }
  });

  it('stat budgets rise gently with rarity (no runaway power creep)', () => {
    const avg = (r: string) => {
      const l = CLUBS.filter((c) => c.rarity === r);
      return l.reduce((a, c) => a + STAT_KEYS.reduce((s, k) => s + c.stats[k], 0), 0) / l.length;
    };
    const vals = RARITIES.map(avg);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1] - 5);
      expect(vals[i] - vals[i - 1]).toBeLessThan(40);
    }
  });

  it('abilities only trigger under their conditions and change shot modifiers', () => {
    const sunburst = clubById('drv_sunburst'); // perfect -> carry
    const m1 = defaultShotMods();
    expect(applyAbility(sunburst.ability, 60, ctx({ perfect: false }), m1)).toBe(false);
    expect(m1.carryMul).toBe(1);
    const m2 = defaultShotMods();
    expect(applyAbility(sunburst.ability, 60, ctx({ perfect: true }), m2)).toBe(true);
    expect(m2.carryMul).toBeGreaterThan(1.03);
    const rough = clubById('w3_driftwood');
    const m3 = defaultShotMods();
    expect(applyAbility(rough.ability, 50, ctx({ lie: 'rough' }), m3)).toBe(true);
    expect(m3.roughPenaltyMul).toBeLessThan(1);
    const putter = clubById('pt_bucket');
    const m4 = defaultShotMods();
    applyAbility(putter.ability, 50, ctx({ onGreen: true, lie: 'green' }), m4);
    expect(m4.cupRadiusMul).toBeGreaterThan(1);
    const comeback = clubById('gw_comeback');
    expect(applyAbility(comeback.ability, 50, ctx({ trailing: false }), defaultShotMods())).toBe(false);
    expect(applyAbility(comeback.ability, 50, ctx({ trailing: true }), defaultShotMods())).toBe(true);
  });

  it('cosmetics and bots reference valid data', () => {
    const ids = new Set(COSMETICS.map((c) => c.id));
    for (const b of BOTS) {
      for (const id of b.clubs) expect(() => clubById(id)).not.toThrow();
      for (const slot of ['hat', 'shirt', 'pants', 'shoes', 'gloves', 'glasses', 'accessory', 'bag'] as const) {
        const v = b.outfit[slot];
        if (v) expect(ids.has(v)).toBe(true);
      }
    }
  });
});
