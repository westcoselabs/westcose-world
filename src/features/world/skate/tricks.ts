/** Trick catalog, direction mapping and combo scoring in the style of the classic arcade
 * skate games: a combo's value is the sum of its trick points times the number of tricks,
 * repeats inside one combo are worth less, and a bail loses the lot. */

export type FlipId = 'kickflip' | 'heelflip' | 'shove' | 'impossible' | 'varial' | 'treflip';
export type GrabId = 'indy' | 'melon' | 'nosegrab' | 'tailgrab' | 'method' | 'madonna' | 'benihana';
export type GrindId = '5050' | 'nosegrind' | '50' | 'boardslide' | 'crooked' | 'feeble';
export type ManualId = 'manual' | 'nose';

/** Board rotation over a flip, in full turns about its long axis (roll), vertical (yaw)
 * and width axis (pitch). */
export const FLIPS: Record<FlipId, { name: string; points: number; time: number; roll: number; yaw: number; pitch: number }> = {
  kickflip: { name: 'Kickflip', points: 100, time: .4, roll: -1, yaw: 0, pitch: 0 },
  heelflip: { name: 'Heelflip', points: 100, time: .4, roll: 1, yaw: 0, pitch: 0 },
  shove: { name: 'Pop Shove-It', points: 100, time: .34, roll: 0, yaw: .5, pitch: 0 },
  impossible: { name: 'Impossible', points: 300, time: .48, roll: 0, yaw: 0, pitch: 1 },
  varial: { name: 'Varial Kickflip', points: 300, time: .46, roll: -1, yaw: .5, pitch: 0 },
  treflip: { name: '360 Flip', points: 500, time: .54, roll: -1, yaw: 1, pitch: 0 },
};
export const GRABS: Record<GrabId, { name: string; points: number }> = {
  indy: { name: 'Indy', points: 200 }, melon: { name: 'Melon', points: 200 }, method: { name: 'Method', points: 250 },
  nosegrab: { name: 'Nosegrab', points: 250 }, tailgrab: { name: 'Tailgrab', points: 250 },
  madonna: { name: 'Madonna', points: 400 }, benihana: { name: 'Benihana', points: 400 },
};
export const GRAB_PER_SECOND = 140;
/** `across` grinds turn the board square to the rail. */
export const GRINDS: Record<GrindId, { name: string; points: number; across: boolean; tilt: number }> = {
  '5050': { name: '50-50', points: 100, across: false, tilt: 0 },
  nosegrind: { name: 'Nosegrind', points: 150, across: false, tilt: -.28 },
  '50': { name: '5-0', points: 150, across: false, tilt: .28 },
  boardslide: { name: 'Boardslide', points: 200, across: true, tilt: 0 },
  crooked: { name: 'Crooked Grind', points: 250, across: false, tilt: -.3 },
  feeble: { name: 'Feeble Grind', points: 250, across: false, tilt: .3 },
};
export const GRIND_PER_SECOND = 75;
export const MANUALS: Record<ManualId, { name: string; points: number }> = { manual: { name: 'Manual', points: 100 }, nose: { name: 'Nose Manual', points: 125 } };
export const MANUAL_PER_SECOND = 60;

/** Stick direction at the moment of the trick: x is steer (right positive), y is up. */
export function flipFor(x: number, y: number): FlipId {
  if (y > .5 && Math.abs(x) > .5) return 'treflip';
  if (y < -.5 && Math.abs(x) > .5) return 'varial';
  if (y > .5) return 'impossible';
  if (y < -.5) return 'shove';
  return x > .5 ? 'heelflip' : 'kickflip';
}
export function grabFor(x: number, y: number): GrabId {
  if (y > .5 && Math.abs(x) > .5) return 'madonna';
  if (y < -.5 && Math.abs(x) > .5) return 'benihana';
  if (y > .5) return 'nosegrab';
  if (y < -.5) return 'tailgrab';
  return x < -.5 ? 'indy' : x > .5 ? 'melon' : 'method';
}
export function grindFor(x: number, y: number, approach: number): GrindId {
  if (y > .5 && Math.abs(x) > .5) return 'crooked';
  if (y < -.5 && Math.abs(x) > .5) return 'feeble';
  if (y > .5) return 'nosegrind';
  if (y < -.5) return '50';
  // Coming at a rail across its line, or asking for it, is a boardslide.
  return Math.abs(x) > .5 || approach > 50 * Math.PI / 180 ? 'boardslide' : '5050';
}

/** Spin to the nearest half turn, if the rider is close enough to one to call it. */
export function spinName(spin: number) {
  const halves = Math.round(Math.abs(spin) / Math.PI);
  if (halves === 0 || Math.abs(Math.abs(spin) - halves * Math.PI) > 55 * Math.PI / 180) return null;
  // Counter-clockwise from above is frontside for a regular rider.
  return { degrees: halves * 180, side: spin > 0 ? 'FS' : 'BS', points: halves === 1 ? 100 : halves === 2 ? 250 : halves === 3 ? 450 : halves === 4 ? 700 : halves === 5 ? 1000 : 1000 + (halves - 5) * 350 };
}

export type SkatePopup = { id: number; kind: 'trick' | 'bank' | 'bail' | 'info' | 'letter'; text: string; points?: number };
export type ComboTrick = { name: string; points: number };

export class SkateScore {
  score = 0;
  bestCombo = 0;
  tricks: ComboTrick[] = [];
  popups: SkatePopup[] = [];
  lastCombo: { value: number; names: string[] } | null = null;
  private counts = new Map<string, number>();
  private next = 1;

  get comboBase() { return this.tricks.reduce((sum, trick) => sum + trick.points, 0); }
  get multiplier() { return this.tricks.length; }
  get comboValue() { return this.comboBase * this.multiplier; }

  /** A repeat in the same combo is worth 25% less each time, down to a quarter. */
  add(name: string, points: number, key = name) {
    const seen = this.counts.get(key) ?? 0;
    this.counts.set(key, seen + 1);
    const value = Math.round(points * Math.max(.25, 1 - .25 * seen));
    this.tricks.push({ name, points: value });
    this.popup('trick', name, value);
  }

  bank() {
    if (!this.tricks.length) return 0;
    const value = this.comboValue;
    this.score += value;
    this.bestCombo = Math.max(this.bestCombo, value);
    this.lastCombo = { value, names: this.tricks.map(trick => trick.name) };
    this.popup('bank', this.tricks.length > 1 ? `${this.tricks.length} TRICK COMBO` : this.tricks[0].name.toUpperCase(), value);
    this.clear();
    return value;
  }

  lose(reason: string) {
    if (this.tricks.length) this.popup('bail', reason);
    this.clear();
  }

  popup(kind: SkatePopup['kind'], text: string, points?: number) {
    this.popups.push({ id: this.next++, kind, text, points });
    if (this.popups.length > 24) this.popups.splice(0, this.popups.length - 24);
  }

  reset() { this.score = 0; this.bestCombo = 0; this.lastCombo = null; this.clear(); this.popups.length = 0; }
  private clear() { this.tricks = []; this.counts.clear(); }
}
