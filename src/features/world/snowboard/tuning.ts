/** Every snowboard feel constant in one place ("balanced arcade": real carving grip,
 * exaggerated pop and air, forgiving landings). Units are metres, seconds, radians. */
const DEG = Math.PI / 180;

export const SNOWBOARD = {
  /** Fixed physics step and bounded catch-up per rendered frame. */
  step: 1 / 120,
  maxSubsteps: 10,

  /** Arcade gravity (about 1.4 g) for snappier jumps. */
  gravity: 14,
  /** Feet sit this far above the analytic snow surface. */
  boardOffset: .03,
  /** Normal-sampling half spans along and across the board. */
  normalSpanAlong: .2,
  normalSpanAcross: .2,

  // Carving
  maxEdge: 54 * DEG,
  edgeResponse: 7,
  edgeThreshold: 10 * DEG,
  /** Turn radius at full edge is sidecut / sin(edge). */
  sidecutRadius: 8.5,
  /** Full steering asks for the tightest turn the grip holds cleanly (share of the limit). */
  carveAssist: .92,
  /** Low-speed pivot so a stopped board can still turn. */
  pivotRate: 2.4,
  carveGrip: 10,
  flatGrip: 3,
  /** Maximum lateral grip as a multiple of the normal acceleration. */
  gripLimit: 1.55,
  /** Share of scrubbed lateral speed redirected forward (carving keeps speed, skids lose it). */
  carveEfficiency: .9,
  skidEfficiency: .25,
  tuckTurnFactor: .7,
  tuckEdgeFactor: .75,

  // Speed
  friction: { groomed: .045, powder: .11, offpiste: .42, water: .9 },
  surfaceGrip: { groomed: 1, powder: .8, offpiste: .55, water: .2 },
  drag: .011,
  dragTuck: .0062,
  softMaxSpeed: 27,
  overspeedDrag: 1.4,
  brakeFriction: .15,
  /** Extra deceleration of a hockey stop along the line of travel (about 0.65 g). */
  brakeScrub: 9,
  /** Holding tuck below this speed skates the board forward, so a stop is never stuck. */
  skateSpeed: 3,
  skateAccel: 2.6,

  // Air
  /** Extra speed away from the snow (m/s) beyond what gravity can pull back in one step before launching. */
  launchTolerance: .02,
  ollieMin: 3.3,
  ollieMax: 5.8,
  ollieChargeTime: .5,
  /** An ollie released this soon after rolling off a lip still pops. */
  coyoteTime: .14,
  airDrag: .0035,
  /** Unpopped airs ignore spin input this long, so bumps taken while carving stay straight. */
  airControlDelay: .12,
  spinRate: 8.8,
  spinResponse: 9,
  /** On release a spin finishes at the next half turn (or eases back if only just past one). */
  spinSettle: 14,
  spinSettleBack: 20 * DEG,
  flipRate: 6.3,
  flipResponse: 8,
  flipSettle: 10,
  flipSettleBack: 40 * DEG,
  grabRateFactor: .85,
  /** Rate the board levels to the snow below while not flipping. */
  airLevel: 2.6,

  // Landing
  landing: {
    perfect: { yaw: 8 * DEG, tilt: 9 * DEG },
    clean: { yaw: 35 * DEG, tilt: 30 * DEG },
    sloppy: { yaw: 60 * DEG, tilt: 48 * DEG },
  },
  /** Shorter airs without a rotation or grab are bumps (moguls, rollers): always ridden out. */
  hopTime: .45,
  /** Speed kept after a bump landed badly tilted. */
  hopSloppySpeedKeep: .88,
  /** Impact speed into the snow (m/s) that no landing survives. */
  maxImpact: 17,
  sloppySpeedKeep: .72,

  // Crashes and course
  riderRadius: .36,
  crashSpeed: 7.5,
  bounceRestitution: .35,
  crashDuration: 1.35,
  respawnSpeed: 4,
  outOfBoundsTime: 1.6,
  stuckTime: 5,
  countdown: 3,
  startPush: 3.2,
  finishCoast: 1.6,

  // Camera
  camera: {
    distance: 5.4, distancePerSpeed: .085, maxDistance: 7.6,
    height: 2.5, heightPerSpeed: .05, maxHeight: 3.7,
    lookAhead: 7, lookDown: 1.2,
    fov: 52, fovPerSpeed: .45, maxFovBoost: 12,
    positionDamping: 6, lookDamping: 8, directionDamping: 5,
    groundClearance: 1.1,
  },
} as const;

export type SnowSurface = keyof typeof SNOWBOARD.friction;
