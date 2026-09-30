/** Snowboard physics on the small planet. Pure and deterministic: the terrain is an
 * injected sampler, so the same step runs in the browser and in Node checks.
 *
 * Gravity is radial. The planet's own curvature is compensated (an extra v_t^2 / r
 * toward the centre in the air and in the launch test), so riding and jumping behave
 * like a flat slope of the same angle whatever the planet radius. Every frame comes
 * from the board itself, never latitude/longitude, so crossing a pole is safe.
 */
import { Quaternion, Vector3 } from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL } from '../data/world-map';
import { SNOWBOARD as T, type SnowSurface } from './tuning';

export type GrabId = 'indy' | 'melon' | 'method';
export type ObstacleHit = { id: string; normal: Vector3; depth: number };
export interface SurfaceSampler {
  /** Snow/terrain height above the base sphere along a unit direction. */
  height(direction: Vector3): number;
  kind(direction: Vector3): SnowSurface;
  /** A blocking obstacle overlapping a rider at this position, with a tangent outward normal. */
  obstacle(position: Vector3, radius: number): ObstacleHit | null;
}
export interface BoardInput {
  /** -1 left .. 1 right. */
  steer: number;
  tuck: boolean;
  brake: boolean;
  /** Held to crouch, released to ollie. */
  jump: boolean;
  grab: GrabId | null;
  /** In the air: 1 front flip, -1 back flip. */
  flip: number;
}
export const IDLE_INPUT: Readonly<BoardInput> = { steer: 0, tuck: false, brake: false, jump: false, grab: null, flip: 0 };
export interface AirStats {
  time: number;
  /** Signed accumulated yaw about the board normal (radians, positive = counter-clockwise from above). */
  spin: number;
  /** Signed accumulated flip (radians, positive = front flip). */
  flip: number;
  grab: GrabId | null;
  grabTime: number;
  maxHeight: number;
  popped: boolean;
  /** Took off riding switch. */
  switchTakeoff: boolean;
}
export type LandingQuality = 'perfect' | 'clean' | 'sloppy';
export type CrashReason = 'landing' | 'obstacle' | 'water';
export type BoardEvent =
  | { type: 'launch'; speed: number; popped: boolean }
  | { type: 'land'; quality: LandingQuality; air: AirStats; switchStance: boolean; speed: number; hop: boolean }
  | { type: 'crash'; reason: CrashReason; air?: AirStats; obstacleId?: string }
  | { type: 'bump'; obstacleId: string };

export class BoardState {
  /** Board contact point (feet), planet-centred. */
  position = new Vector3();
  velocity = new Vector3();
  /** Board nose direction. */
  heading = new Vector3(0, 0, 1);
  /** Board base normal; equals the ground normal when grounded. */
  boardUp = new Vector3(0, 1, 0);
  groundNormal = new Vector3(0, 1, 0);
  /** groundNormal was sampled at the current position by the previous grounded step. */
  normalValid = false;
  /** Signed edge angle; positive turns right. */
  edge = 0;
  /** Ollie charge, 0..1. */
  charge = 0;
  /** Visual crouch, 0..1. */
  crouch = 0;
  airborne = false;
  air: AirStats = emptyAir();
  spinRate = 0;
  flipRate = 0;
  spinTarget: number | null = null;
  flipTarget: number | null = null;
  surface: SnowSurface = 'groomed';
  skidding = false;
  carving = false;
  /** Lateral load as a share of the available grip, 0..1. */
  carveLoad = 0;
  crashed = false;
  crashTimer = 0;
  crashReason: CrashReason | null = null;
  switchStance = false;
  jumpHeld = false;
  tucking = false;
  braking = false;
  grab: GrabId | null = null;
}

function emptyAir(): AirStats { return { time: 0, spin: 0, flip: 0, grab: null, grabTime: 0, maxHeight: 0, popped: false, switchTakeoff: false }; }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Surface radius (planet centre to feet) along a unit direction. */
export function groundRadius(sampler: SurfaceSampler, direction: Vector3) {
  return MAP_RADIUS + sampler.height(direction) + T.boardOffset;
}

const sUp = new Vector3(), sF = new Vector3(), sR = new Vector3(), sDir = new Vector3();
const sFront = new Vector3(), sBack = new Vector3(), sLeft = new Vector3(), sRight = new Vector3(), sCarry = new Quaternion();
function surfacePoint(sampler: SurfaceSampler, target: Vector3, axis: Vector3, angle: number) {
  sDir.copy(sUp).addScaledVector(axis, angle).normalize();
  return target.copy(sDir).multiplyScalar(groundRadius(sampler, sDir));
}
/** Terrain normal from differences along and across the board's own frame. A trailing
 * normal measures the slope from behind the rider to under them, so a kicker's lip keeps
 * its angle until the rider actually passes it (a centred span would flatten it early). */
export function surfaceNormal(sampler: SurfaceSampler, position: Vector3, heading: Vector3, target: Vector3, trailing = false) {
  sUp.copy(position).normalize();
  sF.copy(heading).addScaledVector(sUp, -heading.dot(sUp));
  if (sF.lengthSq() < 1e-8) sF.set(1, 0, 0).addScaledVector(sUp, -sUp.x);
  if (sF.lengthSq() < 1e-8) sF.set(0, 0, 1).addScaledVector(sUp, -sUp.z);
  sF.normalize();
  sR.crossVectors(sF, sUp).normalize();
  const radius = Math.max(1, position.length());
  const along = T.normalSpanAlong / radius, across = T.normalSpanAcross / radius;
  surfacePoint(sampler, sFront, sF, trailing ? 0 : along); surfacePoint(sampler, sBack, sF, trailing ? -2 * along : -along);
  surfacePoint(sampler, sRight, sR, across); surfacePoint(sampler, sLeft, sR, -across);
  target.crossVectors(sRight.sub(sLeft), sFront.sub(sBack)).normalize();
  if (target.dot(sUp) < 0) target.negate();
  // A trailing chord is centred behind the rider: carry its normal over the planet's
  // curvature to the rider, so level snow reads exactly level.
  if (trailing) target.applyQuaternion(sCarry.setFromUnitVectors(sDir.copy(sUp).addScaledVector(sF, -along).normalize(), sUp));
  return target;
}

/** Place a board on the snow, moving along `forward` (projected onto the slope). */
export function placeBoard(board: BoardState, sampler: SurfaceSampler, direction: Vector3, forward: Vector3, speed = 0) {
  const up = direction.clone().normalize();
  board.position.copy(up).multiplyScalar(groundRadius(sampler, up));
  surfaceNormal(sampler, board.position, forward, board.groundNormal);
  board.heading.copy(forward).addScaledVector(board.groundNormal, -forward.dot(board.groundNormal)).normalize();
  board.boardUp.copy(board.groundNormal);
  board.velocity.copy(board.heading).multiplyScalar(speed);
  board.normalValid = true;
  board.edge = 0; board.charge = 0; board.crouch = 0; board.airborne = false; board.air = emptyAir();
  board.spinRate = 0; board.flipRate = 0; board.spinTarget = null; board.flipTarget = null;
  board.crashed = false; board.crashTimer = 0; board.crashReason = null;
  board.switchStance = false; board.jumpHeld = false; board.skidding = false; board.carving = false; board.carveLoad = 0;
  board.tucking = false; board.braking = false; board.grab = null;
  board.surface = sampler.kind(up);
}

export function stepBoard(board: BoardState, input: BoardInput, dt: number, sampler: SurfaceSampler, events: BoardEvent[]) {
  if (board.crashed) crashStep(board, dt, sampler);
  else if (board.airborne) airStep(board, input, dt, sampler, events);
  else groundStep(board, input, dt, sampler, events);
}

const gUp = new Vector3(), gN = new Vector3(), gF = new Vector3(), gR = new Vector3(), gG = new Vector3();
const gNext = new Vector3(), gDir = new Vector3(), gGround = new Vector3(), gN2 = new Vector3(), gTravel = new Vector3();
const gTurn = new Quaternion();

function groundStep(board: BoardState, input: BoardInput, dt: number, sampler: SurfaceSampler, events: BoardEvent[]) {
  gUp.copy(board.position).normalize();
  const radius = board.position.length();
  // Slopes are read along the direction of travel (the nose, or the tail when riding switch).
  gTravel.copy(board.velocity.lengthSq() > 1 ? board.velocity : board.heading);
  if (!board.normalValid) surfaceNormal(sampler, board.position, gTravel, board.groundNormal, true);
  gN.copy(board.groundNormal);
  board.surface = sampler.kind(gUp);
  if (board.surface === 'water') { crash(board, 'water', events); return; }
  const surfaceGrip = T.surfaceGrip[board.surface];
  const normalAccel = T.gravity * Math.max(.2, gUp.dot(gN));
  board.velocity.addScaledVector(gN, -board.velocity.dot(gN));

  // The board axis that faces the travel direction; riding backwards is switch.
  gF.copy(board.heading).addScaledVector(gN, -board.heading.dot(gN));
  if (gF.lengthSq() < 1e-8) gF.copy(board.velocity);
  gF.normalize();
  const along = board.velocity.dot(gF);
  const facing = board.switchStance ? (along > .2 ? 1 : -1) : (along < -.2 ? -1 : 1);
  board.switchStance = facing < 0;
  gF.multiplyScalar(facing);
  gR.crossVectors(gF, gN).normalize();

  // Edge and turn: full input asks for the tightest turn the snow holds cleanly at this speed.
  const steer = clamp(input.steer, -1, 1);
  const speed0 = board.velocity.length();
  const gripAccel = T.gripLimit * normalAccel * surfaceGrip;
  const cleanEdge = Math.asin(clamp(T.carveAssist * gripAccel * T.sidecutRadius / Math.max(speed0 * speed0, 1e-3), 0, 1));
  const edgeTarget = steer * Math.min(T.maxEdge * (input.tuck ? T.tuckEdgeFactor : 1), cleanEdge);
  board.edge += (edgeTarget - board.edge) * (1 - Math.exp(-T.edgeResponse * dt));
  const forwardSpeed = Math.abs(board.velocity.dot(gF));
  let yawRate = forwardSpeed / T.sidecutRadius * Math.sin(board.edge)
    + steer * T.pivotRate * (1 - smoothstep(1, 5, forwardSpeed));
  if (input.tuck) yawRate *= T.tuckTurnFactor;
  gTurn.setFromAxisAngle(gN, -yawRate * dt);
  gF.applyQuaternion(gTurn);
  board.heading.copy(gF).multiplyScalar(facing);
  gR.crossVectors(gF, gN).normalize();

  // Edge grip scrubs lateral speed. A clean carve turns that motion forward (keeping
  // most of its energy); a skid or a brake throws it away.
  let vForward = board.velocity.dot(gF), vLateral = board.velocity.dot(gR);
  const edged = Math.abs(board.edge) > T.edgeThreshold && !input.brake;
  const wanted = vLateral * (1 - Math.exp(-(edged ? T.carveGrip : T.flatGrip) * surfaceGrip * dt));
  const limit = gripAccel * dt;
  const removed = clamp(wanted, -limit, limit);
  board.skidding = input.brake || Math.abs(wanted) > limit + 1e-6 || (!edged && Math.abs(vLateral) > 2.2);
  const efficiency = input.brake ? 0 : board.skidding ? T.skidEfficiency : T.carveEfficiency;
  const scrubbed = vLateral * vLateral - (vLateral - removed) ** 2;
  vLateral -= removed;
  vForward = (vForward >= 0 ? 1 : -1) * Math.sqrt(vForward * vForward + Math.max(0, scrubbed) * efficiency);
  board.velocity.copy(gF).multiplyScalar(vForward).addScaledVector(gR, vLateral);
  board.carveLoad = clamp(Math.abs(yawRate * vForward) / Math.max(1e-3, gripAccel), 0, 1);
  board.carving = edged && !board.skidding && Math.abs(vForward) > 6;

  // Gravity along the slope, a skate push from a standstill, then friction and drag.
  gG.copy(gUp).multiplyScalar(-T.gravity);
  board.velocity.addScaledVector(gG.addScaledVector(gN, -gG.dot(gN)), dt);
  if (input.tuck && !input.brake && board.velocity.dot(gF) < T.skateSpeed) board.velocity.addScaledVector(gF, T.skateAccel * dt);
  // A hockey stop scrapes speed off along the line of travel (the board's swing across
  // that line is drawn by the rider pose), so braking never veers the rider off course.
  const speed = board.velocity.length();
  if (speed > 1e-4) {
    const mu = T.friction[board.surface] + (input.brake ? T.brakeFriction : 0);
    const drag = (input.tuck ? T.dragTuck : T.drag) * speed * speed + Math.max(0, speed - T.softMaxSpeed) * T.overspeedDrag;
    const decel = Math.min(speed / dt, mu * normalAccel + drag + (input.brake ? T.brakeScrub * Math.min(1, speed / 2) : 0));
    board.velocity.multiplyScalar(1 - decel * dt / speed);
  }
  board.tucking = input.tuck && !input.brake; board.braking = input.brake; board.grab = null;

  // Ollie: charge while held, pop along the slope normal on release.
  let pop = 0;
  if (input.jump) board.charge = Math.min(1, board.charge + dt / T.ollieChargeTime);
  else if (board.jumpHeld && board.charge > .05) { pop = T.ollieMin + (T.ollieMax - T.ollieMin) * board.charge; board.charge = 0; }
  else board.charge = 0;
  board.jumpHeld = input.jump;
  board.crouch += ((input.jump ? .35 + .65 * board.charge : input.tuck ? .75 : 0) - board.crouch) * (1 - Math.exp(-12 * dt));
  if (pop > 0) board.velocity.addScaledVector(gN, pop);

  // Move, then follow the snow or leave it: launch when the speed away from the new
  // surface is more than gravity (plus the planet-curvature term) can pull back this step.
  gNext.copy(board.position).addScaledVector(board.velocity, dt);
  gDir.copy(gNext).normalize();
  const ground = groundRadius(sampler, gDir);
  gGround.copy(gDir).multiplyScalar(ground);
  gTravel.copy(board.velocity.lengthSq() > 1 ? board.velocity : board.heading);
  surfaceNormal(sampler, gGround, gTravel, gN2, true);
  const radial = board.velocity.dot(gDir);
  const fall = T.gravity + Math.max(0, board.velocity.lengthSq() - radial * radial) / radius;
  const away = board.velocity.dot(gN2);
  if (pop > 0 || (away > fall * Math.max(.2, gDir.dot(gN2)) * dt + T.launchTolerance && gNext.length() > ground - .05)) {
    board.position.copy(gNext.length() < ground ? gGround : gNext);
    board.velocity.addScaledVector(gDir, -fall * dt);
    board.airborne = true; board.normalValid = false;
    board.air = emptyAir(); board.air.popped = pop > 0; board.air.switchTakeoff = board.switchStance;
    board.spinTarget = null; board.flipTarget = null; board.spinRate = 0; board.flipRate = 0;
    board.boardUp.copy(gN);
    board.carving = false; board.skidding = false;
    events.push({ type: 'launch', speed: board.velocity.length(), popped: pop > 0 });
  } else {
    board.position.copy(gGround);
    board.velocity.addScaledVector(gN2, -board.velocity.dot(gN2));
    board.heading.addScaledVector(gN2, -board.heading.dot(gN2)).normalize();
    board.groundNormal.copy(gN2); board.boardUp.copy(gN2); board.normalValid = true;
  }
  collide(board, sampler, events);
}

const aUp0 = new Vector3(), aUp1 = new Vector3(), aAxis = new Vector3(), aBelow = new Vector3();
const aTurn = new Quaternion();

/** Where a released rotation settles: the next whole unit ahead, or back to one only just passed. */
function settleTarget(angle: number, rate: number, unit: number, back: number) {
  const k = angle / unit, low = Math.floor(k) * unit, high = Math.ceil(k) * unit;
  if (Math.abs(rate) < .5) return Math.round(k) * unit;
  if (rate > 0) return angle - low < back ? low : high;
  return high - angle < back ? high : low;
}

function rotate(board: BoardState, axis: Vector3, angle: number) {
  if (angle === 0) return;
  aTurn.setFromAxisAngle(axis, angle);
  board.heading.applyQuaternion(aTurn).normalize();
  board.boardUp.applyQuaternion(aTurn).normalize();
}

function airStep(board: BoardState, input: BoardInput, dt: number, sampler: SurfaceSampler, events: BoardEvent[]) {
  aUp0.copy(board.position).normalize();
  const radius = board.position.length();
  const radial = board.velocity.dot(aUp0);
  board.velocity.addScaledVector(aUp0, -(T.gravity + Math.max(0, board.velocity.lengthSq() - radial * radial) / radius) * dt);
  board.velocity.multiplyScalar(1 - Math.min(.5, T.airDrag * board.velocity.length() * dt));
  board.position.addScaledVector(board.velocity, dt);
  aUp1.copy(board.position).normalize();
  // Carry the board frame over the planet's curvature, as the ground would.
  aTurn.setFromUnitVectors(aUp0, aUp1);
  board.heading.applyQuaternion(aTurn); board.boardUp.applyQuaternion(aTurn);
  const air = board.air;
  air.time += dt;

  // A late ollie just off a lip still pops.
  if (input.jump) board.charge = Math.min(1, board.charge + dt / T.ollieChargeTime);
  else {
    if (board.jumpHeld && board.charge > .05 && !air.popped && air.time <= T.coyoteTime) {
      board.velocity.addScaledVector(board.boardUp, T.ollieMin + (T.ollieMax - T.ollieMin) * board.charge);
      air.popped = true;
    }
    board.charge = 0;
  }
  board.jumpHeld = input.jump;

  // Spins follow steering (right = clockwise from above); flips follow tuck/brake.
  const control = air.popped || air.time > T.airControlDelay;
  const grabbing = control && input.grab !== null;
  const scale = grabbing ? T.grabRateFactor : 1;
  if (control && Math.abs(input.steer) > .1) {
    board.spinTarget = null;
    board.spinRate += (-clamp(input.steer, -1, 1) * T.spinRate * scale - board.spinRate) * (1 - Math.exp(-T.spinResponse * dt));
  } else if (air.spin !== 0 || board.spinRate !== 0) {
    board.spinTarget ??= settleTarget(air.spin, board.spinRate, Math.PI, T.spinSettleBack);
    board.spinRate = clamp((board.spinTarget - air.spin) * T.spinSettle, -T.spinRate, T.spinRate);
  }
  const flipping = control && input.flip !== 0;
  if (flipping) {
    board.flipTarget = null;
    board.flipRate += (Math.sign(input.flip) * T.flipRate * scale - board.flipRate) * (1 - Math.exp(-T.flipResponse * dt));
  } else if (air.flip !== 0 || board.flipRate !== 0) {
    board.flipTarget ??= settleTarget(air.flip, board.flipRate, Math.PI * 2, T.flipSettleBack);
    board.flipRate = clamp((board.flipTarget - air.flip) * T.flipSettle, -T.flipRate, T.flipRate);
  }
  const spin = board.spinRate * dt, flip = board.flipRate * dt;
  air.spin += spin; air.flip += flip;
  rotate(board, board.boardUp, spin);
  aAxis.crossVectors(board.heading, board.boardUp).normalize();
  rotate(board, aAxis, -flip);
  // Level pitch and roll toward the snow below whenever no flip is in progress.
  const flipResidual = Math.abs(air.flip - Math.round(air.flip / (Math.PI * 2)) * Math.PI * 2);
  if (!flipping && flipResidual < .5) {
    surfaceNormal(sampler, board.position, board.heading, aBelow);
    aAxis.crossVectors(board.boardUp, aBelow);
    const sine = aAxis.length();
    if (sine > 1e-5) rotate(board, aAxis.divideScalar(sine), Math.atan2(sine, board.boardUp.dot(aBelow)) * (1 - Math.exp(-T.airLevel * dt)));
  }
  if (grabbing) { air.grab ??= input.grab; air.grabTime += dt; }
  board.grab = grabbing ? input.grab : null;
  board.crouch += ((grabbing ? 1 : input.jump ? .35 + .65 * board.charge : .15) - board.crouch) * (1 - Math.exp(-10 * dt));

  const ground = groundRadius(sampler, aUp1);
  const height = board.position.length() - ground;
  air.maxHeight = Math.max(air.maxHeight, height);
  if (height < 2 && sampler.kind(aUp1) === 'water' && board.position.length() <= MAP_RADIUS + MAP_SEA_LEVEL + .1) { crash(board, 'water', events); return; }
  if (height <= 0) land(board, sampler, events, ground);
  else collide(board, sampler, events);
}

const lN = new Vector3(), lTravel = new Vector3(), lNose = new Vector3();
function land(board: BoardState, sampler: SurfaceSampler, events: BoardEvent[], ground: number) {
  board.position.normalize().multiplyScalar(ground);
  surfaceNormal(sampler, board.position, board.heading, lN);
  const impact = -board.velocity.dot(lN);
  const tilt = board.boardUp.angleTo(lN);
  lTravel.copy(board.velocity).addScaledVector(lN, -board.velocity.dot(lN));
  lNose.copy(board.heading).addScaledVector(lN, -board.heading.dot(lN));
  if (lNose.lengthSq() < 1e-6) lNose.copy(lTravel);
  lNose.normalize();
  const slide = lTravel.length();
  if (slide < .2) lTravel.copy(lNose); else lTravel.divideScalar(slide);
  const regular = lNose.angleTo(lTravel), switched = Math.PI - regular;
  const yaw = Math.min(regular, switched), switchStance = switched < regular;
  const air = board.air;
  const hop = air.time < T.hopTime && Math.abs(air.spin) < .5 && Math.abs(air.flip) < .5 && air.grabTime < .15;
  const { perfect, clean, sloppy } = T.landing;
  let quality: LandingQuality | null;
  if (hop) quality = tilt <= sloppy.tilt ? 'clean' : 'sloppy';
  else quality = tilt <= perfect.tilt && yaw <= perfect.yaw ? 'perfect'
    : tilt <= clean.tilt && yaw <= clean.yaw ? 'clean'
    : tilt <= sloppy.tilt && yaw <= sloppy.yaw ? 'sloppy' : null;
  if (!quality || impact > T.maxImpact) { crash(board, 'landing', events, air); return; }
  // Keep the momentum along the snow; the impact into the slope is absorbed.
  board.velocity.copy(lTravel).multiplyScalar(slide);
  if (quality === 'sloppy') board.velocity.multiplyScalar(hop ? T.hopSloppySpeedKeep : T.sloppySpeedKeep);
  // Straighten onto the travel line, riding switch if the tail came round first.
  board.heading.copy(lTravel).multiplyScalar(switchStance ? -1 : 1);
  board.boardUp.copy(lN); board.groundNormal.copy(lN); board.normalValid = true;
  board.airborne = false; board.spinRate = 0; board.flipRate = 0; board.spinTarget = null; board.flipTarget = null;
  board.switchStance = switchStance; board.grab = null;
  events.push({ type: 'land', quality, air: { ...air }, switchStance, speed: board.velocity.length(), hop });
  board.air = emptyAir();
}

function crash(board: BoardState, reason: CrashReason, events: BoardEvent[], air?: AirStats, obstacleId?: string) {
  board.crashed = true; board.crashTimer = T.crashDuration; board.crashReason = reason;
  board.airborne = false; board.normalValid = false;
  board.spinRate = 0; board.flipRate = 0; board.charge = 0; board.crouch = 0; board.grab = null;
  board.carving = false; board.skidding = false;
  events.push({ type: 'crash', reason, air: air ? { ...air } : undefined, obstacleId });
  board.air = emptyAir();
}

const cN = new Vector3(), cDir = new Vector3();
/** Tumble to a stop on the surface; the controller respawns when the timer ends. */
function crashStep(board: BoardState, dt: number, sampler: SurfaceSampler) {
  board.crashTimer -= dt;
  surfaceNormal(sampler, board.position, board.heading, cN);
  board.velocity.addScaledVector(cN, -board.velocity.dot(cN)).multiplyScalar(Math.exp(-3.2 * dt));
  cDir.copy(board.position).addScaledVector(board.velocity, dt).normalize();
  board.position.copy(cDir).multiplyScalar(groundRadius(sampler, cDir));
}

function collide(board: BoardState, sampler: SurfaceSampler, events: BoardEvent[]) {
  const hit = sampler.obstacle(board.position, T.riderRadius);
  if (!hit) return;
  board.position.addScaledVector(hit.normal, hit.depth);
  const into = board.velocity.dot(hit.normal);
  if (into >= 0) return;
  if (board.velocity.length() > T.crashSpeed && -into > T.crashSpeed * .45) { crash(board, 'obstacle', events, board.airborne ? board.air : undefined, hit.id); return; }
  board.velocity.addScaledVector(hit.normal, -(1 + T.bounceRestitution) * into);
  events.push({ type: 'bump', obstacleId: hit.id });
}
