/** Every skateboard feel constant in one place. The target is the classic arcade skate
 * games: quick pushes, tank-style turning, big floaty vert airs that lock over the coping,
 * snappy flip tricks, sticky grinds with a balance meter and forgiving landings.
 * Units are metres, seconds, radians. */
const DEG = Math.PI / 180;

export const SKATE = {
  step: 1 / 120,
  maxSubsteps: 10,

  gravity: 13,
  /** Wheels sit this far above the analytic surface. */
  boardOffset: .035,
  /** Collision radius and half-height of the rider capsule. */
  riderRadius: .3,
  riderHalfHeight: .85,

  // Rolling
  pushAccel: 6,
  /** Pushing stops adding speed above this. */
  pushSpeed: 8.6,
  /** Soft top speed: extra drag above it. */
  topSpeed: 17,
  overspeedDrag: 1.1,
  friction: { concrete: .011, asphalt: .018, paving: .016, wood: .02, floor: .03, dirt: .2, grass: .32, sand: .45, water: 1 },
  drag: .0035,
  brakeDecel: 7.5,
  /** Turn rate (left/right), slow and fast. */
  turnRate: 3.3,
  turnRateFast: 2.3,
  /** Lateral grip: how quickly velocity swings round to the board; most of it is kept. */
  grip: 18,
  gripEfficiency: .94,
  /** An unexpected rise bigger than this in one step is a curb or wall face, not a ramp. */
  stepUp: .07,
  /** Head-on speed into a wall that bails the rider. */
  wallBailSpeed: 7.2,
  wallRestitution: .25,
  /** Rolling off a lip onto a steep wall below this speed rolls in instead of launching. */
  dropInSpeed: 8.5,
  /** Extra speed dropping down transitions (the rider pumps the bowl). */
  pumpAccel: 3.6,

  // Ollie and air
  ollieMin: 3.8,
  ollieMax: 5.2,
  ollieChargeTime: .32,
  coyoteTime: .12,
  launchTolerance: .02,
  spinRate: 8.4,
  spinResponse: 14,
  spinSettle: 16,
  spinSettleBack: 25 * DEG,
  /** Rate the board levels to the surface below in an ordinary air... */
  airLevel: 5,
  /** ...and the snap that lays it parallel to the landing in the last moments of a fall. */
  landSnap: 22,
  landSnapHeight: 1.1,
  /** Takeoff surfaces steeper than this are vert: the whole speed goes straight up. */
  vertAngle: 58 * DEG,
  /** Vert airs float higher than the exit speed alone would carry, up to a ceiling
   * (11 m/s is about 4.6m above the coping). */
  vertBoost: 1.25,
  vertMaxLaunch: 11,
  /** Extra pop for an ollie released at the lip of a vert wall. */
  vertPop: 2.2,
  /** Holding up at a lip keeps the rider's momentum, with enough carry over the coping to
   * land about this far onto the deck, within the carry limits. */
  transferReach: 1.1,
  transferCarryMin: .6,
  transferCarry: 2.4,
  /** Landings on surfaces steeper than this keep their whole speed along the ramp. */
  rampLanding: Math.cos(25 * DEG),
  /** Landing yaw allowed either side of the travel line (forward or fakie). */
  landYaw: 52 * DEG,
  /** Landings this square to the line and the surface are perfect. */
  perfectYaw: 12 * DEG,
  perfectTilt: 10 * DEG,
  /** A flip must be this far through its rotation when the board touches down. */
  flipLandFraction: .82,
  /** Air snap-ups larger than this are a wall, not a landing. */
  wallSnap: .35,

  // Grinds and manuals
  grindCatch: .6,
  grindAbove: .95,
  grindBelow: .4,
  /** From the ground, a grind request pops onto rails this far above the board. */
  grindReach: 1.2,
  grindMinSpeed: 2.6,
  /** A rail just left cannot be caught again for this long. */
  grindRecatch: .3,
  grindFriction: .7,
  grindRiseAccel: .9,
  balanceDrift: 2.8,
  balanceNoise: 1.7,
  balanceControl: 6.5,
  balanceDamping: .8,
  /** Balance gets harder the longer a grind or manual lasts. */
  balanceRamp: .22,
  manualWindow: .32,

  // Bails
  bailTime: 1.55,
  bailFriction: 3.2,

  // Camera
  camera: {
    distance: 4.3, distancePerSpeed: .07, maxDistance: 5.6,
    height: 1.85, heightPerSpeed: .03, maxHeight: 2.4,
    lookUp: 1, lookAhead: 2.2, positionDamping: 7, directionDamping: 3.4,
    groundClearance: .9, fov: 58, fovPerSpeed: .5, maxFovBoost: 8,
  },
} as const;

export type SkateGround = keyof typeof SKATE.friction;
