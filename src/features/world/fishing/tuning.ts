/** Pier Pressure tuning. Units are metres, seconds and clams; tension is a fraction of the base
 * line's breaking strain (the line snaps at 1, more with upgrades); stamina runs 1..0. */
export const FISHING = {
  step: 1 / 120,
  maxSubsteps: 10,

  /** Worms per tide before Bait Bucket upgrades; a plain cast spends one. */
  worms: 6,

  cast: {
    /** Metres beyond the seaward rail. The camera's horizon on the 72 m planet is about 28 m. */
    minDistance: 6, maxDistance: 17,
    /** Seconds of holding to reach a full charge, and the charge band that counts as a bullseye. */
    chargeTime: 1.1, bullseye: [0.8, 0.92],
    /** Holding a full charge this long hooks something on the back swing instead. */
    overcharge: 0.4,
    /** Half-angle of the aiming fan, in radians, and how fast A/D swings it. */
    aim: 25 * Math.PI / 180, aimRate: 0.9,
    /** Flight time of the bobber, and how long an overcast gag takes. */
    flight: 0.7, gag: 1.5,
    /** Water zones by distance: near the pilings, mid, and the deep channel. */
    pilings: 8.5, channel: 13,
  },

  wait: { min: 1.5, max: 5, pilings: 0.7, channel: 1.25 },
  bite: {
    /** Up to four fake nibbles, then the real bite. */
    nibbles: 4, nibbleGap: [0.45, 1.05] as const, nibbleTime: 0.18,
    /** The strike window at the CHOMP opens wide for tier 0 and narrows each tier up. */
    window: 0.62, windowPerTier: 0.045,
    /** A strike within this of the CHOMP is a PERFECT HOOKSET (plus the Lucky Charm). */
    perfect: 0.12,
    /** Reeling in a spooked or empty line before the next cast. */
    recover: 0.8,
  },

  fight: {
    /** Tension follows its target with this time constant: smooth, never jerky. */
    tensionLag: 0.12,
    /** A jolt past this share of the snap limit breaks the line at once; tiers set the grace before it. */
    hardSnap: 1.3,
    slackLimit: 0.06, slackTime: 1.8, slackGrace: 0.8,
    /** Tension as a fraction of the snap limit that counts as working the fish. */
    green: [0.32, 0.86] as const,
    /** Base reel speed (m/s) and the drag reeling adds to the line. */
    reelSpeed: 2.2, reelDrag: 0.2, reelAgainst: 1.25, reelLateral: 0.5,
    /** Steering against a bolt soaks this share of its pull; steering with it adds this. */
    steerSoak: 0.5, steerWrong: 0.9,
    /** The line runs out past this distance. */
    maxLine: 30,
    /** Distance lost while a jump or a run drags line; landing within this counts as landed. */
    landed: 0.4,
    /** A missed bow at splashdown jolts the line by the tier's splash, more while reeling. */
    reelSplash: 1.5,
    /** Stamina recovery while the line is slack and the fish rests. */
    regenTension: 0.15,
    /** The fish's starting stamina after a perfect hookset. */
    perfectStamina: 0.75,
  },

  /** Seconds before Gary takes an undecided catch, and the lockout on fresh decision presses. */
  gary: 6, decisionLock: 0.5,
  /** Chance a fight below tier 6 is ambushed by a bigger fish. */
  ambush: 0.06,
  /** Chance a plain cast hooks junk, by zone. */
  junk: { pilings: 0.18, mid: 0.1, channel: 0.04 },
  /** Chance of skipping a tier with live bait. */
  skip: 0.06,
  /** Tutorial: the first tide's first bite is slower to read. */
  tutorialTell: 1.4, tutorialWindow: 1.5,

  camera: {
    /** Above the deck and behind the seaward rail, over the angler's shoulder and down the cast
     * line: high enough to see the near water over the rail, low enough to keep the angler in shot. */
    height: 4.6, back: 3.6, lookAhead: 8,
    fightHeight: 4.2, fightBack: 3.4,
    shake: 0.12,
    damping: 3.2,
  },
} as const;
