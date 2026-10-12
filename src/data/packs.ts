import { RARITIES, CLUBS, type ClubDef, type Rarity } from './clubs';
import { COSMETICS, type CosmeticItem } from './cosmetics';
import { currentEvent } from './events';

export interface PackDef {
  id: string;
  name: string;
  price: number;
  clubs: number;
  /** probability (percent) of each rarity, per club slot */
  odds: Record<Rarity, number>;
  /** event packs pull from the event pool with this chance per slot */
  eventChance?: number;
  /** chance the event pack includes a bonus event cosmetic */
  cosmeticChance?: number;
  color: [string, string];
  desc: string;
  minLevel: number;
  event?: boolean;
}

export const PACKS: PackDef[] = [
  {
    id: 'starter', name: 'Starter Pack', price: 300, clubs: 3, color: ['#4cd17a', '#1d7a45'], minLevel: 1,
    desc: 'Fill the gaps in your bag. Mostly Common and Uncommon clubs.',
    odds: { common: 62, uncommon: 30, rare: 7, epic: 1, legendary: 0 },
  },
  {
    id: 'premium', name: 'Premium Pack', price: 900, clubs: 3, color: ['#3d9bff', '#1a3f8a'], minLevel: 2,
    desc: 'Better odds of Rare and Epic clubs.',
    odds: { common: 22, uncommon: 38, rare: 28, epic: 10, legendary: 2 },
  },
  {
    id: 'elite', name: 'Elite Pack', price: 2200, clubs: 4, color: ['#b05cff', '#3e1a7a'], minLevel: 4,
    desc: 'Guaranteed Uncommon or better, strong Epic odds and a shot at Legendary.',
    odds: { common: 0, uncommon: 24, rare: 40, epic: 29, legendary: 7 },
  },
  {
    id: 'event', name: 'Event Pack', price: 1200, clubs: 3, color: ['#ffb52e', '#a0400a'], minLevel: 2, event: true,
    desc: 'Limited-time themed pack with event-exclusive clubs and cosmetics.',
    odds: { common: 10, uncommon: 35, rare: 35, epic: 17, legendary: 3 },
    eventChance: 25,
    cosmeticChance: 35,
  },
];

export const packById = (id: string) => PACKS.find((p) => p.id === id);

export function validateOdds(p: PackDef): boolean {
  const sum = RARITIES.reduce((a, r) => a + p.odds[r], 0);
  return Math.abs(sum - 100) < 1e-9 && RARITIES.every((r) => p.odds[r] >= 0);
}

export function rollRarity(p: PackDef, rand: () => number): Rarity {
  const r = rand() * 100;
  let acc = 0;
  for (const k of RARITIES) {
    acc += p.odds[k];
    if (r < acc) return k;
  }
  // floating point edge: return highest rarity with non-zero odds
  return [...RARITIES].reverse().find((k) => p.odds[k] > 0) ?? 'common';
}

/** Clubs that can drop from regular packs for a given rarity. Every rarity is guaranteed to have entries. */
export function poolFor(rarity: Rarity): ClubDef[] {
  return CLUBS.filter((c) => c.rarity === rarity && !c.event);
}

export interface PackReward {
  type: 'club' | 'cosmetic';
  club?: ClubDef;
  cosmetic?: CosmeticItem;
  rarity: Rarity;
}

/** Within a rarity, clubs you don't own yet are this many times more likely than duplicates. */
export const NEW_CLUB_WEIGHT = 3;

function pickWeighted(pool: ClubDef[], owned: Set<string>, rand: () => number): ClubDef {
  const w = pool.map((c) => (owned.has(c.id) ? 1 : NEW_CLUB_WEIGHT));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function openPack(p: PackDef, rand: () => number, now = new Date(), owned: Set<string> = new Set()): PackReward[] {
  const out: PackReward[] = [];
  const ev = p.event ? currentEvent(now) : null;
  for (let i = 0; i < p.clubs; i++) {
    if (ev && rand() * 100 < (p.eventChance ?? 0)) {
      const evClubs = CLUBS.filter((c) => c.event === ev.id);
      if (evClubs.length) {
        const c = evClubs[Math.floor(rand() * evClubs.length)];
        out.push({ type: 'club', club: c, rarity: c.rarity });
        continue;
      }
    }
    const rarity = rollRarity(p, rand);
    const club = pickWeighted(poolFor(rarity), owned, rand);
    out.push({ type: 'club', club, rarity });
  }
  if (ev && rand() * 100 < (p.cosmeticChance ?? 0)) {
    const cos = COSMETICS.filter((c) => c.event === ev.id);
    if (cos.length) {
      const c = cos[Math.floor(rand() * cos.length)];
      out.push({ type: 'cosmetic', cosmetic: c, rarity: c.rarity });
    }
  }
  return out;
}
