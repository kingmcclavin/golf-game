import { create } from 'zustand';
import type { AbilityState } from '../data/abilities';
import type { Rarity } from '../data/clubs';
import type { MatchOutcome } from './profile';
import type { Surface } from '../golf/types';

export type Phase = 'loading' | 'intro' | 'aim' | 'swing' | 'botThink' | 'flight' | 'result' | 'holeOver' | 'roundOver';
export type CamMode = 'behind' | 'target' | 'green' | 'overview';

export interface PlayerHud {
  name: string;
  color: string;
  isBot: boolean;
  holeStrokes: number;
  rel: number;
  thru: number;
  holed: boolean;
  scores: (number | null)[];
  difficulty?: string;
  archetype?: string;
}

export interface ClubHud {
  id: string;
  name: string;
  short: string;
  rarity: Rarity;
  color: string;
  category: string;
  carry: number;
  level: number;
}

export interface Message {
  text: string;
  sub?: string;
  kind: 'good' | 'neutral' | 'bad' | 'great' | 'perfect' | 'ability';
  id: number;
}

export interface HoleSummaryRow {
  name: string;
  color: string;
  strokes: number;
  par: number;
  label: string;
  rel: number;
  total: number;
}

export interface HudState {
  phase: Phase;
  holeNumber: number;
  totalHoles: number;
  par: number;
  holeName: string;
  holeYards: number;
  pars: number[];
  players: PlayerHud[];
  current: number;
  isHumanTurn: boolean;
  bag: ClubHud[];
  clubIdx: number;
  ability: { name: string; desc: string; state: AbilityState } | null;
  distToPin: number;
  lie: Surface;
  elevation: number;
  wind: { mph: number; angle: number };
  preview: { carry: number; total: number } | null;
  camMode: CamMode;
  camModes: CamMode[];
  shape: number;
  traj: 'low' | 'normal' | 'high';
  canShape: boolean;
  canTraj: boolean;
  botThinking: string | null;
  message: Message | null;
  holeSummary: HoleSummaryRow[] | null;
  commentary: string | null;
  outcome: MatchOutcome | null;
  finalRows: Array<{ name: string; color: string; rel: number; strokes: number; position: number; isBot: boolean }> | null;
  liePenalty: number;
  showHint: boolean;
  isPutt: boolean;
  puttFeet: number;
  suggestPower: number;
  shotType: string;
}

export const initialHud = (): HudState => ({
  phase: 'loading', holeNumber: 1, totalHoles: 9, par: 4, holeName: '', holeYards: 0, pars: [], players: [], current: 0, isHumanTurn: false,
  bag: [], clubIdx: 0, ability: null, distToPin: 0, lie: 'tee', elevation: 0, wind: { mph: 0, angle: 0 }, preview: null,
  camMode: 'behind', camModes: ['behind'], shape: 0, traj: 'normal', canShape: false, canTraj: false, botThinking: null, message: null,
  holeSummary: null, commentary: null, outcome: null, finalRows: null, liePenalty: 0, showHint: false, isPutt: false, puttFeet: 0, suggestPower: 1, shotType: '',
});

export const useHud = create<HudState>(() => initialHud());

export interface SwingState {
  pulling: boolean;
  power: number;
  needle: number;
  perfectWindow: number;
  pullX: number;
  pullY: number;
}

export const useSwing = create<SwingState>(() => ({ pulling: false, power: 0, needle: 0, perfectWindow: 0.1, pullX: 0, pullY: 0 }));
