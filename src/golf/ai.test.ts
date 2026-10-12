import { describe, it, expect } from 'vitest';
import { RNG } from '../core/rng';
import { BOTS } from '../data/bots';
import { COURSES } from '../data/courses';
import { decideBotShot, botSetup } from './ai';
import { Match } from './match';
import { makeBotPlayer } from './players';
import { executeShot } from './shot';

function playRound(courseId: string, botIds: string[], seed: number, length: 3 | 9 = 9) {
  const players = botIds.map((id) => makeBotPlayer(BOTS.find((b) => b.id === id)!));
  const m = new Match({ courseId, length, difficulty: 'beginner', seed }, players);
  const rng = new RNG(seed);
  let guard = 0;
  for (;;) {
    const pi = m.nextPlayer();
    if (pi === -1) {
      if (!m.advance()) break;
      continue;
    }
    const d = decideBotShot(m, pi, rng);
    const setup = botSetup(m, pi, d);
    const { plan, result } = executeShot(m.world, setup, d.needle, m.nextSeed());
    m.applyShot(pi, setup, plan, result);
    if (++guard > 1500) throw new Error('round did not finish');
  }
  return m;
}

describe('AI opponents', () => {
  it('bots complete every hole of every course using simulated shots', () => {
    for (const c of COURSES) {
      const t0 = performance.now();
      const m = playRound(c.id, ['jordan'], 7);
      const rows = m.players.map((p) => `${p.name}: ${p.scores.join(',')} (${m.totalRel(p)})`);
      console.log(c.id, ((performance.now() - t0) / 1000).toFixed(1) + 's', '\n  ' + rows.join('\n  '));
      for (const p of m.players) expect(p.scores.every((s) => s !== null && s >= 1)).toBe(true);
    }
  }, 600000);

  it('experts beat beginners on average', () => {
    let beg = 0, exp = 0;
    for (let s = 1; s <= 4; s++) {
      const m = playRound('pinecrest', ['rusty', 'kai'], s * 101, 3);
      beg += m.totalRel(m.players[0]);
      exp += m.totalRel(m.players[1]);
    }
    console.log('beginner total', beg, 'expert total', exp);
    expect(exp).toBeLessThan(beg);
  }, 600000);
});
