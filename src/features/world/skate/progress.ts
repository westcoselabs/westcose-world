/** Device-local skateboard records: whether the rider has a board, and Game of S.K.A.T.E.
 * bests. Every value is validated on read; blocked or corrupt storage starts fresh. */
import type { SkateGameResult } from '../runtime/skate-session';

export const SKATE_PROGRESS_KEY = 'westcose-world:skate:v1';
export interface SkateProgress {
  owned: boolean;
  /** Fastest complete S.K.A.T.E. in seconds, or null. */
  bestTime: number | null;
  bestScore: number;
  bestCombo: number;
  bestLetters: number;
  games: number;
  completions: number;
}
export const emptySkateProgress = (): SkateProgress => ({ owned: false, bestTime: null, bestScore: 0, bestCombo: 0, bestLetters: 0, games: 0, completions: 0 });

const count = (value: unknown, max = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? Math.floor(value) : 0;

export function loadSkateProgress(): SkateProgress {
  if (typeof window === 'undefined') return emptySkateProgress();
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(SKATE_PROGRESS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return emptySkateProgress();
    const r = raw as Partial<Record<keyof SkateProgress, unknown>>;
    const time = typeof r.bestTime === 'number' && Number.isFinite(r.bestTime) && r.bestTime > 0 && r.bestTime < 3600 ? r.bestTime : null;
    return { owned: r.owned === true, bestTime: time, bestScore: count(r.bestScore), bestCombo: count(r.bestCombo), bestLetters: Math.min(5, count(r.bestLetters, 5)), games: count(r.games), completions: count(r.completions) };
  } catch { return emptySkateProgress(); }
}

export function saveSkateProgress(progress: SkateProgress) {
  try { window.localStorage.setItem(SKATE_PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

export type SkateRecordOutcome = { progress: SkateProgress; newBestTime: boolean; newBestScore: boolean };
export function recordSkateGame(progress: SkateProgress, result: SkateGameResult): SkateRecordOutcome {
  const newBestTime = result.complete && (progress.bestTime === null || result.time < progress.bestTime);
  const newBestScore = result.score > progress.bestScore;
  return {
    newBestTime, newBestScore,
    progress: {
      ...progress,
      bestTime: newBestTime ? result.time : progress.bestTime,
      bestScore: Math.max(progress.bestScore, result.score),
      bestCombo: Math.max(progress.bestCombo, result.bestCombo),
      bestLetters: Math.max(progress.bestLetters, result.letters),
      games: progress.games + 1,
      completions: progress.completions + (result.complete ? 1 : 0),
    },
  };
}
