import type { Outfit } from './cosmetics';

export type Difficulty = 'beginner' | 'intermediate' | 'expert';
export type Archetype = 'power' | 'technician' | 'shortgame' | 'balanced';

export interface BotDef {
  id: string;
  name: string;
  archetype: Archetype;
  difficulty: Difficulty;
  bio: string;
  clubs: string[];
  clubLevel: number;
  outfit: Outfit;
  color: string;
}

export const ARCHETYPE_INFO: Record<Archetype, { label: string; desc: string; icon: string }> = {
  power: { label: 'Power Hitter', desc: 'Long and aggressive. Takes on risky lines.', icon: '💥' },
  technician: { label: 'Technician', desc: 'Accurate and careful. Plays to safe targets.', icon: '🎯' },
  shortgame: { label: 'Short-Game Specialist', desc: 'Deadly around and on the greens.', icon: '⛳' },
  balanced: { label: 'All-Rounder', desc: 'Sensible decisions on every shot.', icon: '⚖️' },
};

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; stars: number; color: string; rewardMul: number; winBonus: number }> = {
  beginner: { label: 'Beginner', stars: 1, color: '#4cd17a', rewardMul: 1, winBonus: 1 },
  intermediate: { label: 'Intermediate', stars: 2, color: '#3d9bff', rewardMul: 1.25, winBonus: 1.5 },
  expert: { label: 'Expert', stars: 3, color: '#ff5a5a', rewardMul: 1.55, winBonus: 2.2 },
};

export interface BotSkill {
  puttAimSigmaDeg: number;
  puttPowerSigma: number;
  needleSigma: number;
  powerSigma: number;
  aimSigmaDeg: number;
  windRead: number;
  blunder: number;
  risk: number;
  aimOffsets: number[];
  longGameMul: number;
  shortGameMul: number;
  puttMul: number;
  aggression: number;
}

const BASE: Record<Difficulty, Omit<BotSkill, 'risk' | 'longGameMul' | 'shortGameMul' | 'puttMul' | 'aggression'>> = {
  beginner: { needleSigma: 0.5, powerSigma: 0.1, aimSigmaDeg: 3.8, windRead: 0.6, blunder: 0.08, aimOffsets: [-4, 0, 4], puttAimSigmaDeg: 2.6, puttPowerSigma: 0.14 },
  intermediate: { needleSigma: 0.3, powerSigma: 0.065, aimSigmaDeg: 2.4, windRead: 0.32, blunder: 0.03, aimOffsets: [-5, -2.5, 0, 2.5, 5], puttAimSigmaDeg: 1.6, puttPowerSigma: 0.09 },
  expert: { needleSigma: 0.2, powerSigma: 0.045, aimSigmaDeg: 1.7, windRead: 0.15, blunder: 0.008, aimOffsets: [-6, -4, -2, 0, 2, 4, 6], puttAimSigmaDeg: 1.2, puttPowerSigma: 0.065 },
};

export function botSkill(b: BotDef): BotSkill {
  const base = BASE[b.difficulty];
  const arch: Record<Archetype, Pick<BotSkill, 'risk' | 'longGameMul' | 'shortGameMul' | 'puttMul' | 'aggression'>> = {
    power: { risk: 0.15, longGameMul: 1.05, shortGameMul: 1.1, puttMul: 1.2, aggression: 1.05 },
    technician: { risk: 0.9, longGameMul: 0.8, shortGameMul: 1.0, puttMul: 1.0, aggression: 0.95 },
    shortgame: { risk: 0.5, longGameMul: 1.15, shortGameMul: 0.6, puttMul: 0.65, aggression: 1.0 },
    balanced: { risk: 0.5, longGameMul: 1.0, shortGameMul: 1.0, puttMul: 1.0, aggression: 1.0 },
  };
  return { ...base, ...arch[b.archetype] };
}

const o = (p: Partial<Outfit>): Outfit => ({
  body: 'regular', skin: 2, face: 0, hairStyle: 'short', hairColor: '#3a2a1a',
  hat: null, shirt: 'shirt_polo_white', pants: 'pants_khaki', shoes: 'shoes_white', gloves: null, glasses: null, accessory: null, bag: 'bag_basic',
  ...p,
});

export const BOTS: BotDef[] = [
  // beginners
  { id: 'rusty', name: 'Rusty Rhodes', archetype: 'balanced', difficulty: 'beginner', bio: 'Weekend golfer who never misses a Sunday round.', color: '#e07a3a',
    clubs: ['drv_timberline', 'w3_meadow', 'h4_trail', 'i5_forge', 'i7_copper', 'i8_forge', 'pw_pitch', 'sw_sandpiper', 'pt_brass'], clubLevel: 1,
    outfit: o({ hairStyle: 'short', hairColor: '#b0502a', hat: 'hat_cap_red', shirt: 'shirt_polo_orange', skin: 1 }) },
  { id: 'tilly', name: 'Tilly Tee', archetype: 'technician', difficulty: 'beginner', bio: 'Reads every rulebook twice. Hits it straight but short.', color: '#3ab0e0',
    clubs: ['drv_timberline', 'w5_kestrel', 'h4_trail', 'i5_forge', 'i7_copper', 'i8_forge', 'pw_pitch', 'sw_sandpiper', 'pt_blade'], clubLevel: 1,
    outfit: o({ body: 'slim', hairStyle: 'ponytail', hairColor: '#e0c060', hat: 'hat_visor_white', shirt: 'shirt_polo_sky', pants: 'pants_skirt_navy', skin: 0 }) },
  { id: 'bo', name: 'Bo Bomber', archetype: 'power', difficulty: 'beginner', bio: 'Grip it and rip it. Where it lands is a mystery.', color: '#d83a3a',
    clubs: ['drv_comet', 'w3_meadow', 'h3_scout', 'i4_copper', 'i7_copper', 'i8_forge', 'pw_pitch', 'sw_sandpiper', 'pt_brass'], clubLevel: 1,
    outfit: o({ body: 'broad', hairStyle: 'buzz', hairColor: '#202020', shirt: 'shirt_tee_red', pants: 'shorts_black', skin: 4, glasses: 'glasses_shades' }) },
  { id: 'pip', name: 'Pip Chipley', archetype: 'shortgame', difficulty: 'beginner', bio: 'Practices chipping in the back garden every evening.', color: '#8a5ad8',
    clubs: ['drv_timberline', 'w5_kestrel', 'h4_trail', 'i5_forge', 'i8_forge', 'i7_copper', 'pw_pitch', 'lw_lobster', 'pt_blade'], clubLevel: 1,
    outfit: o({ body: 'slim', hairStyle: 'curly', hairColor: '#5a3a2a', hat: 'hat_bucket_tan', shirt: 'shirt_polo_lilac', skin: 3 }) },
  // intermediate
  { id: 'maya', name: 'Maya Fairway', archetype: 'technician', difficulty: 'intermediate', bio: 'Club champion three years running. Lives in the fairway.', color: '#2ab07a',
    clubs: ['drv_fairfinder', 'w5_harbor', 'h4_badger', 'i5_silver', 'i7_cobalt', 'i9_ridge', 'pw_pitch', 'sw_sandpiper', 'pt_mallet'], clubLevel: 2,
    outfit: o({ body: 'slim', hairStyle: 'bob', hairColor: '#1a1a1a', hat: 'hat_visor_navy', shirt: 'shirt_polo_mint', pants: 'pants_white', skin: 2 }) },
  { id: 'duke', name: 'Duke Drive', archetype: 'power', difficulty: 'intermediate', bio: 'Long-drive contest regular. Thinks every par 5 is a par 4.', color: '#e0a020',
    clubs: ['drv_gale', 'w3_driftwood', 'h3_scout', 'i4_cobalt', 'i6_ridge', 'i8_ember', 'pw_pitch', 'sw_sandpiper', 'pt_croquet'], clubLevel: 2,
    outfit: o({ body: 'broad', hairStyle: 'slick', hairColor: '#4a3020', shirt: 'shirt_polo_black', pants: 'pants_charcoal', skin: 1, glasses: 'glasses_sport', accessory: 'acc_chain' }) },
  { id: 'sol', name: 'Sol Sandoval', archetype: 'shortgame', difficulty: 'intermediate', bio: 'Never met a bunker shot he could not hole.', color: '#d8703a',
    clubs: ['drv_timberline', 'w5_kestrel', 'h4_badger', 'i6_ridge', 'i8_forge', 'i9_ridge', 'pw_check', 'sw_rose', 'pt_spirit'], clubLevel: 2,
    outfit: o({ hairStyle: 'curly', hairColor: '#1a1a1a', hat: 'hat_flat_gray', shirt: 'shirt_argyle_red', pants: 'pants_khaki', skin: 3, accessory: 'acc_towel' }) },
  { id: 'jordan', name: 'Jordan Par', archetype: 'balanced', difficulty: 'intermediate', bio: 'Steady, smart and annoyingly consistent.', color: '#3a6ad8',
    clubs: ['drv_fairfinder', 'w3_meadow', 'h3_canyon', 'i5_forge', 'i7_cobalt', 'i9_pine', 'gw_runner', 'sw_sandpiper', 'pt_mallet'], clubLevel: 2,
    outfit: o({ hairStyle: 'short', hairColor: '#6a4a2a', hat: 'hat_cap_navy', shirt: 'shirt_polo_sky', pants: 'pants_navy', skin: 2 }) },
  // expert
  { id: 'vera', name: 'Vera Steele', archetype: 'technician', difficulty: 'expert', bio: 'Tour veteran. Has not missed a fairway since March.', color: '#c0c8d8',
    clubs: ['drv_sharp', 'w3_typhoon', 'h3_canyon', 'i4_cobalt', 'i6_glacier', 'i9_vortex', 'pw_check', 'sw_halo', 'pt_bucket'], clubLevel: 4,
    outfit: o({ body: 'slim', hairStyle: 'bun', hairColor: '#c8c8c8', hat: 'hat_visor_white', shirt: 'shirt_polo_white', pants: 'pants_navy', skin: 1, glasses: 'glasses_round', gloves: 'glove_black' }) },
  { id: 'hank', name: "Hank 'Hurricane' Holt", archetype: 'power', difficulty: 'expert', bio: 'Averages 300 yards and doesn\'t care about the wind.', color: '#ff4a2a',
    clubs: ['drv_thunder', 'w3_mirage', 'h3_dragonfly', 'i4_cobalt', 'i6_skip', 'i8_ember', 'pw_check', 'sw_halo', 'pt_croquet'], clubLevel: 4,
    outfit: o({ body: 'broad', hairStyle: 'mohawk', hairColor: '#e04020', shirt: 'shirt_flame', pants: 'pants_black', skin: 4, glasses: 'glasses_shades', accessory: 'acc_chain' }) },
  { id: 'lucia', name: 'Lucía Touch', archetype: 'shortgame', difficulty: 'expert', bio: 'Magician with a wedge. Putts like the hole is a bucket.', color: '#ff7ac0',
    clubs: ['drv_express', 'w5_harbor', 'h4_rescue', 'i5_silver', 'i7_cobalt', 'i9_vortex', 'gw_comeback', 'lw_mistral', 'pt_clutch'], clubLevel: 4,
    outfit: o({ body: 'slim', hairStyle: 'long', hairColor: '#2a1a10', hat: 'hat_cap_pink', shirt: 'shirt_polo_pink', pants: 'pants_white', skin: 3, accessory: 'acc_watch' }) },
  { id: 'kai', name: 'Kai Summit', archetype: 'balanced', difficulty: 'expert', bio: 'Grew up on mountain courses. Unflappable.', color: '#2ad8c0',
    clubs: ['drv_sunburst', 'w3_typhoon', 'h3_canyon', 'i5_silver', 'i7_excal', 'i9_ridge', 'pw_check', 'sw_halo', 'pt_spirit'], clubLevel: 4,
    outfit: o({ hairStyle: 'spiky', hairColor: '#101010', hat: 'hat_beanie_teal', shirt: 'shirt_polo_teal', pants: 'pants_charcoal', skin: 2, gloves: 'glove_white' }) },
];

export const botById = (id: string) => BOTS.find((b) => b.id === id) ?? BOTS[0];
