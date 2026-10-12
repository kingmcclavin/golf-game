import { create } from 'zustand';
import { secureRandom } from '../core/rng';
import { ACHIEVEMENTS } from '../data/achievements';
import type { BagSlot } from '../data/clubs';
import type { CosmeticSlot, Outfit } from '../data/cosmetics';
import * as P from './profile';
import { loadProfile, saveProfile } from './storage';

export type Screen =
  | 'menu'
  | 'play'
  | 'courses'
  | 'bag'
  | 'packs'
  | 'character'
  | 'shop'
  | 'challenges'
  | 'progress'
  | 'settings'
  | 'match';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'epic';
  icon?: string;
}

interface StoreState {
  profile: P.Profile;
  screen: Screen;
  screenParam?: string;
  toasts: Toast[];
  saveError: string | null;
  go: (s: Screen, param?: string) => void;
  toast: (text: string, kind?: Toast['kind'], icon?: string) => void;
  dismissToast: (id: number) => void;
  /** mutate the profile through a pure function and persist */
  mutate: <T>(fn: (p: P.Profile) => T) => T;
  replaceProfile: (p: P.Profile) => void;
  // convenience actions
  buyPack: (id: string) => ReturnType<typeof P.buyPack>;
  buyCosmetic: (id: string) => ReturnType<typeof P.buyCosmetic>;
  equipCosmetic: (slot: CosmeticSlot, id: string | null) => boolean;
  setAppearance: (o: Partial<Outfit>) => void;
  equipClub: (slot: BagSlot, id: string | null) => boolean;
  upgradeClub: (id: string) => boolean;
  claimAchievement: (id: string) => number;
  claimChallenge: (i: number) => number;
  updateSettings: (s: Partial<P.Settings>) => void;
}

const initial = loadProfile();
let toastId = 1;

export const useStore = create<StoreState>((set, get) => ({
  profile: initial.profile,
  screen: 'menu',
  toasts: initial.warning ? [{ id: toastId++, text: initial.warning, kind: 'bad' }] : [],
  saveError: null,
  go: (screen, screenParam) => set({ screen, screenParam }),
  toast: (text, kind = 'info', icon) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind, icon }] });
    setTimeout(() => get().dismissToast(id), kind === 'bad' ? 6000 : 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  mutate: (fn) => {
    const p = structuredClone(get().profile);
    P.ensureDaily(p);
    const r = fn(p);
    P.refreshCollectionStats(p);
    const fresh = P.checkAchievements(p);
    set({ profile: p });
    const err = saveProfile(p);
    if (err && err !== get().saveError) {
      set({ saveError: err });
      get().toast(`Could not save progress: ${err}`, 'bad');
    } else if (!err && get().saveError) set({ saveError: null });
    for (const id of fresh) get().toast(`Achievement unlocked: ${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}`, 'epic', '🏅');
    return r;
  },
  replaceProfile: (p) => {
    set({ profile: p });
    saveProfile(p);
  },
  buyPack: (id) => get().mutate((p) => P.buyPack(p, id, secureRandom)),
  buyCosmetic: (id) => get().mutate((p) => P.buyCosmetic(p, id)),
  equipCosmetic: (slot, id) => get().mutate((p) => P.equipCosmetic(p, slot, id)),
  setAppearance: (o) => get().mutate((p) => void Object.assign(p.outfit, o)),
  equipClub: (slot, id) => get().mutate((p) => P.equipClub(p, slot, id)),
  upgradeClub: (id) => get().mutate((p) => P.upgradeClub(p, id)),
  claimAchievement: (id) => get().mutate((p) => P.claimAchievement(p, id)),
  claimChallenge: (i) => get().mutate((p) => P.claimChallenge(p, i)),
  updateSettings: (s) => get().mutate((p) => void Object.assign(p.settings, s)),
}));

// make sure today's challenges exist and the initial profile is persisted
useStore.getState().mutate(() => undefined);
