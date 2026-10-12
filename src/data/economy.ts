import { DIFFICULTY_INFO, type Difficulty } from './bots';

/** All reward tuning in one place. */
export const ECONOMY = {
  perHole: 22,
  perPlacement: [1.0, 0.55, 0.35, 0.2],
  winBonusPerHole: 18,
  underParBonusPerStroke: 25,
  birdie: 30,
  eagle: 90,
  holeInOne: 400,
  birdieCapPerRound: 8,
  perfectShot: 2,
  perfectCap: 40,
  xpPerHole: 12,
  xpWin: 40,
  xpPerBirdie: 8,
};

export interface RewardLine {
  label: string;
  coins: number;
}

export interface RewardInput {
  holes: number;
  position: number; // 1-based
  players: number;
  relPar: number;
  birdies: number;
  eagles: number;
  holeInOnes: number;
  perfectShots: number;
  courseMul: number;
  difficulty: Difficulty;
  won: boolean;
}

export function computeRewards(r: RewardInput): { lines: RewardLine[]; coins: number; xp: number } {
  const diff = DIFFICULTY_INFO[r.difficulty];
  const mul = r.courseMul * diff.rewardMul;
  const lines: RewardLine[] = [];
  lines.push({ label: `Round completed (${r.holes} holes)`, coins: Math.round(ECONOMY.perHole * r.holes * mul) });
  if (r.players > 1) {
    const place = ECONOMY.perPlacement[Math.min(r.position - 1, ECONOMY.perPlacement.length - 1)];
    if (r.won) lines.push({ label: 'Match victory', coins: Math.round(ECONOMY.winBonusPerHole * r.holes * mul * diff.winBonus) });
    else lines.push({ label: `Finished ${ordinal(r.position)}`, coins: Math.round(ECONOMY.perHole * r.holes * mul * place * 0.4) });
  }
  if (r.relPar < 0) lines.push({ label: `Under par (${r.relPar})`, coins: Math.round(-r.relPar * ECONOMY.underParBonusPerStroke * mul) });
  const birdies = Math.min(r.birdies, ECONOMY.birdieCapPerRound);
  if (birdies > 0) lines.push({ label: `Birdies ×${birdies}`, coins: Math.round(birdies * ECONOMY.birdie * mul) });
  if (r.eagles > 0) lines.push({ label: `Eagles ×${r.eagles}`, coins: Math.round(r.eagles * ECONOMY.eagle * mul) });
  if (r.holeInOnes > 0) lines.push({ label: `Hole in one ×${r.holeInOnes}`, coins: Math.round(r.holeInOnes * ECONOMY.holeInOne * mul) });
  if (r.perfectShots > 0) lines.push({ label: `Perfect strikes ×${r.perfectShots}`, coins: Math.min(ECONOMY.perfectCap, r.perfectShots * ECONOMY.perfectShot) });
  const coins = lines.reduce((a, l) => a + l.coins, 0);
  const xp = Math.round(
    (ECONOMY.xpPerHole * r.holes + (r.won ? ECONOMY.xpWin * (r.holes / 9) : 0) + (r.birdies + r.eagles * 2) * ECONOMY.xpPerBirdie) * (0.8 + r.courseMul * 0.2),
  );
  return { lines, coins, xp };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
