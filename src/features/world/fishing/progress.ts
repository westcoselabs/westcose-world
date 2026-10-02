/** Device-local Pier Pressure records: clams to spend, the Tackle Box, the Fish-o-dex, records and
 * the Catch of the Day. Every storage access is guarded; blocked or corrupt storage starts fresh. */
import { createRng, hashSeed, pick, weighted } from './rng';
import { ALL_CATCHES, SPECIES, VARIANT_IDS, type VariantId } from './species';
import { MAX_LEVEL, NO_UPGRADES, UPGRADE_IDS, upgradeCost, type UpgradeId, type Upgrades } from './tackle';
import type { DailyCatch, TideResult } from './tide';

export const FISHING_PROGRESS_KEY = 'westcose-world:fishing:v1';
/** One Fish-o-dex page: how many landed, the heaviest (lb), and the variants seen. */
export interface DexEntry { caught: number; best: number; variants: VariantId[] }
export interface FishingProgress {
  clams: number; lifetimeClams: number; tides: number;
  bestTide: number; bestChain: number; biggest: { species: string; weight: number } | null;
  upgrades: Upgrades;
  dex: Record<string, DexEntry>;
  daily: { date: string; done: boolean };
  garyThefts: number; tutorialDone: boolean;
}
export interface TideOutcome {
  progress: FishingProgress;
  newBest: boolean; newChain: boolean; newBiggest: boolean; dailyDone: boolean;
  newSpecies: string[]; newVariants: { species: string; variant: VariantId }[];
}

export const emptyFishingProgress = (): FishingProgress => ({
  clams: 0, lifetimeClams: 0, tides: 0, bestTide: 0, bestChain: 0, biggest: null, upgrades: { ...NO_UPGRADES },
  dex: {}, daily: { date: '', done: false }, garyThefts: 0, tutorialDone: false,
});
const KNOWN = new Set(ALL_CATCHES.map(s => s.id));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const count = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

function storageOrNull(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readFishingProgress(value: unknown): FishingProgress {
  const progress = emptyFishingProgress(), source = record(value);
  if (!source) return progress;
  for (const key of ['clams', 'lifetimeClams', 'tides', 'bestTide', 'bestChain', 'garyThefts'] as const) progress[key] = Math.round(count(source[key]));
  progress.tutorialDone = source.tutorialDone === true;
  const upgrades = record(source.upgrades);
  if (upgrades) for (const id of UPGRADE_IDS) progress.upgrades[id] = Math.min(MAX_LEVEL, Math.floor(count(upgrades[id])));
  const biggest = record(source.biggest);
  if (biggest && typeof biggest.species === 'string' && KNOWN.has(biggest.species) && count(biggest.weight) > 0) progress.biggest = { species: biggest.species, weight: count(biggest.weight) };
  const dex = record(source.dex);
  if (dex) for (const [id, raw] of Object.entries(dex)) {
    const entry = record(raw);
    if (!KNOWN.has(id) || !entry) continue;
    const variants = Array.isArray(entry.variants) ? entry.variants.filter((v): v is VariantId => typeof v === 'string' && (VARIANT_IDS as readonly string[]).includes(v)) : [];
    progress.dex[id] = { caught: Math.round(count(entry.caught)), best: count(entry.best), variants: [...new Set(variants)] };
  }
  const daily = record(source.daily);
  if (daily && typeof daily.date === 'string' && DATE.test(daily.date)) progress.daily = { date: daily.date, done: daily.done === true };
  return progress;
}

export function loadFishingProgress(storage?: Storage | null): FishingProgress {
  try {
    const raw = storageOrNull(storage)?.getItem(FISHING_PROGRESS_KEY);
    return raw ? readFishingProgress(JSON.parse(raw)) : emptyFishingProgress();
  } catch { return emptyFishingProgress(); }
}

export function saveFishingProgress(progress: FishingProgress, storage?: Storage | null): boolean {
  try {
    const target = storageOrNull(storage);
    if (!target) return false;
    target.setItem(FISHING_PROGRESS_KEY, JSON.stringify({ version: 1, ...progress }));
    return true;
  } catch { return false; }
}

/** Merge one finished tide into the records (pure; call saveFishingProgress to persist). */
export function recordTide(previous: FishingProgress, result: TideResult, today: string): TideOutcome {
  const dex: Record<string, DexEntry> = { ...previous.dex };
  const newSpecies: string[] = [], newVariants: { species: string; variant: VariantId }[] = [];
  let biggest = previous.biggest;
  for (const c of result.landed) {
    const before = dex[c.species];
    const entry: DexEntry = before ? { ...before, variants: [...before.variants] } : { caught: 0, best: 0, variants: [] };
    if (!before && !newSpecies.includes(c.species)) newSpecies.push(c.species);
    entry.caught++; entry.best = Math.max(entry.best, c.weight);
    if (!entry.variants.includes(c.variant)) {
      entry.variants.push(c.variant);
      if (before && c.variant !== 'normal') newVariants.push({ species: c.species, variant: c.variant });
    }
    dex[c.species] = entry;
    if (!c.junk && c.weight > (biggest?.weight ?? 0)) biggest = { species: c.species, weight: c.weight };
  }
  const daily = result.dailyCaught ? { date: today, done: true } : previous.daily.date === today ? previous.daily : { date: today, done: false };
  const progress: FishingProgress = {
    ...previous, dex, biggest, daily,
    clams: previous.clams + result.clams, lifetimeClams: previous.lifetimeClams + result.clams, tides: previous.tides + 1,
    bestTide: Math.max(previous.bestTide, result.clams), bestChain: Math.max(previous.bestChain, result.bestChain),
    garyThefts: previous.garyThefts + result.stats.gary, tutorialDone: true,
  };
  return {
    progress, newSpecies, newVariants,
    newBest: result.clams > previous.bestTide, newChain: result.bestChain > previous.bestChain,
    newBiggest: biggest !== previous.biggest, dailyDone: result.dailyCaught,
  };
}

/** Buy the next level of a track if there are clams for it (pure). */
export function buyUpgrade(previous: FishingProgress, id: UpgradeId): { progress: FishingProgress; bought: boolean } {
  const level = previous.upgrades[id], cost = upgradeCost(level);
  if (cost === null || previous.clams < cost) return { progress: previous, bought: false };
  return { progress: { ...previous, clams: previous.clams - cost, upgrades: { ...previous.upgrades, [id]: level + 1 } }, bought: true };
}

/** The device's calendar date, which seeds the Catch of the Day. */
export function localDate(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today's wanted fish: mostly low tiers, mostly plain, the same for everyone on that date. */
export function dailyCatch(date: string): DailyCatch {
  const rng = createRng(hashSeed(`pier-pressure:${date}`));
  const tier = Number(weighted(rng, { '0': 4, '1': 3, '2': 2, '3': 1 }));
  return { species: pick(rng, SPECIES.filter(s => s.tier === tier)).id, variant: weighted<VariantId>(rng, { normal: 5, chonky: 3, shiny: 2 }) };
}

/** Fish-o-dex completion: every fish's six variants and every piece of junk, as a share. */
export function dexCompletion(progress: FishingProgress) {
  const fish = SPECIES.reduce((sum, s) => sum + (progress.dex[s.id]?.variants.length ?? 0), 0);
  const junk = ALL_CATCHES.filter(s => s.tier < 0).reduce((sum, s) => sum + (progress.dex[s.id] ? 1 : 0), 0);
  return (fish + junk) / (SPECIES.length * VARIANT_IDS.length + ALL_CATCHES.filter(s => s.tier < 0).length);
}
