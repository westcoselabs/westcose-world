/** A seeded mulberry32, so tides, tests and the Catch of the Day replay exactly. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: Rng, low: number, high: number) => low + (high - low) * rng();
export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/** Pick a key from positive weights; zero or missing weights never come up. */
export function weighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights).filter(([, w]) => typeof w === 'number' && w > 0) as [K, number][];
  let roll = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) { roll -= w; if (roll <= 0) return key; }
  return entries[entries.length - 1][0];
}

/** FNV-1a: a stable 32-bit seed from text, such as a calendar date. */
export function hashSeed(text: string) {
  let hash = 0x811C9DC5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash >>> 0;
}
