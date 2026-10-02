/** Players made of rules, for the difficulty checks and the development `autoFight`. A skilled
 * bot acts on what it saw `reaction` seconds ago and decides at 30 fps, like a person at a
 * slow frame rate; the masher and the AFK bot show that skill matters. */
import { IDLE_FIGHT, type FightInput, type FightState } from './fight';
import { between, type Rng } from './rng';
import type { MoveKind } from './species';
import { canBait, IDLE_TIDE, type Catch, type TideInput, type TideState } from './tide';

export type BotKind = 'expert' | 'casual' | 'masher' | 'afk';
export interface BotProfile {
  /** Seconds between something happening and the bot acting on it, give or take `jitter` per move. */
  reaction: number; jitter: number;
  /** Chance of reading a bolt's side wrong. */
  misread: number;
  /** Spread of the bow press around a jump's apex, in seconds. */
  bowError: number;
  /** Stops reeling above this share of the snap limit; reels when slack below `slack`. */
  release: number; slack: number;
  /** Reads tells and lets go before a run starts, rather than once it has, except for the
   * share of moves where its attention lapses. */
  anticipate: boolean; lapse: number;
}
export const BOT_PROFILES: Record<'expert' | 'casual', BotProfile> = {
  expert: { reaction: .12, jitter: .03, misread: 0, bowError: .04, release: .8, slack: .12, anticipate: true, lapse: 0 },
  casual: { reaction: .35, jitter: .12, misread: .15, bowError: .15, release: .92, slack: .1, anticipate: true, lapse: .3 },
};
const DECIDE = 1 / 30;
const DANGER: readonly MoveKind[] = ['run', 'dive', 'jump'];

interface Seen { time: number; move: MoveKind; pullDir: number; tellMove: MoveKind | null; tellShown: number; tellLeft: number; tension: number; jumpAt: number }
export interface FightBot { input(f: FightState, dt: number): FightInput }

export function fightBot(kind: BotKind, rng: Rng): FightBot {
  if (kind === 'afk') return { input: () => IDLE_FIGHT };
  if (kind === 'masher') return { input: () => ({ reel: true, steer: 0, bow: false }) };
  const profile = BOT_PROFILES[kind];
  const history: Seen[] = [];
  let clock = 0, since = DECIDE, held: FightInput = { ...IDLE_FIGHT }, bowAt: number | null = null, bowJump = -1;
  let misread = { move: -1, dir: 0 }, moves = 0, lastMoveTime = Infinity, jumpAt = -1, delay = profile.reaction, reading = true;
  return {
    input(f, dt) {
      clock += dt; since += dt;
      // Count each new move so a misread and a planned bow belong to one move only.
      if (f.time < lastMoveTime) {
        moves++; delay = profile.reaction + between(rng, -profile.jitter, profile.jitter); reading = rng() >= profile.lapse;
        if (f.move === 'jump') jumpAt = clock - f.time;
      }
      lastMoveTime = f.time;
      history.push({ time: clock, move: f.move, pullDir: f.pullDir, tellMove: f.tell?.move ?? null, tellShown: f.tell?.shown ?? 0, tellLeft: f.tell ? f.tell.duration - f.tell.time : 0, tension: f.tension / f.gear.snapAt, jumpAt });
      while (history.length > 2 && history[1].time <= clock - delay) history.shift();
      if (since < DECIDE - 1e-9) return { ...held, bow: false };
      since = 0;
      const seen = history[0];
      // Plan a bow at the apex once the jump has been noticed.
      if (seen.move === 'jump' && seen.jumpAt !== bowJump) { bowJump = seen.jumpAt; bowAt = seen.jumpAt + .45 + between(rng, -profile.bowError, profile.bowError); }
      const bow = bowAt !== null && clock >= bowAt;
      if (bow) bowAt = null;
      let reel: boolean, steer = 0;
      const lateral = seen.move === 'bolt' || seen.move === 'roll';
      if (DANGER.includes(seen.move)) reel = false;
      else if (profile.anticipate && reading && seen.tellMove && DANGER.includes(seen.tellMove) && seen.tellLeft < .2 + profile.reaction) reel = false;
      else reel = seen.tension < (lateral ? .55 : profile.release);
      if (seen.tension < profile.slack) reel = true;
      if (seen.tension > profile.release + .06) reel = false;
      if (lateral) {
        if (misread.move !== moves) misread = { move: moves, dir: rng() < profile.misread ? -1 : 1 };
        steer = -seen.pullDir * misread.dir;
      } else if (profile.anticipate && reading && seen.tellMove === 'bolt') steer = -seen.tellShown;
      held = { reel, steer, bow: false };
      return { reel, steer, bow };
    },
  };
}

/** Which catches to bait: up to a tier, then keep. */
export type BaitPolicy = (c: Catch) => 'keep' | 'bait';
export const baitUpTo = (tier: number): BaitPolicy => c => canBait(c) && c.tier < tier ? 'bait' : 'keep';

/** A whole-tide bot: casts for a bullseye, strikes on the CHOMP, fights, and keeps or baits. */
export function tideBot(kind: BotKind, rng: Rng, policy: BaitPolicy = baitUpTo(0)) {
  const reaction = kind === 'expert' ? .12 : kind === 'casual' ? .35 : .5;
  let fightRef: FightState | null = null, current = fightBot(kind, rng);
  return {
    input(t: TideState, dt: number): TideInput {
      if (t.phase === 'ready') return { ...IDLE_TIDE, primary: true, primaryPressed: true };
      if (t.phase === 'charging') return { ...IDLE_TIDE, primary: t.charge < (kind === 'expert' ? .86 : .7) };
      if (t.phase === 'bite') return t.time >= reaction ? { ...IDLE_TIDE, primary: true, primaryPressed: true } : IDLE_TIDE;
      if (t.phase === 'fight' && t.fight) {
        if (t.fight !== fightRef) { fightRef = t.fight; current = fightBot(kind, rng); }
        const f = current.input(t.fight, dt);
        return { ...IDLE_TIDE, primary: f.reel, steer: f.steer, bowPressed: f.bow };
      }
      if (t.phase === 'catch' && t.catch && t.time >= .6) return policy(t.catch) === 'bait' ? { ...IDLE_TIDE, baitPressed: true } : { ...IDLE_TIDE, keepPressed: true };
      return IDLE_TIDE;
    },
  };
}
