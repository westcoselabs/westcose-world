/** Pier Pressure's food chain: eight tiers from sardines to the Sun, the junk under the pier,
 * variants, and every line anyone says. Pure data; the fight and the tide read it. */

export type MoveKind = 'rest' | 'run' | 'bolt' | 'dive' | 'jump' | 'playDead' | 'roll' | 'taunt';
export type Gimmick = 'sideways' | 'ink' | 'heavy' | 'leaper' | 'fakeTell' | 'sonar' | 'glare';
export type Body =
  | 'fish' | 'flat' | 'crab' | 'squid' | 'octopus' | 'shark' | 'hammerhead' | 'billfish' | 'whale' | 'orca'
  | 'kraken' | 'submarine' | 'sun' | 'boot' | 'sock' | 'cone' | 'duck' | 'bottle' | 'tee';
export type VariantId = 'normal' | 'chonky' | 'shiny' | 'fancy' | 'drip' | 'golden';

export interface Tier {
  name: string;
  /** Base value in clams before size, variant and bonuses. */
  clams: number;
  /** Pull of a full-strength move at full stamina, as a share of the base line's strain. */
  force: number;
  /** Swim-speed multiplier for runs and bolts. */
  speed: number;
  /** Seconds each move is telegraphed before it starts. */
  tell: number;
  /** Stamina drained per second of good line work. */
  drain: number;
  /** Half-width of the bow window around a jump's apex, and the jolt of a missed one. */
  bow: number; splash: number;
  /** Seconds over the snap limit the line survives: big fish break lines faster. */
  snap: number;
  /** How often each move comes up. */
  deck: Partial<Record<MoveKind, number>>;
}

export const TIERS: readonly Tier[] = [
  { name: 'Snack', clams: 10, force: .36, speed: .8, tell: .9, drain: .2, bow: .25, splash: .42, snap: .35, deck: { rest: 4, run: 2, bolt: 2, taunt: 2 } },
  { name: 'Lunch', clams: 30, force: .42, speed: .9, tell: .82, drain: .15, bow: .24, splash: .46, snap: .32, deck: { rest: 3, run: 2, bolt: 3, dive: 1, taunt: 2 } },
  { name: 'Dinner', clams: 90, force: .48, speed: 1, tell: .74, drain: .115, bow: .22, splash: .5, snap: .28, deck: { rest: 3, run: 2, bolt: 2, dive: 2, jump: 1, playDead: .5, taunt: 1.5 } },
  { name: 'Boss', clams: 270, force: .57, speed: 1.1, tell: .58, drain: .09, bow: .2, splash: .55, snap: .2, deck: { rest: 2.5, run: 2, bolt: 2, dive: 2, jump: 2, playDead: 1, roll: 1, taunt: 1 } },
  { name: 'Apex', clams: 800, force: .6, speed: 1.2, tell: .5, drain: .072, bow: .18, splash: .6, snap: .2, deck: { rest: 2, run: 2.5, bolt: 2.5, dive: 2, jump: 1.5, playDead: 1, roll: 1.5, taunt: 1 } },
  { name: 'Myth', clams: 2400, force: .68, speed: 1.3, tell: .42, drain: .058, bow: .17, splash: .64, snap: .14, deck: { rest: 2, run: 3, bolt: 2, dive: 3, jump: .5, playDead: .5, roll: 1, taunt: 1.5 } },
  { name: 'Legend', clams: 7000, force: .72, speed: 1.4, tell: .34, drain: .048, bow: .16, splash: .68, snap: .13, deck: { rest: 1.5, run: 2.5, bolt: 2.5, dive: 2.5, jump: 1, playDead: 1, roll: 2, taunt: 1 } },
  { name: '???', clams: 25000, force: .8, speed: 1.6, tell: .28, drain: .04, bow: .15, splash: .72, snap: .1, deck: { rest: 1.5, run: 2, bolt: 2.5, dive: 2, jump: 1.5, roll: 2, taunt: 1.5 } },
];
export const TOP_TIER = TIERS.length - 1;

export interface Lines { catch: string; heckles: readonly string[]; bait: string; escape: string }
export interface Species {
  id: string;
  name: string;
  /** 0..7 up the food chain; junk is -1. */
  tier: number;
  /** Pounds, smallest to largest. */
  weight: readonly [number, number];
  look: { body: Body; length: number; colors: readonly [top: string, belly: string, fin: string] };
  /** Replaces the tier's move deck. */
  deck?: Partial<Record<MoveKind, number>>;
  gimmick?: Gimmick;
  lines: Lines;
  /** Junk only: what it is worth, flat. */
  clams?: number;
}

const fish = (id: string, name: string, tier: number, weight: readonly [number, number], look: Species['look'], lines: Lines, extra: Partial<Species> = {}): Species =>
  ({ id, name, tier, weight, look, lines, ...extra });

export const SPECIES: readonly Species[] = [
  // Tier 0: Snack. Plain worms catch these.
  fish('sardine', 'Sardine', 0, [.1, .3], { body: 'fish', length: .2, colors: ['#5B7E8A', '#D9DED6', '#7C93A6'] }, {
    catch: 'I caught a sardine! It’s packed with personality.',
    heckles: ['I’m one of eleven billion. Do your worst.', 'My whole school is watching. This is awkward.', 'A worm? Classy.'],
    bait: 'Bait? I was promised a tin with a view.', escape: 'Back to school!',
  }),
  fish('anchovy', 'Anchovy', 0, [.05, .15], { body: 'fish', length: .14, colors: ['#647778', '#E9DFCE', '#8FA39B'] }, {
    catch: 'I caught an anchovy! Nobody ordered it, but here we are.',
    heckles: ['Pizza people love me. Fishing people? Less.', 'I’m salty. It’s not personal.', 'You reel like a topping.'],
    bait: 'Wait. You’re using ME as bait?', escape: 'Hold the anchovies!',
  }),
  fish('crab', 'Shore Crab', 0, [.2, .6], { body: 'crab', length: .22, colors: ['#C4553F', '#E9C9A4', '#8E3B2A'] }, {
    catch: 'I caught a shore crab! It’s feeling a little crabby.',
    heckles: ['I only go sideways. It’s a whole thing.', 'This is my good side. Both sides.', 'Pinch me, I’m— no, pinch YOU.'],
    bait: 'Crab bait. Bold career move for me.', escape: 'Scuttle, scuttle, see ya.',
  }, { gimmick: 'sideways', deck: { rest: 4, bolt: 5, taunt: 2 } }),

  // Tier 1: Lunch. Bait a snack to find them.
  fish('mackerel', 'Mackerel', 1, [1, 4], { body: 'fish', length: .4, colors: ['#3F6371', '#E3E6DD', '#2E4A57'] }, {
    catch: 'Holy mackerel! …Sorry. I had to.',
    heckles: ['Holy mackerel? Holy MOLY, let go.', 'I’m built for speed. You’re built for benches.', 'Stripes are slimming, and I’m still too fast.'],
    bait: 'Fine. But I want top billing.', escape: 'Holy mackerel, I’m free!',
  }),
  fish('squid', 'Squid', 1, [1, 6], { body: 'squid', length: .5, colors: ['#E3B8A4', '#F1E3C4', '#C98F7E'] }, {
    catch: 'I caught a squid! It’s still inking about it.',
    heckles: ['Have some ink. On the house.', 'Ten arms. Zero interest.', 'I’m squidding you. No I’m not. Let go.'],
    bait: 'You’re inking of using me as bait? Rude.', escape: 'Squid-bye!',
  }, { gimmick: 'ink' }),
  fish('seabass', 'Sea Bass', 1, [2, 9], { body: 'fish', length: .55, colors: ['#4C6E79', '#D8CFBA', '#39474A'] }, {
    catch: 'I caught a sea bass! It’s all about that bass.',
    heckles: ['I’m not common. I’m classic.', 'Drop the bass? Drop the ROD.', 'Bass-ically, you’re losing.'],
    bait: 'Bass-ically a promotion. For someone else.', escape: 'Bass out.',
  }),

  // Tier 2: Dinner.
  fish('tuna', 'Tuna', 2, [40, 400], { body: 'fish', length: 1.4, colors: ['#2E4A57', '#D9DED6', '#D9A441'] }, {
    catch: 'I caught a tuna! Oh my cod, it’s huge.',
    heckles: ['I’ve been to Tokyo. You’ve been to this pier.', 'I could do this all day. Can your arms?', 'You’re not even my type. I’m a bluefin.'],
    bait: 'A tuna as bait. Somebody’s hungry.', escape: 'So long, and thanks for all the worms.',
  }),
  fish('halibut', 'Halibut', 2, [20, 300], { body: 'flat', length: 1.2, colors: ['#7D6E58', '#EDE6D6', '#5E5141'] }, {
    catch: 'I caught a halibut! Halibut that?',
    heckles: ['I’m not resisting. I’m just flat.', 'Both my eyes are on one side and both are judging you.', 'I’m basically a doormat with opinions.'],
    bait: 'You’re flattening my career.', escape: 'Hali-bye!',
  }, { gimmick: 'heavy' }),
  fish('octopus', 'Octopus', 2, [10, 60], { body: 'octopus', length: .9, colors: ['#B5584A', '#E3A68E', '#8E3B2A'] }, {
    catch: 'I caught an octopus! It had me in its clutches. All eight.',
    heckles: ['Eight arms. Zero intention of getting in that cooler.', 'I have three hearts and none of them are rooting for you.', 'Arm wrestle? I’ll give you a seven-arm head start.'],
    bait: 'Eight arms of protest, noted.', escape: 'Arm-ageddon averted. Bye!',
  }, { deck: { rest: 2.5, run: 1.5, bolt: 1.5, dive: 1.5, roll: 2.5, playDead: .5, taunt: 1.5 } }),

  // Tier 3: Boss.
  fish('swordfish', 'Swordfish', 3, [100, 650], { body: 'billfish', length: 2.6, colors: ['#3E5560', '#D8D6CC', '#2B3B44'] }, {
    catch: 'I caught a swordfish! En garde, cooler.',
    heckles: ['En garde, landlubber!', 'I brought a sword to a rod fight.', 'Touché. That was you losing.'],
    bait: 'A swordfish as bait. Very knightly.', escape: 'Parry! Retreat! Bye!',
  }, { gimmick: 'leaper' }),
  fish('hammerhead', 'Hammerhead', 3, [200, 1000], { body: 'hammerhead', length: 3.2, colors: ['#6E7F82', '#D8D6CC', '#56645F'] }, {
    catch: 'I caught a hammerhead! Hit the nail on the head.',
    heckles: ['When all you have is a head like a hammer…', 'I nailed this audition.', 'Stop. Hammer time is over.'],
    bait: 'Bait? I’m a power tool.', escape: 'Nailed it. Bye!',
  }),
  fish('marlin', 'Marlin', 3, [200, 1500], { body: 'billfish', length: 3.4, colors: ['#2E4A70', '#E3E6DD', '#5B7EAA'] }, {
    catch: 'I caught a marlin! The old man would be proud.',
    heckles: ['Bow to the king, kid.', 'I’ve read about you. Short story.', 'I jump for joy. Your joy is optional.'],
    bait: 'A marlin as bait. Someone’s writing a novel.', escape: 'The sea wins again.',
  }, { gimmick: 'leaper' }),

  // Tier 4: Apex.
  fish('greatwhite', 'Great White', 4, [1500, 4000], { body: 'shark', length: 5, colors: ['#7C8B90', '#EDEDE6', '#5F6E73'] }, {
    catch: 'I caught a great white! We’re gonna need a bigger cooler.',
    heckles: ['Smile! No? Just me, then.', 'I’m not mad. This is my face.', 'Dun dun. Dun dun. That’s my entrance music.'],
    bait: 'Baiting a shark? With a shark?', escape: 'Fin-ally free!',
  }),
  fish('orca', 'Orca', 4, [6000, 12000], { body: 'orca', length: 7, colors: ['#1F2729', '#F1EFE6', '#1F2729'] }, {
    catch: 'I caught an orca! Chiller whale, honestly.',
    heckles: ['I’m technically a dolphin. Respect the paperwork.', 'Left. No, right. Gotcha.', 'I’ve outsmarted bigger boats than you.'],
    bait: 'Bait? I’m management.', escape: 'Orca-strated that perfectly.',
  }, { gimmick: 'fakeTell' }),

  // Tier 5: Myth.
  fish('bluewhale', 'Blue Whale', 5, [200000, 330000], { body: 'whale', length: 13, colors: ['#4F6F8A', '#B9C7CF', '#3F5A70'] }, {
    catch: 'Whale, whale, whale. What do we have here?',
    heckles: ['I weigh as much as your whole town. I checked.', 'My heart is the size of a car. My patience isn’t.', '♪ Whale song ♪ (it’s mostly insults)'],
    bait: 'Whale bait? What are you fishing for, the moon?', escape: 'Off to sea you later.',
  }),
  fish('giantsquid', 'Giant Squid', 5, [1200, 2000], { body: 'squid', length: 9, colors: ['#B5584A', '#E3B8A4', '#8E3B2A'] }, {
    catch: 'I caught a giant squid! Somebody call a documentary crew.',
    heckles: ['My eyes are the size of dinner plates. All the better to judge you.', 'Ink. Industrial ink.', 'I’ve wrestled whales. You’re a snack.'],
    bait: 'Using a giant squid as bait is a choice.', escape: 'Back to the abyss, where people are nicer.',
  }, { gimmick: 'ink' }),

  // Tier 6: Legend.
  fish('kraken', 'The Kraken', 6, [2000000, 5000000], { body: 'kraken', length: 10, colors: ['#4E3B57', '#A88AA8', '#2F2436'] }, {
    catch: 'I caught the Kraken! Somebody release it. Not me.',
    heckles: ['RELEASE ME. Or I release YOU.', 'I’ve eaten ships with nicer rods.', 'Ten tentacles. Your move.'],
    bait: 'The KRAKEN? As BAIT? For WHAT?', escape: 'The Kraken has left the chat.',
  }),
  fish('submarine', 'A Submarine', 6, [6000000, 18000000], { body: 'submarine', length: 14, colors: ['#3C4A4E', '#5B6B6F', '#D9A441'] }, {
    catch: 'I caught a submarine! Its crew would like a word.',
    heckles: ['*ping* *ping* That’s the sound of you losing.', 'Dive! Dive! Dive!', 'The captain says you’re not on the manifest.'],
    bait: 'Bait. A submarine. As bait. Sure.', escape: 'Periscope down. Bye!',
  }, { gimmick: 'sonar', deck: { rest: 2, run: 3, bolt: 2, dive: 3, roll: 1, taunt: 1.5 } }),

  // Tier 7. From the pier the sun has already set into the sea, so of course it can be caught.
  fish('sun', 'The Sun', 7, [4.385e30, 4.385e30], { body: 'sun', length: 6, colors: ['#FFC266', '#FF9A3D', '#FFE2A0'] }, {
    catch: 'I caught the sun! Sunsets are cancelled.',
    heckles: ['I’ve been setting for billions of years. I can do this all day.', 'Wear sunscreen. I’m serious.', 'You’re getting burned. Literally.'],
    bait: 'Nothing bites the Sun.', escape: 'The sun has set. Again.',
  }, { gimmick: 'glare' }),
];

/** What hides under the pilings. None of it fights, none of it can be bait. */
export const JUNK: readonly Species[] = [
  fish('boot', 'Old Boot', -1, [1.2, 2.4], { body: 'boot', length: .32, colors: ['#5E4A37', '#3E3226', '#A18D73'] }, { catch: 'I caught a boot! Sole-mate found.', heckles: [], bait: '', escape: '' }, { clams: 1 }),
  fish('sock', 'Soggy Sock', -1, [.2, .4], { body: 'sock', length: .3, colors: ['#E9DFCE', '#C4553F', '#5B7E8A'] }, { catch: 'I caught a sock! Its partner is still out there.', heckles: [], bait: '', escape: '' }, { clams: 1 }),
  fish('cone', 'Traffic Cone', -1, [3, 5], { body: 'cone', length: .5, colors: ['#F08A4B', '#F1EFE6', '#2B3536'] }, { catch: 'I caught a traffic cone! The pier is now under construction.', heckles: [], bait: '', escape: '' }, { clams: 2 }),
  fish('duck', 'Rubber Duck', -1, [.1, .2], { body: 'duck', length: .16, colors: ['#F2C14E', '#F08A4B', '#2B3536'] }, { catch: 'I caught a rubber duck! Quack of all trades.', heckles: [], bait: '', escape: '' }, { clams: 5 }),
  fish('bottle', 'Message in a Bottle', -1, [.8, 1.2], { body: 'bottle', length: .3, colors: ['#7FA88F', '#E9DFCE', '#8E6A44'] }, { catch: 'I caught a message in a bottle!', heckles: [], bait: '', escape: '' }, { clams: 25 }),
  fish('tee', 'Soggy WestCose Tee', -1, [.4, .6], { body: 'tee', length: .5, colors: ['#E9DFCE', '#A66A45', '#E9DFCE'] }, { catch: 'I caught a WestCose tee! Pre-shrunk. Very pre-shrunk.', heckles: [], bait: '', escape: '' }, { clams: 40 }),
];
/** How often each piece of junk turns up, relative to the others. */
export const JUNK_WEIGHTS: Record<string, number> = { boot: 4, sock: 4, cone: 2, duck: 2, bottle: 1.5, tee: .5 };

/** The notes found in bottles. */
export const BOTTLE_NOTES: readonly string[] = [
  '“Dear finder: the snacks at the bait shack are fine. Love, Gary.”',
  '“Help! I’m stuck in a bottle factory.”',
  '“If you’re reading this, you’re fishing too hard. Take your time.”',
  '“Day 41. The sardines have formed a union.”',
  '“There’s always a bigger fish. —A fish”',
];

export const ALL_CATCHES: readonly Species[] = [...SPECIES, ...JUNK];
const BY_ID = new Map(ALL_CATCHES.map(s => [s.id, s]));
export function speciesById(id: string): Species {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown catch ${id}`);
  return found;
}
export const speciesOfTier = (tier: number) => SPECIES.filter(s => s.tier === tier);

export const VARIANT_IDS: readonly VariantId[] = ['normal', 'chonky', 'shiny', 'fancy', 'drip', 'golden'];
export const VARIANTS: Record<VariantId, { name: string; multiplier: number; chance: number }> = {
  normal: { name: '', multiplier: 1, chance: 0 },
  /** An absolute unit: 1.6× the weight. */
  chonky: { name: 'Chonky', multiplier: 2, chance: .08 },
  shiny: { name: 'Shiny', multiplier: 3, chance: .04 },
  /** A tiny top hat and monocle. */
  fancy: { name: 'Fancy', multiplier: 5, chance: .015 },
  /** A tiny WestCose hoodie. */
  drip: { name: 'Drip', multiplier: 5, chance: .015 },
  golden: { name: 'Golden', multiplier: 10, chance: .005 },
};

export const GARY_LINES: readonly string[] = [
  'Nice fish. Would be a shame if something happened to it.',
  'I’m just looking. Mostly.',
  'Is that for me? It looks like it’s for me.',
  'Tick tock, pal.',
];
export const GARY_FLOCK_LINE = 'Gary called a few friends.';
export const GARY_SUN_LINE = 'It’s the Sun, pal. Gary’s not touching that.';

/** Overcharged casts hook something behind you instead. */
export const OVERCAST_GAGS: readonly string[] = [
  'You hooked Gary. Gary is unimpressed.',
  'You hooked your own cap.',
  'You hooked the lantern. The lantern wins.',
];

export interface TideSummary {
  bestTier: number; bestSpecies: string | null; garyThefts: number; snaps: number; junkOnly: boolean; clams: number;
}
/** The Tide Report's front page, from the tide's best and worst moments. */
export function tideHeadline(t: TideSummary): string {
  if (t.bestSpecies === 'sun') return 'LOCAL ANGLER LANDS SUN; SUNSETS SUSPENDED';
  if (t.bestSpecies === 'submarine') return 'SUBMARINE SURFACES AT PIER; CREW “VERY CONFUSED”';
  if (t.bestSpecies === 'kraken') return 'PIER REGULAR HAULS IN THE KRAKEN, ASKS FOR A BIGGER COOLER';
  if (t.bestTier === 5) return 'WHALE OF A TIME: LOCAL ANGLER LANDS A MYTH FROM A PUBLIC PIER';
  if (t.bestTier === 4) return 'APEX PREDATOR SPOTTED AT PIER. IN A COOLER.';
  if (t.garyThefts >= 2) return 'GULL STRIKES AGAIN; LOCAL ANGLER “FINE, HONESTLY”';
  if (t.snaps >= 3) return 'LINE SALES SOAR AFTER LOCAL ANGLER’S ROUGH DAY';
  if (t.bestTier === 3) return 'BOSS FISH BESTED AT THE TIP; GULLS DEMAND A RECOUNT';
  if (t.junkOnly) return 'LOCAL ANGLER LANDS BOOT, KEEPS DIGNITY';
  if (t.clams === 0) return 'LOCAL ANGLER ENJOYS THE VIEW';
  return 'LOCAL ANGLER LANDS DINNER, DIGNITY INTACT';
}
