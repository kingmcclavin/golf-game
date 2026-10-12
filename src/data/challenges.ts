import { RNG } from '../core/rng';
import { COURSES } from './courses';

export interface RoundSummary {
  courseId: string;
  holes: number;
  won: boolean;
  birdies: number;
  eagles: number;
  fairways: number;
  gir: number;
  perfect: number;
  longestDrive: number; // m
  longestPutt: number; // m holed
  underPar: boolean;
}

export interface ChallengeTemplate {
  kind: string;
  make: (rng: RNG) => { text: string; target: number; reward: number; param?: string };
  /** progress delta from a round, or from other actions */
  onRound?: (r: RoundSummary, param?: string, target?: number) => number;
  onPack?: () => number;
}

const YD = 0.9144;

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  { kind: 'birdies', make: (r) => { const n = r.int(1, 3); return { text: `Make ${n} birdie${n > 1 ? 's' : ''} or better`, target: n, reward: 90 + n * 60 }; }, onRound: (r) => r.birdies + r.eagles },
  { kind: 'fairways', make: (r) => { const n = r.pick([4, 6, 8]); return { text: `Hit ${n} fairways off the tee`, target: n, reward: 60 + n * 15 }; }, onRound: (r) => r.fairways },
  { kind: 'win', make: () => ({ text: 'Win a match against bots', target: 1, reward: 200 }), onRound: (r) => (r.won ? 1 : 0) },
  { kind: 'holes', make: (r) => { const n = r.pick([9, 18, 27]); return { text: `Play ${n} holes`, target: n, reward: 50 + n * 6 }; }, onRound: (r) => r.holes },
  { kind: 'drive', make: (r) => { const n = r.pick([230, 250, 270]); return { text: `Hit a drive over ${n} yards`, target: 1, reward: n - 100, param: String(n) }; }, onRound: (r, p) => (r.longestDrive / YD >= Number(p) ? 1 : 0) },
  { kind: 'perfect', make: (r) => { const n = r.pick([5, 10, 15]); return { text: `Hit ${n} perfect shots`, target: n, reward: 60 + n * 10 }; }, onRound: (r) => r.perfect },
  { kind: 'pack', make: () => ({ text: 'Open a club pack', target: 1, reward: 100 }), onPack: () => 1 },
  { kind: 'putt', make: () => ({ text: 'Hole a putt longer than 20 feet', target: 1, reward: 150 }), onRound: (r) => (r.longestPutt >= 6.1 ? 1 : 0) },
  { kind: 'gir', make: (r) => { const n = r.pick([3, 5, 7]); return { text: `Hit ${n} greens in regulation`, target: n, reward: 60 + n * 18 }; }, onRound: (r) => r.gir },
  { kind: 'underpar', make: () => ({ text: 'Finish a round under par', target: 1, reward: 220 }), onRound: (r) => (r.underPar ? 1 : 0) },
  { kind: 'course', make: () => { const c = COURSES[0]; return { text: `Complete a round at ${c.name}`, target: 1, reward: 120, param: c.id }; }, onRound: (r, p) => (r.courseId === p ? 1 : 0) },
];

export interface ChallengeState {
  kind: string;
  text: string;
  target: number;
  reward: number;
  param?: string;
  progress: number;
  claimed: boolean;
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dailyChallenges(day: string): ChallengeState[] {
  const rng = new RNG(`daily:${day}`);
  const pool = [...CHALLENGE_TEMPLATES];
  const out: ChallengeState[] = [];
  while (out.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    const m = t.make(rng);
    out.push({ kind: t.kind, ...m, progress: 0, claimed: false });
  }
  return out;
}

export const templateOf = (kind: string) => CHALLENGE_TEMPLATES.find((t) => t.kind === kind);
