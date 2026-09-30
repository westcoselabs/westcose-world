/** Points, combos and medals, as a pure state machine fed by physics and course events.
 *
 * Tricks, gates and near misses go into a combo pot. Each one reopens a short flow
 * window (carving slows its clock); when the window closes the pot banks at the
 * current multiplier. A sloppy landing banks early, a crash loses the pot and the
 * multiplier. Carving and tokens bank directly. */
import type { AirStats, BoardEvent, LandingQuality } from './physics';
import type { CourseEvent } from './course';
import type { SkiRun, SkiRunId } from '../data/ski-runs';

export const FLOW_WINDOW = 3;
/** Share of real time the flow clock runs while carving cleanly. */
export const CARVE_FLOW_RATE = .35;
export const IDLE_RESET = 6;
export const MAX_MULTIPLIER = 5;
/** Carving alone raises the multiplier to this at most. */
export const CARVE_MULTIPLIER_CAP = 2;
export const CARVE_POINTS_PER_SECOND = 25;
export const CARVE_MULTIPLIER_TIME = 2.5;
export const GATE_POINTS = 150;
export const GATE_STREAK_BONUS = 50;
export const TOKEN_POINTS = 50;
export const ALL_TOKENS_BONUS = 1000;
export const NEAR_MISS_POINTS = 150;
export const TIME_BONUS_PER_SECOND = 100;
const SPIN_POINTS = [0, 100, 250, 450, 700, 1000, 1400];
const LANDING_FACTOR: Record<LandingQuality, number> = { perfect: 1.25, clean: 1, sloppy: .5 };

export type Medal = 'bronze' | 'silver' | 'gold' | 'westcose';
export const MEDALS: readonly Medal[] = ['bronze', 'silver', 'gold', 'westcose'];
export const MEDAL_LABEL: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', westcose: 'WestCose' };
export type PopupKind = 'trick' | 'bank' | 'lost' | 'gate' | 'miss' | 'token' | 'near' | 'info' | 'multiplier';
export type Popup = { id: number; kind: PopupKind; text: string; points?: number; detail?: string };
export type Trick = { name: string; points: number; spin: number; flips: number; backflips: number; frontflips: number; quality: LandingQuality };

export interface RunStats {
  crashes: number;
  /** Largest spin landed, degrees. */
  maxSpin: number;
  backflips: number;
  frontflips: number;
  perfectLandings: number;
  airtime: number;
  gatesPassed: number;
  gatesMissed: number;
  tokens: number;
  nearMisses: number;
  cleanDrop: boolean;
  bestTrick: { name: string; points: number } | null;
  tricksLanded: number;
}
export interface ScoreState {
  /** Banked points. */
  score: number;
  combo: number;
  comboTricks: string[];
  /** Airs in the open combo. */
  comboAirs: number;
  multiplier: number;
  /** Seconds left in the flow window. */
  flow: number;
  idle: number;
  carveTimer: number;
  carveFraction: number;
  gateStreak: number;
  totals: { tricks: number; carving: number; gates: number; tokens: number; nearMisses: number; timeBonus: number; tokenBonus: number };
  stats: RunStats;
  popups: Popup[];
  nextPopup: number;
}
export interface RunResult {
  runId: SkiRunId;
  score: number;
  time: number;
  par: number;
  medal: Medal;
  challenges: boolean[];
  totals: ScoreState['totals'];
  stats: RunStats;
  tokenTotal: number;
  gateTotal: number;
}

export function createScore(): ScoreState {
  return {
    score: 0, combo: 0, comboTricks: [], comboAirs: 0, multiplier: 1, flow: 0, idle: 0, carveTimer: 0, carveFraction: 0, gateStreak: 0,
    totals: { tricks: 0, carving: 0, gates: 0, tokens: 0, nearMisses: 0, timeBonus: 0, tokenBonus: 0 },
    stats: { crashes: 0, maxSpin: 0, backflips: 0, frontflips: 0, perfectLandings: 0, airtime: 0, gatesPassed: 0, gatesMissed: 0, tokens: 0, nearMisses: 0, cleanDrop: false, bestTrick: null, tricksLanded: 0 },
    popups: [], nextPopup: 1,
  };
}

function popup(state: ScoreState, kind: PopupKind, text: string, points?: number, detail?: string) {
  state.popups.push({ id: state.nextPopup++, kind, text, points, detail });
  if (state.popups.length > 12) state.popups.shift();
}
const addMultiplier = (state: ScoreState, amount: number, cap = MAX_MULTIPLIER) => {
  const before = state.multiplier;
  state.multiplier = Math.max(before, Math.min(cap, before + amount));
  return state.multiplier > before;
};
export const spinPoints = (degrees: number) => {
  const halves = Math.round(degrees / 180);
  return halves < SPIN_POINTS.length ? SPIN_POINTS[halves] : SPIN_POINTS[SPIN_POINTS.length - 1] + 400 * (halves - SPIN_POINTS.length + 1);
};

/** Name and value of a landed air, or null when it was only a bump. */
export function trickFor(air: AirStats, quality: LandingQuality, switchLanding: boolean): Trick | null {
  const halves = Math.round(Math.abs(air.spin) / Math.PI), spin = halves * 180;
  const flips = Math.round(Math.abs(air.flip) / (Math.PI * 2));
  const grabbed = air.grab !== null && air.grabTime >= .15;
  const airtime = Math.max(0, Math.floor((air.time - .4) / .1 + 1e-9)) * 10;
  const base = airtime + spinPoints(spin) + flips * 500 + (grabbed ? 100 + Math.round(150 * Math.min(air.grabTime, 3)) : 0);
  const points = Math.round(base * LANDING_FACTOR[quality] * (switchLanding ? 1.1 : 1));
  if (points <= 0) return null;
  // Regular stance: counter-clockwise from above opens the chest downhill (frontside).
  const frontside = (air.spin > 0) !== air.switchTakeoff;
  const parts: string[] = [];
  if (air.switchTakeoff && (spin > 0 || flips > 0)) parts.push('SW');
  if (spin > 0) parts.push(`${frontside ? 'FS' : 'BS'} ${spin}`);
  if (flips > 0) parts.push(`${flips === 2 ? 'DOUBLE ' : flips > 2 ? 'TRIPLE ' : ''}${air.flip > 0 ? 'FRONTFLIP' : 'BACKFLIP'}`);
  if (grabbed) parts.push(air.grab!.toUpperCase());
  if (spin === 0 && flips === 0 && !grabbed) parts.push(air.time >= 1.2 ? 'BIG AIR' : 'AIR');
  return { name: parts.join(' '), points, spin, flips, backflips: air.flip < 0 ? flips : 0, frontflips: air.flip > 0 ? flips : 0, quality };
}

function bank(state: ScoreState) {
  if (state.combo <= 0) { state.comboTricks = []; state.comboAirs = 0; return; }
  const points = Math.round(state.combo * state.multiplier);
  state.score += points;
  popup(state, 'bank', state.comboTricks.length > 1 ? `${state.comboTricks.length}-HIT COMBO` : 'BANKED', points, `×${formatMultiplier(state.multiplier)}`);
  state.combo = 0; state.comboTricks = []; state.comboAirs = 0;
}
function feed(state: ScoreState, name: string, points: number) {
  state.combo += points; state.comboTricks.push(name);
  state.flow = FLOW_WINDOW; state.idle = 0;
}

/** A HUD message that carries no points. */
export function notify(state: ScoreState, kind: PopupKind, text: string, detail?: string) { popup(state, kind, text, undefined, detail); }

/** Leaving the run (not a crash): the open combo and the multiplier are lost. */
export function loseCombo(state: ScoreState, reason: string) {
  const lost = state.combo;
  state.combo = 0; state.comboTricks = []; state.comboAirs = 0; state.flow = 0;
  state.multiplier = 1; state.gateStreak = 0; state.carveTimer = 0;
  popup(state, 'lost', reason, lost > 0 ? -Math.round(lost) : undefined, lost > 0 ? 'Combo lost' : undefined);
}

export function applyBoardEvent(state: ScoreState, event: BoardEvent) {
  if (event.type === 'crash') {
    const lost = state.combo;
    state.stats.crashes++;
    state.combo = 0; state.comboTricks = []; state.comboAirs = 0; state.flow = 0;
    state.multiplier = 1; state.gateStreak = 0; state.carveTimer = 0;
    popup(state, 'lost', event.reason === 'water' ? 'SPLASH' : event.reason === 'obstacle' ? 'TREE’D' : 'BAIL', lost > 0 ? -Math.round(lost) : undefined, lost > 0 ? 'Combo lost' : undefined);
    return;
  }
  if (event.type !== 'land') return;
  state.stats.airtime += event.air.time;
  if (event.hop) return;
  const trick = trickFor(event.air, event.quality, event.switchStance);
  if (!trick) return;
  const chained = state.flow > 0 && state.comboAirs > 0;
  feed(state, trick.name, trick.points);
  state.comboAirs++;
  state.totals.tricks += trick.points;
  state.stats.tricksLanded++;
  state.stats.maxSpin = Math.max(state.stats.maxSpin, trick.spin);
  state.stats.backflips += trick.backflips; state.stats.frontflips += trick.frontflips;
  if (!state.stats.bestTrick || trick.points > state.stats.bestTrick.points) state.stats.bestTrick = { name: trick.name, points: trick.points };
  const quality = event.quality === 'perfect' ? 'PERFECT' : event.quality === 'sloppy' ? 'SLOPPY' : undefined;
  popup(state, 'trick', trick.name, trick.points, [quality, event.switchStance ? 'SWITCH' : undefined].filter(Boolean).join(' · ') || undefined);
  let raised = chained && addMultiplier(state, 1);
  if (event.quality === 'perfect') { state.stats.perfectLandings++; raised = addMultiplier(state, .5) || raised; }
  if (raised) popup(state, 'multiplier', `×${formatMultiplier(state.multiplier)}`);
  // A sloppy landing ends the chain: bank what was built.
  if (event.quality === 'sloppy') { bank(state); state.flow = 0; }
}

export function applyCourseEvent(state: ScoreState, event: CourseEvent) {
  switch (event.type) {
    case 'gate': {
      if (!event.passed) {
        state.gateStreak = 0; state.stats.gatesMissed++;
        popup(state, 'miss', 'MISSED GATE');
        return;
      }
      state.gateStreak++; state.stats.gatesPassed++;
      const points = GATE_POINTS + GATE_STREAK_BONUS * (state.gateStreak - 1);
      feed(state, 'GATE', points);
      state.totals.gates += points;
      popup(state, 'gate', state.gateStreak > 1 ? `GATE ×${state.gateStreak}` : 'GATE', points);
      if (state.gateStreak % 3 === 0 && addMultiplier(state, 1)) popup(state, 'multiplier', `×${formatMultiplier(state.multiplier)}`, undefined, 'Gate streak');
      return;
    }
    case 'token':
      state.score += TOKEN_POINTS; state.totals.tokens += TOKEN_POINTS; state.stats.tokens = event.count; state.idle = 0;
      popup(state, 'token', `TOKEN ${event.count}/${event.total}`, TOKEN_POINTS);
      return;
    case 'near-miss':
      feed(state, 'NEAR MISS', NEAR_MISS_POINTS);
      state.totals.nearMisses += NEAR_MISS_POINTS; state.stats.nearMisses++;
      popup(state, 'near', 'NEAR MISS', NEAR_MISS_POINTS);
      return;
    case 'checkpoint':
      popup(state, 'info', 'CHECKPOINT');
      return;
    case 'finish':
      return;
  }
}

/** Advance clocks; `carving` is a clean, loaded carve at speed. */
export function tickScore(state: ScoreState, dt: number, carving: boolean) {
  if (carving) {
    state.idle = 0;
    state.carveFraction += CARVE_POINTS_PER_SECOND * dt * state.multiplier;
    const whole = Math.floor(state.carveFraction);
    if (whole > 0) { state.carveFraction -= whole; state.score += whole; state.totals.carving += whole; }
    state.carveTimer += dt;
    if (state.carveTimer >= CARVE_MULTIPLIER_TIME) {
      state.carveTimer = 0;
      if (addMultiplier(state, 1, CARVE_MULTIPLIER_CAP)) popup(state, 'multiplier', `×${formatMultiplier(state.multiplier)}`, undefined, 'Carving');
    }
  } else state.carveTimer = 0;
  if (state.flow > 0) {
    state.flow = Math.max(0, state.flow - dt * (carving ? CARVE_FLOW_RATE : 1));
    if (state.flow === 0) bank(state);
  }
  state.idle += dt;
  if (state.idle >= IDLE_RESET && state.multiplier > 1) { state.multiplier = 1; state.idle = 0; }
}

export type RunRules = {
  medals: Record<Exclude<Medal, 'bronze'>, number>;
  challenges: readonly { label: string; test: (result: Omit<RunResult, 'medal' | 'challenges'>, run: SkiRun) => boolean }[];
};
export const RUN_RULES: Record<SkiRunId, RunRules> = {
  'sunday-cruise': {
    medals: { silver: 2500, gold: 6000, westcose: 10000 },
    challenges: [
      { label: 'Finish under par', test: (r, run) => r.time <= run.par },
      { label: 'Collect 40 tokens', test: r => r.stats.tokens >= 40 },
      { label: 'Land a 360', test: r => r.stats.maxSpin >= 360 },
    ],
  },
  'lighthouse-line': {
    medals: { silver: 3500, gold: 8000, westcose: 14000 },
    challenges: [
      { label: 'Clear all 11 gates', test: (r, run) => r.stats.gatesPassed >= run.gates.length },
      { label: 'Land a 540', test: r => r.stats.maxSpin >= 540 },
      { label: 'Score 8,000', test: r => r.score >= 8000 },
    ],
  },
  'timber-chute': {
    medals: { silver: 4000, gold: 9000, westcose: 16000 },
    challenges: [
      { label: 'Ride it without a crash', test: r => r.stats.crashes === 0 },
      { label: 'Land a backflip', test: r => r.stats.backflips >= 1 },
      { label: 'Score 9,000', test: r => r.score >= 9000 },
    ],
  },
  'dead-coast-couloir': {
    medals: { silver: 4500, gold: 10000, westcose: 18000 },
    challenges: [
      { label: 'Finish under par', test: (r, run) => r.time <= run.par },
      { label: 'Stick the cliff drop', test: r => r.stats.cleanDrop },
      { label: 'Score 10,000', test: r => r.score >= 10000 },
    ],
  },
};

export function medalFor(runId: SkiRunId, score: number): Medal {
  const { medals } = RUN_RULES[runId];
  return score >= medals.westcose ? 'westcose' : score >= medals.gold ? 'gold' : score >= medals.silver ? 'silver' : 'bronze';
}

/** The tallest drop on a run, if any: landing it clean is a challenge. */
export function signatureDrop(run: SkiRun) {
  let drop: Extract<SkiRun['features'][number], { kind: 'drop' }> | undefined;
  for (const feature of run.features) if (feature.kind === 'drop' && (!drop || feature.height > drop.height)) drop = feature;
  return drop;
}
/** Record a clean landing of an air that left from the run's signature drop. */
export function noteLanding(state: ScoreState, run: SkiRun, launchS: number, quality: LandingQuality) {
  const drop = signatureDrop(run);
  if (drop && quality !== 'sloppy' && launchS >= drop.s - drop.approach && launchS <= drop.s + drop.face + 1.5) state.stats.cleanDrop = true;
}

/** Bank everything at the line and add the finish bonuses. */
export function finishScore(state: ScoreState, run: SkiRun, time: number, tokenTotal: number): RunResult {
  bank(state);
  state.flow = 0;
  const timeBonus = Math.max(0, Math.round((run.par - time) * TIME_BONUS_PER_SECOND));
  const tokenBonus = tokenTotal > 0 && state.stats.tokens >= tokenTotal ? ALL_TOKENS_BONUS : 0;
  state.score += timeBonus + tokenBonus;
  state.totals.timeBonus = timeBonus; state.totals.tokenBonus = tokenBonus;
  if (timeBonus > 0) popup(state, 'bank', 'TIME BONUS', timeBonus);
  if (tokenBonus > 0) popup(state, 'bank', 'ALL TOKENS', tokenBonus);
  const partial = { runId: run.id, score: state.score, time, par: run.par, totals: { ...state.totals }, stats: { ...state.stats }, tokenTotal, gateTotal: run.gates.length };
  return { ...partial, medal: medalFor(run.id, state.score), challenges: RUN_RULES[run.id].challenges.map(challenge => challenge.test(partial, run)) };
}

export const formatMultiplier = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
export const formatPoints = (value: number) => Math.round(value).toLocaleString('en-US');
export function formatTime(seconds: number) {
  const tenths = Math.round(Math.max(0, seconds) * 10), minutes = Math.floor(tenths / 600), rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}
