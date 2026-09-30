/** Mutable snowboard session shared by the world runtime, the in-canvas controller and
 * the DOM HUD. The controller writes the HUD snapshot every frame; React only re-renders
 * on phase changes (start, results), never per frame. */
import type { SkiRunId } from '../data/ski-runs';
import type { BoardInput } from '../snowboard/physics';
import type { Popup, RunResult } from '../snowboard/scoring';

export type SnowboardPhase = 'idle' | 'countdown' | 'riding' | 'crashed' | 'finished';
export type SnowboardRequest =
  | { kind: 'start'; runId: SkiRunId }
  | { kind: 'restart' }
  /** Development and tests: place the rider partway down a run, already riding. */
  | { kind: 'spawn'; runId: SkiRunId; progress: number; speed: number };

export interface SnowboardHud {
  runId: SkiRunId | null;
  phase: SnowboardPhase;
  /** Seconds left in the countdown. */
  countdown: number;
  time: number;
  score: number;
  combo: number;
  comboTricks: string;
  multiplier: number;
  /** Flow window remaining, 0..1. */
  flow: number;
  speed: number;
  progress: number;
  tokens: number;
  tokenTotal: number;
  gates: number;
  gatesMissed: number;
  gateTotal: number;
  airborne: boolean;
  /** Seconds spent out of bounds (warning when > 0). */
  offCourse: number;
  /** Ollie charge while Space is held, 0..1. */
  charge: number;
}

export interface SnowboardSession {
  active: boolean;
  request: SnowboardRequest | null;
  keys: Set<string>;
  /** Accessible touch controls: steer pad (x right, y up) plus jump and grab buttons. */
  touch: { x: number; y: number; active: boolean; jump: boolean; grab: boolean };
  /** Development/test input merged over keyboard and touch. */
  testInput: Partial<BoardInput> | null;
  hud: SnowboardHud;
  /** Newest popups for the HUD, drained as they are shown. */
  popups: Popup[];
  result: RunResult | null;
  /** Planet-centred rider position, for the shadow camera and the debugger. */
  focus: { x: number; y: number; z: number };
  /** Extra state for the development debugger. */
  debug: { mapX: number; mapZ: number; lateral: number; distance: number; airborne: boolean; crashed: boolean; surface: string; lastLanding: string | null; launches: number };
}

export const emptyHud = (): SnowboardHud => ({
  runId: null, phase: 'idle', countdown: 0, time: 0, score: 0, combo: 0, comboTricks: '', multiplier: 1, flow: 0,
  speed: 0, progress: 0, tokens: 0, tokenTotal: 0, gates: 0, gatesMissed: 0, gateTotal: 0, airborne: false, offCourse: 0, charge: 0,
});

export function createSnowboardSession(): SnowboardSession {
  return {
    active: false, request: null, keys: new Set(),
    touch: { x: 0, y: 0, active: false, jump: false, grab: false },
    testInput: null, hud: emptyHud(), popups: [], result: null,
    focus: { x: 0, y: 0, z: 0 },
    debug: { mapX: 0, mapZ: 0, lateral: 0, distance: 0, airborne: false, crashed: false, surface: 'groomed', lastLanding: null, launches: 0 },
  };
}

export function clearSnowboardInput(session: SnowboardSession) {
  session.keys.clear();
  session.touch.x = 0; session.touch.y = 0; session.touch.active = false; session.touch.jump = false; session.touch.grab = false;
}
