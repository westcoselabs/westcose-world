/** The fight: a tension tug-of-war against a fish with a telegraphed move deck. Pure and
 * deterministic for a given rng; the controller and the Node checks step it at FISHING.step. */
import { between, pick, weighted, type Rng } from './rng';
import { TIERS, type MoveKind, type Species } from './species';
import { FISHING as T } from './tuning';

/** What the Tackle Box changes about a fight. */
export interface Gear { snapAt: number; reelSpeed: number; drain: number }
export const BASE_GEAR: Readonly<Gear> = { snapAt: 1, reelSpeed: T.fight.reelSpeed, drain: 1 };

export interface FightInput { reel: boolean; steer: number; bow: boolean }
export const IDLE_FIGHT: Readonly<FightInput> = { reel: false, steer: 0, bow: false };

export type FightEvent =
  /** The coming move is telegraphed; `dir` is the side it shows, which an orca may fake. */
  | { type: 'tell'; move: MoveKind; dir: number }
  | { type: 'move'; move: MoveKind; dir: number }
  | { type: 'heckle'; line: string }
  | { type: 'ink' }
  | { type: 'jump' }
  | { type: 'bowed'; perfect: boolean }
  | { type: 'whiff' }
  | { type: 'splash'; missed: boolean }
  | { type: 'creak' }
  | { type: 'snap'; spooled: boolean }
  | { type: 'spit' }
  | { type: 'landed' };
export type FightOutcome = 'fighting' | 'landed' | 'snapped' | 'spat';

export interface FightTell { move: MoveKind; shown: number; dir: number; time: number; duration: number }
export interface FightState {
  species: Species;
  tier: number;
  gear: Gear;
  /** Metres of line out beyond the rail; landed near zero. */
  distance: number;
  tension: number;
  stamina: number;
  /** Seconds over the snap limit, and seconds slack. */
  over: number; slack: number;
  elapsed: number;
  /** The move under way: its direction (-1 left, 1 right), time so far and planned length. */
  move: MoveKind; dir: number; time: number; duration: number;
  /** The coming move while it is telegraphed. The fish idles through a tell. */
  tell: FightTell | null;
  /** Jump airtime so far, and whether this jump has been bowed to or the bow was wasted. */
  air: number; bowed: boolean; bowUsed: boolean;
  /** Seconds of ink left over the gauge; the sun's line heat. */
  ink: number; heat: number;
  /** For rendering: across the fan (-1..1) and depth (0 surface, 1 deep, negative in the air). */
  lateral: number; depth: number;
  /** The direction the fish is pulling right now (rolls alternate). */
  pullDir: number;
  tellScale: number;
  creakCooldown: number;
  outcome: FightOutcome;
  stats: { bows: number; perfectBows: number; missedBows: number; creaks: number };
}

const DURATION: Record<MoveKind, readonly [number, number]> = {
  rest: [.8, 1.8], run: [.9, 1.8], bolt: [.7, 1.3], dive: [.8, 1.5], jump: [.9, .9], playDead: [1.4, 2.6], roll: [1.2, 2], taunt: [1.2, 1.8],
};
/** Swim speed away from the pier, m/s at full stamina before the tier's speed. */
const SWIM: Record<MoveKind, number> = { rest: .1, run: 2.4, bolt: .6, dive: 1.2, jump: .4, playDead: 0, roll: .4, taunt: 0 };
const AIRTIME = .9, ROLL_FLIP = .32, JK_TELL = .25, LEAP_TELL = .3;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

export function createFight(species: Species, distance: number, gear: Gear = BASE_GEAR, options: { perfect?: boolean; tellScale?: number } = {}): FightState {
  return {
    species, tier: species.tier, gear, distance, tension: .25, stamina: options.perfect ? T.fight.perfectStamina : 1,
    over: 0, slack: 0, elapsed: 0,
    // A short settling rest, then the first telegraphed move.
    move: 'rest', dir: 0, time: 0, duration: .6, tell: null,
    air: 0, bowed: false, bowUsed: false, ink: 0, heat: 0, lateral: 0, depth: .3, pullDir: 0,
    tellScale: options.tellScale ?? 1, creakCooldown: 0, outcome: 'fighting',
    stats: { bows: 0, perfectBows: 0, missedBows: 0, creaks: 0 },
  };
}

/** Swap in a bigger fish mid-fight: it swallows the hooked one and takes the line. */
export function ambushFight(f: FightState, predator: Species) {
  f.species = predator; f.tier = predator.tier;
  f.stamina = 1; f.distance += 3; f.tension += .3;
  f.tell = null; f.move = 'run'; f.dir = 0; f.time = 0; f.duration = 1.2; f.air = 0;
}

function telegraph(f: FightState, rng: Rng, events: FightEvent[], forced?: { move: MoveKind; tell: number }) {
  const tier = TIERS[f.tier];
  const move = forced?.move ?? weighted(rng, f.species.deck ?? tier.deck);
  const dir = move === 'bolt' || move === 'roll' ? (rng() < .5 ? -1 : 1) : 0;
  // A plain rest needs no warning.
  if (move === 'rest') { begin(f, move, dir, rng, events); return; }
  const shown = f.species.gimmick === 'fakeTell' && move === 'bolt' && rng() < .3 ? -dir : dir;
  const duration = (forced?.tell ?? tier.tell) * f.tellScale;
  f.tell = { move, shown, dir, time: 0, duration };
  f.move = 'rest'; f.dir = 0; f.time = 0; f.duration = duration;
  events.push({ type: 'tell', move, dir: shown });
}

function begin(f: FightState, move: MoveKind, dir: number, rng: Rng, events: FightEvent[]) {
  f.tell = null; f.move = move; f.dir = dir; f.time = 0;
  const [low, high] = DURATION[move];
  f.duration = between(rng, low, high);
  if (move === 'jump') { f.air = 0; f.bowed = false; f.bowUsed = false; f.duration = AIRTIME; events.push({ type: 'jump' }); }
  if (move === 'taunt' || (move === 'rest' && rng() < .2)) events.push({ type: 'heckle', line: pick(rng, f.species.lines.heckles) });
  if (move === 'dive' && f.species.gimmick === 'ink' && rng() < .5) { f.ink = 1.5; events.push({ type: 'ink' }); }
  events.push({ type: 'move', move, dir });
}

/** One fixed step of the fight. Events are appended; `outcome` leaves 'fighting' at the end. */
export function stepFight(f: FightState, input: FightInput, dt: number, rng: Rng, events: FightEvent[]) {
  if (f.outcome !== 'fighting') return;
  const tier = TIERS[f.tier], F = T.fight, gimmick = f.species.gimmick;
  f.elapsed += dt; f.time += dt;
  f.ink = Math.max(0, f.ink - dt);
  f.creakCooldown = Math.max(0, f.creakCooldown - dt);

  // Moves and tells. A played-dead fish always comes back with a bolt; leapers often jump twice.
  if (f.tell) {
    f.tell.time += dt;
    if (f.tell.time >= f.tell.duration) begin(f, f.tell.move, f.tell.dir, rng, events);
  } else if (f.time >= f.duration) {
    if (f.move === 'jump') splashdown(f, input, events);
    // Hooked fish from tier 2 up open with a run, like real ones do.
    if (f.elapsed <= f.duration + dt && f.tier >= 2) telegraph(f, rng, events, { move: 'run', tell: TIERS[f.tier].tell });
    else if (f.move === 'playDead') telegraph(f, rng, events, { move: 'bolt', tell: JK_TELL });
    else if (f.move === 'jump' && gimmick === 'leaper' && rng() < .4) telegraph(f, rng, events, { move: 'jump', tell: LEAP_TELL });
    else telegraph(f, rng, events);
  }

  const move = f.move;
  f.pullDir = move === 'roll' ? (Math.floor(f.time / ROLL_FLIP) % 2 ? -f.dir : f.dir) : f.dir;
  const strength = tier.force * (.5 + .5 * f.stamina);
  let axial = 0, lateral = 0;
  if (move === 'rest') axial = .15 * strength;
  else if (move === 'run') axial = .85 * strength;
  else if (move === 'dive') axial = (gimmick === 'heavy' ? 1.6 : 1) * strength;
  else if (move === 'playDead') axial = .02 * strength;
  else if (move === 'bolt') lateral = .75 * strength;
  else if (move === 'roll') lateral = .6 * strength;

  // Steering against a bolt soaks its pull; steering with it doubles down.
  const against = lateral > 0 ? -f.pullDir * clamp(input.steer, -1, 1) : 0;
  const steerFactor = 1 - F.steerSoak * Math.max(0, against) + F.steerWrong * Math.max(0, -against);
  const reel = input.reel && move !== 'jump';
  const reelLoad = reel ? F.reelDrag + F.reelAgainst * axial + F.reelLateral * lateral * steerFactor : 0;
  if (gimmick === 'glare') f.heat = clamp(f.heat + (input.reel ? .07 : -.08) * dt, 0, .4);
  const target = axial + lateral * steerFactor + reelLoad + f.heat;
  f.tension += (target - f.tension) * (1 - Math.exp(-dt / F.tensionLag));

  // Bow to a jump near its apex. The first press counts; mashing wastes it.
  if (move === 'jump') {
    f.air += dt;
    if (input.bow && !f.bowUsed) {
      f.bowUsed = true;
      const off = Math.abs(f.air - AIRTIME / 2);
      if (off <= tier.bow) {
        const perfect = off <= .08;
        f.bowed = true; f.stats.bows++; if (perfect) f.stats.perfectBows++;
        f.stamina -= perfect ? .12 : .08;
        events.push({ type: 'bowed', perfect });
      } else events.push({ type: 'whiff' });
    }
  }

  // Line in and out: reeling wins it back, runs take it, and reeling against a run gains little.
  const swim = SWIM[move] * (move === 'dive' && gimmick === 'heavy' ? .6 : 1) * tier.speed * (.35 + .65 * f.stamina);
  const reelIn = reel ? f.gear.reelSpeed * (move === 'taunt' ? 1.3 : 1) * (1 - .6 * Math.min(1, axial / tier.force)) : 0;
  f.distance += (swim * (reel ? .35 : 1) - reelIn) * dt;

  // Working the line in the green band tires the fish; a slack, resting fish gets its wind back.
  const ratio = f.tension / f.gear.snapAt;
  const working = ratio >= F.green[0] && ratio <= F.green[1];
  let drain = tier.drain * f.gear.drain * (working ? 1 : .35);
  if (lateral > 0 && against > .3) drain *= 1.6;
  f.stamina -= drain * dt;
  if (ratio < F.regenTension && !input.reel) f.stamina += .04 * dt;
  f.stamina = clamp(f.stamina, 0, 1);

  // Where the fish is, for the scene.
  f.lateral = clamp(f.lateral + (lateral > 0 ? f.pullDir * .9 * tier.speed : -f.lateral * .5) * dt, -1, 1);
  const depthTarget = move === 'jump' ? -Math.sin(Math.PI * Math.min(1, f.air / AIRTIME)) : move === 'dive' ? 1 : move === 'taunt' ? -.05 : .3;
  f.depth += (depthTarget - f.depth) * (move === 'jump' ? 1 : 1 - Math.exp(-4 * dt));

  // Snap, spool, spit or land.
  if (ratio >= .86 && f.creakCooldown <= 0) { f.creakCooldown = .5; f.stats.creaks++; events.push({ type: 'creak' }); }
  if (f.tension >= f.gear.snapAt) f.over += dt; else f.over = 0;
  if (f.over >= tier.snap || f.tension >= f.gear.snapAt * F.hardSnap) { f.outcome = 'snapped'; events.push({ type: 'snap', spooled: false }); return; }
  if (f.distance > F.maxLine) { f.outcome = 'snapped'; events.push({ type: 'snap', spooled: true }); return; }
  if (move !== 'jump' && f.elapsed > F.slackGrace && f.tension < F.slackLimit) f.slack += dt; else f.slack = 0;
  if (f.slack >= F.slackTime) { f.outcome = 'spat'; events.push({ type: 'spit' }); return; }
  if (f.distance <= F.landed) { f.distance = 0; f.outcome = 'landed'; events.push({ type: 'landed' }); }
}

function splashdown(f: FightState, input: FightInput, events: FightEvent[]) {
  if (f.bowed) { events.push({ type: 'splash', missed: false }); return; }
  f.stats.missedBows++;
  f.tension += TIERS[f.tier].splash * (input.reel ? T.fight.reelSplash : 1);
  events.push({ type: 'splash', missed: true });
}
