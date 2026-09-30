/** Device-local snowboard records: best score, best time, medal and challenge stars
 * per run. Every storage access is guarded; blocked or corrupt storage starts fresh. */
import { SKI_RUN_IDS, type SkiRunId } from '../data/ski-runs';
import { MEDALS, type Medal, type RunResult } from './scoring';

export const PROGRESS_KEY = 'westcose-world:snowboard:v1';
export type RunRecord = { best: number; bestTime: number | null; medal: Medal | null; stars: [boolean, boolean, boolean]; rides: number };
export type SnowboardProgress = Record<SkiRunId, RunRecord>;
export type RecordOutcome = { progress: SnowboardProgress; newBest: boolean; newTime: boolean; newMedal: boolean; newStars: boolean[] };

const emptyRecord = (): RunRecord => ({ best: 0, bestTime: null, medal: null, stars: [false, false, false], rides: 0 });
export const emptyProgress = (): SnowboardProgress => Object.fromEntries(SKI_RUN_IDS.map(id => [id, emptyRecord()])) as SnowboardProgress;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const rank = (medal: Medal | null) => medal ? MEDALS.indexOf(medal) : -1;

function readRecord(value: unknown): RunRecord {
  const record = emptyRecord();
  if (!value || typeof value !== 'object') return record;
  const source = value as Record<string, unknown>;
  record.best = Math.round(finite(source.best, 0));
  record.bestTime = typeof source.bestTime === 'number' && Number.isFinite(source.bestTime) && source.bestTime > 0 ? source.bestTime : null;
  record.medal = typeof source.medal === 'string' && (MEDALS as readonly string[]).includes(source.medal) ? source.medal as Medal : null;
  if (Array.isArray(source.stars)) record.stars = [0, 1, 2].map(i => source.stars instanceof Array && source.stars[i] === true) as RunRecord['stars'];
  record.rides = Math.round(finite(source.rides, 0));
  return record;
}

function storageOrNull(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadProgress(storage?: Storage | null): SnowboardProgress {
  const progress = emptyProgress();
  try {
    const raw = storageOrNull(storage)?.getItem(PROGRESS_KEY);
    if (!raw) return progress;
    const parsed: unknown = JSON.parse(raw);
    const runs = parsed && typeof parsed === 'object' ? (parsed as { runs?: unknown }).runs : undefined;
    if (!runs || typeof runs !== 'object') return progress;
    for (const id of SKI_RUN_IDS) progress[id] = readRecord((runs as Record<string, unknown>)[id]);
  } catch { /* Corrupt or blocked storage: start fresh. */ }
  return progress;
}

export function saveProgress(progress: SnowboardProgress, storage?: Storage | null): boolean {
  try {
    const target = storageOrNull(storage);
    if (!target) return false;
    target.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, runs: progress }));
    return true;
  } catch { return false; }
}

/** Merge one finished run into the records (pure; call saveProgress to persist). */
export function recordResult(progress: SnowboardProgress, result: RunResult): RecordOutcome {
  const previous = progress[result.runId];
  const next: RunRecord = {
    best: Math.max(previous.best, result.score),
    bestTime: previous.bestTime === null ? result.time : Math.min(previous.bestTime, result.time),
    medal: rank(result.medal) > rank(previous.medal) ? result.medal : previous.medal,
    stars: previous.stars.map((star, i) => star || !!result.challenges[i]) as RunRecord['stars'],
    rides: previous.rides + 1,
  };
  return {
    progress: { ...progress, [result.runId]: next },
    newBest: result.score > previous.best,
    newTime: previous.bestTime === null || result.time < previous.bestTime,
    newMedal: rank(result.medal) > rank(previous.medal),
    newStars: result.challenges.map((done, i) => done && !previous.stars[i]),
  };
}
