/** Mutable Pier Pressure session shared by the world runtime, the in-canvas controller and the
 * DOM HUD. The controller writes the HUD snapshot every frame; React only re-renders on phase
 * changes (start, results), never per frame. Type-only imports from `../fishing` keep this
 * module light: the planet checks build the runtime from `data/` and `runtime/` alone. */
import type { DailyCatch, TideInput, TidePhase, TideResult, Catch } from '../fishing/tide';
import type { MoveKind, VariantId } from '../fishing/species';
import type { Upgrades } from '../fishing/tackle';

export type FishingRequest =
  | { kind: 'start'; seed: number; upgrades: Upgrades; tutorial: boolean; daily: DailyCatch | null }
  /** Quit: the tide ends with what is already in the cooler. */
  | { kind: 'end' }
  /** Development and tests: the next fish to bite. */
  | { kind: 'force'; species: string; variant: VariantId | null };

export interface FishingPopup { id: number; kind: 'big' | 'good' | 'bad' | 'info' | 'gary'; text: string; detail?: string }

export interface FishingHud {
  phase: TidePhase | 'idle';
  worms: number; cooler: number; clams: number; chain: number;
  /** The live bait on the hook, if any, and the tier it draws. */
  live: { species: string; tier: number } | null;
  charge: number; aim: number;
  /** Fight readouts: tension as a share of the snap limit, stamina 0..1, metres of line. */
  tension: number; stamina: number; distance: number;
  fish: string | null; fishTier: number;
  tell: { move: MoveKind; dir: number } | null; move: MoveKind | null;
  /** Seconds of ink left over the gauge; the sun's glare 0..1. */
  ink: number; glare: number;
  /** How much of the bite window is gone, 0..1, while the CHOMP is on. */
  bite: number;
  catch: Catch | null;
  /** Gary's seconds left on the card (Infinity when he won't come); decisions open after a beat. */
  gary: number; decide: boolean;
  /** The heckle bubble: text and its anchor on screen, 0..1 from the top left. */
  bubble: { text: string; x: number; y: number; visible: boolean };
  /** First-tide coaching, empty once the tutorial is done. */
  hint: string;
}

export interface FishingSession {
  active: boolean;
  request: FishingRequest | null;
  keys: Set<string>;
  /** Fresh key presses since the last frame; the controller drains them. */
  pressed: Set<string>;
  /** Accessible touch controls: the steer pad (x right, y up), the round primary button, the card. */
  touch: { x: number; y: number; active: boolean; primary: boolean; primaryPressed: boolean; bow: boolean; keep: boolean; bait: boolean };
  /** Development and tests: input merged over keyboard and touch, and a bot that plays the fight. */
  testInput: Partial<TideInput> | null;
  autoFight: 'expert' | 'casual' | null;
  hud: FishingHud;
  popups: FishingPopup[];
  result: TideResult | null;
  /** While the Sun dangles from the rod, it lights the pier: a planet-centred point, 0..1. */
  sunLight: { x: number; y: number; z: number; strength: number } | null;
  /** Extra state for the development debugger. */
  debug: { phase: TidePhase | 'idle'; seed: number; time: number; landed: number; lost: number; last: string | null };
}

export const emptyFishingHud = (): FishingHud => ({
  phase: 'idle', worms: 0, cooler: 0, clams: 0, chain: 0, live: null, charge: 0, aim: 0,
  tension: 0, stamina: 0, distance: 0, fish: null, fishTier: -1, tell: null, move: null, ink: 0, glare: 0, bite: 0,
  catch: null, gary: Infinity, decide: false, bubble: { text: '', x: .5, y: .4, visible: false }, hint: '',
});

export function createFishingSession(): FishingSession {
  return {
    active: false, request: null, keys: new Set(), pressed: new Set(),
    touch: { x: 0, y: 0, active: false, primary: false, primaryPressed: false, bow: false, keep: false, bait: false },
    testInput: null, autoFight: null, hud: emptyFishingHud(), popups: [], result: null, sunLight: null,
    debug: { phase: 'idle', seed: 0, time: 0, landed: 0, lost: 0, last: null },
  };
}

export function clearFishingInput(session: FishingSession) {
  session.keys.clear(); session.pressed.clear();
  const t = session.touch;
  t.x = 0; t.y = 0; t.active = false; t.primary = false; t.primaryPressed = false; t.bow = false; t.keep = false; t.bait = false;
}
