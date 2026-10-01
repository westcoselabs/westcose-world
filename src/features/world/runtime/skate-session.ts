/** Mutable skateboard session shared by the world runtime, the in-canvas controller and the
 * DOM HUD. The controller writes the HUD snapshot every frame; React only re-renders on
 * equip, game phase and results changes, never per frame. */
import type { SkateInput, SkateMode } from '../skate/physics';
import type { SkatePopup } from '../skate/tricks';

export type SkateRequest =
  | { kind: 'equip' }
  | { kind: 'game' }
  | { kind: 'restart-game' }
  | { kind: 'end-game' }
  /** Development and tests: drop the rider at a chart point, rolling. */
  | { kind: 'spawn'; x: number; z: number; east: number; north: number; speed: number };

export type SkateGamePhase = 'none' | 'countdown' | 'playing' | 'finished';
export type SkateLetterId = 'S' | 'K' | 'A' | 'T' | 'E';
export interface SkateGameResult { complete: boolean; time: number; letters: number; got: SkateLetterId[]; score: number; bestCombo: number }

export interface SkateHud {
  mode: SkateMode;
  speed: number;
  score: number;
  comboTricks: string[];
  comboBase: number;
  comboMultiplier: number;
  /** Live air tricks not yet landed. */
  airTricks: string[];
  /** Grind or manual balance, -1..1, or null. */
  balance: number | null;
  balanceKind: 'grind' | 'manual' | null;
  charge: number;
  /** Close enough to the grand stairs to start a game of S.K.A.T.E. */
  nearGame: boolean;
  game: { phase: SkateGamePhase; countdown: number; time: number; letters: Record<SkateLetterId, boolean> };
}

export interface SkateSession {
  /** A board from the skate shop (saved on this device). */
  owned: boolean;
  /** The board is equipped and the rider is rolling. */
  riding: boolean;
  request: SkateRequest | null;
  keys: Set<string>;
  /** Keys pressed since the input reader last looked (for taps like flip and grind). */
  pressed: Set<string>;
  /** Accessible touch controls: steer pad (x right, y up) and trick buttons. */
  touch: { x: number; y: number; active: boolean; jump: boolean; grab: boolean; flip: boolean; grind: boolean; manual: boolean };
  testInput: Partial<SkateInput> | null;
  hud: SkateHud;
  popups: SkatePopup[];
  result: SkateGameResult | null;
  /** Planet-centred rider position, heading and chart position, for the walker hand-off. */
  focus: { x: number; y: number; z: number };
  heading: { x: number; y: number; z: number };
  debug: { mapX: number; mapZ: number; mode: SkateMode; surface: string; grounded: boolean; air: number; lastEvent: string; launches: number; landings: number; grinds: number; bails: number; interior: boolean };
}

export const emptySkateHud = (): SkateHud => ({
  mode: 'ground', speed: 0, score: 0, comboTricks: [], comboBase: 0, comboMultiplier: 0, airTricks: [], balance: null, balanceKind: null, charge: 0, nearGame: false,
  game: { phase: 'none', countdown: 0, time: 0, letters: { S: false, K: false, A: false, T: false, E: false } },
});

export function createSkateSession(owned = false): SkateSession {
  return {
    owned, riding: false, request: null, keys: new Set(), pressed: new Set(),
    touch: { x: 0, y: 0, active: false, jump: false, grab: false, flip: false, grind: false, manual: false },
    testInput: null, hud: emptySkateHud(), popups: [], result: null,
    focus: { x: 0, y: 0, z: 0 }, heading: { x: 0, y: 0, z: 1 },
    debug: { mapX: 0, mapZ: 0, mode: 'ground', surface: 'concrete', grounded: true, air: 0, lastEvent: '', launches: 0, landings: 0, grinds: 0, bails: 0, interior: false },
  };
}

export function clearSkateInput(session: SkateSession) {
  session.keys.clear(); session.pressed.clear();
  const t = session.touch;
  t.x = 0; t.y = 0; t.active = false; t.jump = false; t.grab = false; t.flip = false; t.grind = false; t.manual = false;
}
