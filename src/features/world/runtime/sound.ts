/** The world's one sound preference. Sound is opt-in: off until the visitor turns it on, and
 * remembered on this device. Guarded storage, no side effects at import. */
export const SOUND_KEY = 'westcose-world:sound:v1';

export function loadSoundPreference(storage?: Storage | null): boolean {
  try {
    const target = storage !== undefined ? storage : typeof localStorage === 'undefined' ? null : localStorage;
    return target?.getItem(SOUND_KEY) === 'on';
  } catch { return false; }
}

export function saveSoundPreference(on: boolean, storage?: Storage | null): boolean {
  try {
    const target = storage !== undefined ? storage : typeof localStorage === 'undefined' ? null : localStorage;
    if (!target) return false;
    target.setItem(SOUND_KEY, on ? 'on' : 'off');
    return true;
  } catch { return false; }
}
