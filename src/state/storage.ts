import { loadProfileFromJSON, newProfile, type Profile } from './profile';

export const SAVE_KEY = 'fairway-legends-save';
const BACKUP_KEY = 'fairway-legends-save.bak';

export interface LoadResult {
  profile: Profile;
  warning?: string;
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const k = '__fl_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export function loadProfile(): LoadResult {
  const s = storage();
  if (!s) return { profile: newProfile(), warning: 'Browser storage is unavailable (private mode?). Progress will not be saved.' };
  const main = s.getItem(SAVE_KEY);
  if (!main) return { profile: newProfile() };
  try {
    return { profile: loadProfileFromJSON(main) };
  } catch (e) {
    console.warn('Main save invalid, trying backup', e);
    const bak = s.getItem(BACKUP_KEY);
    if (bak) {
      try {
        return { profile: loadProfileFromJSON(bak), warning: 'Your save was damaged; restored from the automatic backup.' };
      } catch {
        /* fall through */
      }
    }
    // keep the broken data around so it is not lost
    try {
      s.setItem(`${SAVE_KEY}.corrupt.${Date.now()}`, main);
    } catch {
      /* ignore */
    }
    return { profile: newProfile(), warning: 'Your save could not be read, so a new profile was started. The old data was kept in storage.' };
  }
}

let lastGood: string | null = null;

export function saveProfile(p: Profile): string | null {
  const s = storage();
  if (!s) return 'Storage unavailable';
  try {
    const json = JSON.stringify(p);
    if (lastGood) s.setItem(BACKUP_KEY, lastGood);
    s.setItem(SAVE_KEY, json);
    lastGood = json;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Unknown save error';
  }
}

export function exportSave(p: Profile) {
  const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fairway-legends-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function resetSave() {
  const s = storage();
  s?.removeItem(SAVE_KEY);
  s?.removeItem(BACKUP_KEY);
  lastGood = null;
}
