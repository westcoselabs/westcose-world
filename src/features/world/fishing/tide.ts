/** One tide of Pier Pressure: cast, wait, nibble, bite, fight, then keep the catch or bait it for
 * something bigger, until the worms and the live bait run out. Pure and deterministic for a seed
 * and an input sequence; the controller steps it at FISHING.step. */
import { ambushFight, createFight, stepFight, type FightEvent, type FightState, type Gear } from './fight';
import { between, createRng, pick, weighted, type Rng } from './rng';
import { BOTTLE_NOTES, JUNK_WEIGHTS, OVERCAST_GAGS, speciesById, speciesOfTier, tideHeadline, TIERS, TOP_TIER, VARIANTS, type Species, type VariantId } from './species';
import { gearFor, luckFor, perfectFor, wormsFor, type Upgrades } from './tackle';
import { FISHING as T } from './tuning';

export type TidePhase = 'ready' | 'charging' | 'gag' | 'casting' | 'waiting' | 'nibble' | 'bite' | 'fight' | 'catch' | 'recover' | 'over';
export type Zone = 'pilings' | 'mid' | 'channel';

/** `primary` is held (cast charge, reel); the `*Pressed` fields are fresh presses this step. */
export interface TideInput { primary: boolean; primaryPressed: boolean; steer: number; bowPressed: boolean; keepPressed: boolean; baitPressed: boolean }
export const IDLE_TIDE: Readonly<TideInput> = { primary: false, primaryPressed: false, steer: 0, bowPressed: false, keepPressed: false, baitPressed: false };

export interface Catch {
  id: number; species: string; tier: number; variant: VariantId;
  /** Pounds. */
  weight: number;
  clams: number; perfect: boolean; daily: boolean; junk: boolean;
  /** A message in a bottle's note. */
  note: string | null;
  /** How many fish up its chain this one was landed. */
  chain: number;
}
export interface DailyCatch { species: string; variant: VariantId }
export interface TideOptions { seed: number; upgrades: Upgrades; tutorial?: boolean; daily?: DailyCatch | null }

export interface TideStats {
  casts: number; bites: number; hooked: number; landed: number; kept: number; baited: number; tossed: number;
  snaps: number; spits: number; spooked: number; stolen: number; gary: number; perfects: number; bullseyes: number;
  bows: number; perfectBows: number; missedBows: number; ambushes: number; gags: number; junk: number;
}
export interface TideResult {
  seed: number; clams: number; cooler: Catch[]; landed: Catch[];
  bestTier: number; bestSpecies: string | null; bestChain: number; biggest: Catch | null;
  stats: TideStats; headline: string; sunCaught: boolean; dailyCaught: boolean; time: number;
}

export type TideEvent =
  | { type: 'charge' }
  | { type: 'cast'; distance: number; aim: number; bullseye: boolean; zone: Zone; live: boolean }
  | { type: 'gag'; line: string }
  | { type: 'splashdown' }
  | { type: 'approach'; tier: number }
  | { type: 'nibble' }
  | { type: 'chomp'; tier: number }
  | { type: 'reeled' }
  | { type: 'spooked' }
  | { type: 'stolen'; live: boolean }
  | { type: 'hooked'; perfect: boolean; species: string }
  | { type: 'fight'; event: FightEvent }
  | { type: 'ambush'; species: string; swallowed: string }
  | { type: 'landed'; catch: Catch }
  | { type: 'lost'; how: 'snap' | 'spool' | 'spit'; species: string; distance: number }
  | { type: 'kept'; catch: Catch }
  | { type: 'baited'; catch: Catch; line: string }
  | { type: 'tossed'; catch: Catch }
  | { type: 'gary'; catch: Catch; flock: boolean }
  | { type: 'over'; result: TideResult };

export interface Pending { species: Species; nibbles: number; next: number; tellScale: number; windowScale: number; variant: VariantId | null }

export interface TideState {
  options: TideOptions; rng: Rng; gear: Gear; luck: number; perfectWindow: number;
  phase: TidePhase;
  /** Seconds in the current phase, and since the tide began. */
  time: number; clock: number;
  worms: number;
  /** The landed fish on the hook as live bait, if the last catch was baited. */
  live: Catch | null;
  chain: number; bestChain: number;
  aim: number; charge: number; distance: number; zone: Zone; bullseye: boolean;
  wait: number; pending: Pending | null;
  fight: FightState | null; perfect: boolean; ambushAt: number | null;
  /** The catch on the card, and Gary's seconds left (Infinity when he won't come). */
  catch: Catch | null; gary: number;
  cooler: Catch[]; landed: Catch[];
  stats: TideStats;
  tutorialBite: boolean; firstCatch: boolean; dailyCaught: boolean;
  /** Development and tests: the next bite. */
  forced: { species: string; variant: VariantId | null } | null;
  result: TideResult | null;
  nextId: number;
  fightEvents: FightEvent[];
}

const emptyStats = (): TideStats => ({
  casts: 0, bites: 0, hooked: 0, landed: 0, kept: 0, baited: 0, tossed: 0, snaps: 0, spits: 0, spooked: 0, stolen: 0, gary: 0,
  perfects: 0, bullseyes: 0, bows: 0, perfectBows: 0, missedBows: 0, ambushes: 0, gags: 0, junk: 0,
});

export function createTide(options: TideOptions): TideState {
  const u = options.upgrades;
  return {
    options, rng: createRng(options.seed), gear: gearFor(u), luck: luckFor(u), perfectWindow: perfectFor(u),
    phase: 'ready', time: 0, clock: 0, worms: wormsFor(u), live: null, chain: 0, bestChain: 0,
    aim: 0, charge: 0, distance: 0, zone: 'mid', bullseye: false, wait: 0, pending: null,
    fight: null, perfect: false, ambushAt: null, catch: null, gary: Infinity, cooler: [], landed: [], stats: emptyStats(),
    tutorialBite: !!options.tutorial, firstCatch: !!options.tutorial, dailyCaught: false, forced: null, result: null, nextId: 1, fightEvents: [],
  };
}

/** A catch can be live bait unless it is junk or already at the top of the chain. */
export const canBait = (c: Catch) => !c.junk && c.tier < TOP_TIER;
/** Seconds the bite window stays open for the pending fish. */
export const biteWindow = (p: Pending) => (T.bite.window - T.bite.windowPerTier * Math.max(0, p.species.tier)) * p.windowScale;

function enter(t: TideState, phase: TidePhase) { t.phase = phase; t.time = 0; }

/** One fixed step of the tide. */
export function stepTide(t: TideState, input: TideInput, dt: number, events: TideEvent[]) {
  if (t.phase === 'over') return;
  t.clock += dt; t.time += dt;
  const C = T.cast, B = T.bite;
  switch (t.phase) {
    case 'ready':
      aim(t, input, dt);
      if (t.worms <= 0 && !t.live) { finish(t, events); return; }
      if (input.primaryPressed) { enter(t, 'charging'); t.charge = 0; events.push({ type: 'charge' }); }
      break;
    case 'charging':
      aim(t, input, dt);
      t.charge = Math.min(1, t.time / C.chargeTime);
      if (t.time >= C.chargeTime + C.overcharge) { t.stats.gags++; enter(t, 'gag'); events.push({ type: 'gag', line: pick(t.rng, OVERCAST_GAGS) }); }
      else if (!input.primary) cast(t, events);
      break;
    case 'gag': if (t.time >= C.gag) enter(t, 'ready'); break;
    case 'casting': if (t.time >= C.flight) splashdown(t, events); break;
    case 'waiting':
      // Reeling in before anything has nibbled keeps the bait on the hook.
      if (input.primaryPressed) { refund(t); enter(t, 'recover'); events.push({ type: 'reeled' }); }
      else if (t.time >= t.wait) { enter(t, 'nibble'); t.pending!.next = between(t.rng, B.nibbleGap[0], B.nibbleGap[1]); }
      break;
    case 'nibble': {
      const p = t.pending!;
      if (input.primaryPressed) { t.stats.spooked++; refund(t); enter(t, 'recover'); events.push({ type: 'spooked' }); break; }
      if (t.time < p.next) break;
      if (p.nibbles > 0) { p.nibbles--; p.next = t.time + between(t.rng, B.nibbleGap[0], B.nibbleGap[1]); events.push({ type: 'nibble' }); }
      else { t.stats.bites++; enter(t, 'bite'); events.push({ type: 'chomp', tier: p.species.tier }); }
      break;
    }
    case 'bite':
      if (input.primaryPressed) hook(t, t.time <= t.perfectWindow, events);
      else if (t.time > biteWindow(t.pending!)) {
        const live = !!t.live;
        t.stats.stolen++; t.live = null; t.chain = 0; t.pending = null;
        enter(t, 'recover'); events.push({ type: 'stolen', live });
      }
      break;
    case 'fight': fight(t, input, dt, events); break;
    case 'catch': decide(t, input, dt, events); break;
    case 'recover': if (t.time >= B.recover) enter(t, 'ready'); break;
  }
}

function aim(t: TideState, input: TideInput, dt: number) {
  t.aim = Math.max(-T.cast.aim, Math.min(T.cast.aim, t.aim + input.steer * T.cast.aimRate * dt));
}

function cast(t: TideState, events: TideEvent[]) {
  const C = T.cast, c = t.charge;
  t.distance = C.minDistance + (C.maxDistance - C.minDistance) * c ** .9;
  t.bullseye = c >= C.bullseye[0] && c <= C.bullseye[1];
  t.zone = t.distance < C.pilings ? 'pilings' : t.distance > C.channel ? 'channel' : 'mid';
  if (!t.live) t.worms--;
  t.stats.casts++; if (t.bullseye) t.stats.bullseyes++;
  enter(t, 'casting');
  events.push({ type: 'cast', distance: t.distance, aim: t.aim, bullseye: t.bullseye, zone: t.zone, live: !!t.live });
}

/** An early strike or reel-in leaves the bait on: a plain cast gets its worm back. */
function refund(t: TideState) { if (!t.live) t.worms++; t.pending = null; }

function splashdown(t: TideState, events: TideEvent[]) {
  const W = T.wait, forced = t.forced !== null;
  const pending = chooseBiter(t);
  t.pending = pending;
  t.wait = forced ? .3 : between(t.rng, W.min, W.max) * (t.zone === 'pilings' ? W.pilings : t.zone === 'channel' ? W.channel : 1) * (t.live ? 1.15 : 1);
  enter(t, 'waiting');
  events.push({ type: 'splashdown' }, { type: 'approach', tier: pending.species.tier });
}

function pickSpecies(t: TideState, tier: number): Species {
  const daily = t.options.daily && !t.dailyCaught ? t.options.daily.species : null;
  return speciesById(weighted(t.rng, Object.fromEntries(speciesOfTier(tier).map(s => [s.id, s.id === daily ? 2 : 1]))));
}

function chooseBiter(t: TideState): Pending {
  const rng = t.rng, base = { next: 0, tellScale: 1, windowScale: 1, variant: null };
  const nibbles = () => Math.floor(rng() * (T.bite.nibbles + 1));
  const tutorial = t.tutorialBite && !t.live;
  // Whatever bites first uses up the tutorial's easy sardine.
  t.tutorialBite = false;
  if (t.forced) {
    const forced = t.forced; t.forced = null;
    return { ...base, species: speciesById(forced.species), nibbles: 0, variant: forced.variant };
  }
  if (tutorial) {
    t.tutorialBite = false;
    return { ...base, species: speciesById('sardine'), nibbles: 1, tellScale: T.tutorialTell, windowScale: T.tutorialWindow };
  }
  if (t.live) {
    // Live bait draws the next tier up, now and then two; only a tier-6 catch can draw the Sun.
    const k = t.live.tier, skip = k + 2 < TOP_TIER && rng() < T.skip;
    return { ...base, species: pickSpecies(t, skip ? k + 2 : k + 1), nibbles: nibbles() };
  }
  if (rng() < T.junk[t.zone]) return { ...base, species: speciesById(weighted(rng, JUNK_WEIGHTS)), nibbles: nibbles() };
  const lunch = t.zone === 'channel' ? .1 : t.zone === 'mid' ? .04 : 0;
  return { ...base, species: pickSpecies(t, rng() < lunch ? 1 : 0), nibbles: nibbles() };
}

function hook(t: TideState, perfect: boolean, events: TideEvent[]) {
  const p = t.pending!;
  t.stats.hooked++; if (perfect) t.stats.perfects++;
  events.push({ type: 'hooked', perfect, species: p.species.id });
  // Junk doesn't fight; it just comes up.
  if (p.species.tier < 0) { land(t, p.species, false, events); return; }
  t.perfect = perfect;
  t.fight = createFight(p.species, t.distance, t.gear, { perfect, tellScale: p.tellScale });
  t.ambushAt = !t.firstCatch && p.species.tier < TOP_TIER - 1 && t.rng() < T.ambush ? between(t.rng, 2, 6) : null;
  enter(t, 'fight');
}

function fight(t: TideState, input: TideInput, dt: number, events: TideEvent[]) {
  const f = t.fight!, fightEvents = t.fightEvents;
  fightEvents.length = 0;
  stepFight(f, { reel: input.primary, steer: input.steer, bow: input.bowPressed }, dt, t.rng, fightEvents);
  for (const event of fightEvents) events.push({ type: 'fight', event });
  // SOMETHING BIGGER ATE IT: a next-tier predator takes the line.
  if (t.ambushAt !== null && f.outcome === 'fighting' && f.elapsed >= t.ambushAt) {
    t.ambushAt = null; t.stats.ambushes++;
    const swallowed = f.species.id, predator = pickSpecies(t, f.tier + 1);
    ambushFight(f, predator);
    events.push({ type: 'ambush', species: predator.id, swallowed });
  }
  if (f.outcome === 'fighting') return;
  t.stats.bows += f.stats.bows; t.stats.perfectBows += f.stats.perfectBows; t.stats.missedBows += f.stats.missedBows;
  if (f.outcome === 'landed') { land(t, f.species, t.perfect, events); return; }
  const spooled = fightEvents.some(e => e.type === 'snap' && e.spooled);
  if (f.outcome === 'snapped') t.stats.snaps++; else t.stats.spits++;
  events.push({ type: 'lost', how: f.outcome === 'spat' ? 'spit' : spooled ? 'spool' : 'snap', species: f.species.id, distance: f.distance });
  t.live = null; t.chain = 0; t.fight = null; t.pending = null;
  enter(t, 'recover');
}

function rollVariant(t: TideState, perfect: boolean): VariantId {
  const odds = (perfect ? 1.5 : 1) * (t.bullseye ? 1.25 : 1) * (t.zone === 'channel' ? 1.5 : 1) * t.luck;
  const order = ['golden', 'drip', 'fancy', 'shiny', 'chonky'] as const;
  const total = order.reduce((sum, id) => sum + VARIANTS[id].chance * odds, 0), scale = Math.min(1, .6 / total);
  let roll = t.rng();
  for (const id of order) { roll -= VARIANTS[id].chance * odds * scale; if (roll < 0) return id; }
  return 'normal';
}

function makeCatch(t: TideState, species: Species, perfect: boolean): Catch {
  const rng = t.rng, id = t.nextId++, [low, high] = species.weight;
  if (species.tier < 0) return {
    id, species: species.id, tier: -1, variant: 'normal', weight: between(rng, low, high), clams: species.clams ?? 0,
    perfect: false, daily: false, junk: true, note: species.id === 'bottle' ? pick(rng, BOTTLE_NOTES) : null, chain: 0,
  };
  const size = rng() ** 1.6;
  const variant = t.pending?.variant ?? rollVariant(t, perfect);
  const daily = !!t.options.daily && !t.dailyCaught && t.options.daily.species === species.id && t.options.daily.variant === variant;
  if (daily) t.dailyCaught = true;
  const clams = Math.round(TIERS[species.tier].clams * (.8 + .6 * size) * VARIANTS[variant].multiplier * (perfect ? 1.25 : 1) * (daily ? 3 : 1));
  return {
    id, species: species.id, tier: species.tier, variant, weight: (low + (high - low) * size) * (variant === 'chonky' ? 1.6 : 1),
    clams, perfect, daily, junk: false, note: null, chain: 0,
  };
}

function land(t: TideState, species: Species, perfect: boolean, events: TideEvent[]) {
  const c = makeCatch(t, species, perfect);
  t.landed.push(c); t.stats.landed++;
  if (c.junk) t.stats.junk++;
  else { t.chain++; c.chain = t.chain; t.bestChain = Math.max(t.bestChain, t.chain); }
  t.catch = c; t.fight = null; t.pending = null;
  // Gary won't touch the Sun, and leaves the very first catch alone while it is explained.
  t.gary = species.id === 'sun' || t.firstCatch ? Infinity : T.gary;
  t.firstCatch = false;
  enter(t, 'catch');
  events.push({ type: 'landed', catch: c });
}

function decide(t: TideState, input: TideInput, dt: number, events: TideEvent[]) {
  const c = t.catch!, ready = t.time >= T.decisionLock;
  t.gary -= dt;
  if (ready && input.keepPressed) {
    t.cooler.push(c); t.stats.kept++; t.live = null; t.chain = 0;
    events.push({ type: 'kept', catch: c });
  } else if (ready && input.baitPressed && c.junk) {
    t.stats.tossed++;
    events.push({ type: 'tossed', catch: c });
  } else if (ready && input.baitPressed && canBait(c)) {
    t.live = c; t.stats.baited++;
    events.push({ type: 'baited', catch: c, line: speciesById(c.species).lines.bait });
  } else if (t.gary <= 0) {
    t.stats.gary++; t.live = null; t.chain = 0;
    events.push({ type: 'gary', catch: c, flock: c.tier >= 4 });
  } else return;
  t.catch = null;
  enter(t, 'ready');
}

function finish(t: TideState, events: TideEvent[]) {
  const fish = t.landed.filter(c => !c.junk);
  const best = fish.reduce<Catch | null>((top, c) => !top || c.tier > top.tier || (c.tier === top.tier && c.clams > top.clams) ? c : top, null);
  const biggest = fish.reduce<Catch | null>((top, c) => !top || c.weight > top.weight ? c : top, null);
  const clams = t.cooler.reduce((sum, c) => sum + c.clams, 0);
  const result: TideResult = {
    seed: t.options.seed, clams, cooler: t.cooler.slice(), landed: t.landed.slice(),
    bestTier: best?.tier ?? -1, bestSpecies: best?.species ?? null, bestChain: t.bestChain, biggest, stats: { ...t.stats },
    headline: tideHeadline({ bestTier: best?.tier ?? -1, bestSpecies: best?.species ?? null, garyThefts: t.stats.gary, snaps: t.stats.snaps, junkOnly: t.landed.length > 0 && !fish.length, clams }),
    sunCaught: t.cooler.some(c => c.species === 'sun'), dailyCaught: t.dailyCaught, time: t.clock,
  };
  t.result = result;
  enter(t, 'over');
  events.push({ type: 'over', result });
}

/** Development and tests: the next fish to bite. A tide waiting on a bite gets it at once;
 * a ready tide casts to mid water for it. */
export function forceBite(t: TideState, species: string, variant: VariantId | null = null, events: TideEvent[] = []) {
  speciesById(species);
  t.forced = { species, variant };
  if (t.phase === 'ready' || t.phase === 'recover') { t.charge = .6; cast(t, events); }
  else if (t.phase === 'waiting' || t.phase === 'nibble') {
    t.pending = chooseBiter(t); t.stats.bites++;
    enter(t, 'bite'); events.push({ type: 'chomp', tier: t.pending.species.tier });
  }
}

/** Development and tests: end the tide now, keeping what is in the cooler. */
export function endTide(t: TideState, events: TideEvent[] = []) {
  if (t.phase !== 'over') finish(t, events);
}
