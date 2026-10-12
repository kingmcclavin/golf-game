import { COURSES } from './courses';
import type { Difficulty } from './bots';

export const MAX_LEVEL = 50;

/** XP needed to go from level L to L+1. */
export const xpForLevel = (level: number) => Math.round(100 + 60 * (level - 1) + 6 * (level - 1) ** 2);

export function levelFromXp(totalXp: number): { level: number; into: number; need: number } {
  let level = 1;
  let xp = totalXp;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }
  return { level, into: xp, need: xpForLevel(level) };
}

/** Coins awarded when reaching a level. */
export const levelUpReward = (level: number) => 150 + level * 25;

export function courseUnlocked(courseId: string, level: number, wins: number): boolean {
  const c = COURSES.find((x) => x.id === courseId);
  if (!c) return false;
  return level >= c.unlock.level || (c.unlock.wins !== undefined && wins >= c.unlock.wins);
}

export const DIFFICULTY_UNLOCK: Record<Difficulty, number> = { beginner: 1, intermediate: 2, expert: 5 };

export const FEATURE_UNLOCKS = {
  shaping: 3,
  trajectory: 4,
  eighteen: 5,
};

export interface UnlockInfo {
  level: number;
  text: string;
}

export function upcomingUnlocks(level: number): UnlockInfo[] {
  const out: UnlockInfo[] = [];
  for (const c of COURSES) if (c.unlock.level > level) out.push({ level: c.unlock.level, text: `Course: ${c.name}` });
  if (FEATURE_UNLOCKS.shaping > level) out.push({ level: FEATURE_UNLOCKS.shaping, text: 'Shot shaping (draw & fade)' });
  if (FEATURE_UNLOCKS.trajectory > level) out.push({ level: FEATURE_UNLOCKS.trajectory, text: 'Trajectory control (low / high)' });
  if (FEATURE_UNLOCKS.eighteen > level) out.push({ level: FEATURE_UNLOCKS.eighteen, text: '18-hole rounds' });
  for (const [d, l] of Object.entries(DIFFICULTY_UNLOCK)) if (l > level) out.push({ level: l, text: `${d[0].toUpperCase()}${d.slice(1)} opponents` });
  return out.sort((a, b) => a.level - b.level);
}
