/** Skateboard physics on the small planet. Pure and deterministic: the world is an injected
 * surface, so the same step runs in the browser and in Node checks.
 *
 * Gravity is radial, with the planet's curvature compensated in the air (as the snowboard
 * does), so a jump behaves like one on flat ground. The rider rolls on the analytic
 * heightfield: smooth transitions carry speed, unexpected rises are curb or wall faces,
 * and a steep takeoff is a vert air that locks over the coping and drops back in.
 */
import { Quaternion, Vector3 } from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL } from '../data/world-map';
import { SKATE as T, type SkateGround } from './tuning';
import { FLIPS, flipFor, grabFor, grindFor, GRINDS, type FlipId, type GrabId, type GrindId, type ManualId } from './tricks';

export type SurfaceSample = { height: number; kind: SkateGround; normal: Vector3 };
export type ObstacleHit = { id: string; normal: Vector3; depth: number };
export type GrindKind = 'rail' | 'ledge' | 'coping' | 'curb' | 'bench';
export type GrindLine = { id: string; name: string; kind: GrindKind; points: readonly Vector3[]; closed: boolean };
export interface SkateSurface {
  /** Surface height above the base sphere, material and outward normal along a unit direction. */
  sample(direction: Vector3, target: SurfaceSample): SurfaceSample;
  /** A solid overlapping the rider's capsule, with a tangent push-out normal. */
  obstacle(position: Vector3, up: Vector3, radius: number, halfHeight: number): ObstacleHit | null;
  /** Grind lines with a segment within `radius` of a point. */
  grindLines(position: Vector3, radius: number): readonly GrindLine[];
}
export interface SkateInput {
  /** -1 left .. 1 right: turn, spin, or rail balance. */
  steer: number;
  /** -1 down .. 1 up: trick direction and manual balance. */
  lean: number;
  push: boolean;
  brake: boolean;
  /** Held to crouch, released to ollie. */
  jump: boolean;
  /** Pressed this step. */
  flip: boolean;
  /** Held. */
  grab: boolean;
  /** Pressed recently (the reader buffers it briefly). */
  grind: boolean;
  manual: ManualId | null;
}
export const IDLE_INPUT: Readonly<SkateInput> = { steer: 0, lean: 0, push: false, brake: false, jump: false, flip: false, grab: false, grind: false, manual: null };

export type SkateMode = 'ground' | 'air' | 'grind' | 'bail';
export type AirSummary = {
  time: number; spin: number; popped: boolean; vert: boolean; height: number; fakieTakeoff: boolean;
  flips: FlipId[]; grabs: { id: GrabId; time: number }[];
};
export type SkateEvent =
  | { type: 'launch'; vert: boolean; popped: boolean; speed: number }
  | { type: 'land'; air: AirSummary; fakie: boolean; manual: ManualId | null; speed: number; perfect: boolean }
  | { type: 'flip'; id: FlipId }
  | { type: 'grind-start'; trick: GrindId; line: GrindLine; air: AirSummary | null }
  | { type: 'grind-end'; trick: GrindId; time: number; line: GrindLine; bailed: boolean }
  | { type: 'manual-start'; id: ManualId }
  | { type: 'manual-end'; id: ManualId; time: number; bailed: boolean }
  | { type: 'bail'; reason: 'wall' | 'landing' | 'flip' | 'balance' | 'water' | 'obstacle' }
  | { type: 'bump'; speed: number };

type Air = AirSummary & { flip: FlipId | null; flipTime: number; grab: GrabId | null; grabTime: number; vertNormal: Vector3; startRadius: number; transfer: boolean };
type Grind = { line: GrindLine; segment: number; t: number; dir: 1 | -1; speed: number; trick: GrindId; balance: number; balanceVel: number; time: number; seed: number; fakie: boolean };
type Manual = { id: ManualId; balance: number; balanceVel: number; time: number; seed: number };

const emptyAir = (): Air => ({ time: 0, spin: 0, popped: false, vert: false, height: 0, fakieTakeoff: false, flips: [], grabs: [], flip: null, flipTime: 0, grab: null, grabTime: 0, vertNormal: new Vector3(), startRadius: 0, transfer: false });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class SkaterState {
  /** Board contact point (wheels), planet-centred. */
  position = new Vector3();
  velocity = new Vector3();
  /** Board nose direction. */
  heading = new Vector3(0, 0, 1);
  boardUp = new Vector3(0, 1, 0);
  groundNormal = new Vector3(0, 1, 0);
  mode: SkateMode = 'ground';
  /** Rolling tail-first. */
  fakie = false;
  surface: SkateGround = 'concrete';
  charge = 0;
  crouch = 0;
  jumpHeld = false;
  pushing = false;
  braking = false;
  air: Air = emptyAir();
  grind: Grind | null = null;
  manual: Manual | null = null;
  /** A manual asked for in the air, taken on landing if recent enough. */
  queuedManual: { id: ManualId; age: number } | null = null;
  /** The rail last left and when, so a pop or the rail's end does not catch it again at once. */
  leftRail: { id: string; time: number } | null = null;
  bailTimer = 0;
  bailReason: string | null = null;
  clock = 0;
  spinRate = 0;
  spinTarget: number | null = null;
  /** Seconds since the rider was last on a flat, rideable surface (for respawns). */
  safe = new Vector3();
  safeHeading = new Vector3(0, 0, 1);
}

const sample: SurfaceSample = { height: 0, kind: 'concrete', normal: new Vector3() };
const probe: SurfaceSample = { height: 0, kind: 'concrete', normal: new Vector3() };
export function groundRadius(height: number) { return MAP_RADIUS + height + T.boardOffset; }

/** Place a rider on the surface at a direction, facing `forward`, at rest or rolling. */
export function placeSkater(s: SkaterState, surface: SkateSurface, direction: Vector3, forward: Vector3, speed = 0) {
  const up = direction.clone().normalize();
  surface.sample(up, sample);
  s.position.copy(up).multiplyScalar(groundRadius(sample.height));
  s.groundNormal.copy(sample.normal);
  s.heading.copy(forward).addScaledVector(sample.normal, -forward.dot(sample.normal)).normalize();
  s.boardUp.copy(sample.normal);
  s.velocity.copy(s.heading).multiplyScalar(speed);
  s.mode = 'ground'; s.fakie = false; s.surface = sample.kind;
  s.charge = 0; s.crouch = 0; s.jumpHeld = false; s.pushing = false; s.braking = false;
  s.air = emptyAir(); s.grind = null; s.manual = null; s.queuedManual = null; s.leftRail = null;
  s.bailTimer = 0; s.bailReason = null; s.spinRate = 0; s.spinTarget = null;
  s.safe.copy(s.position); s.safeHeading.copy(s.heading);
}

export function stepSkater(s: SkaterState, input: SkateInput, dt: number, surface: SkateSurface, events: SkateEvent[]) {
  s.clock += dt;
  if (s.queuedManual) { s.queuedManual.age += dt; if (s.queuedManual.age > T.manualWindow) s.queuedManual = null; }
  if (s.mode === 'bail') bailStep(s, dt, surface);
  else if (s.mode === 'grind') grindStep(s, input, dt, surface, events);
  else if (s.mode === 'air') airStep(s, input, dt, surface, events);
  else groundStep(s, input, dt, surface, events);
}

// ---------------------------------------------------------------------------
const up = new Vector3(), f = new Vector3(), r = new Vector3(), g = new Vector3(), next = new Vector3(), dir = new Vector3();
const tmp = new Vector3(), tmp2 = new Vector3(), turn = new Quaternion();

function ollieCharge(s: SkaterState, input: SkateInput, dt: number) {
  let pop = 0;
  if (input.jump) s.charge = Math.min(1, s.charge + dt / T.ollieChargeTime);
  else if (s.jumpHeld) { pop = T.ollieMin + (T.ollieMax - T.ollieMin) * s.charge; s.charge = 0; }
  else s.charge = 0;
  s.jumpHeld = input.jump;
  return pop;
}

function balanceStep(state: { balance: number; balanceVel: number; time: number; seed: number }, control: number, dt: number) {
  const noise = Math.sin(state.time * 2.1 + state.seed) * .6 + Math.sin(state.time * 5.3 + state.seed * 1.7) * .4;
  state.balanceVel += (state.balance * T.balanceDrift * (1 + state.time * T.balanceRamp) + noise * T.balanceNoise * (.6 + state.time * T.balanceRamp)) * dt;
  state.balanceVel += control * T.balanceControl * dt;
  state.balanceVel *= 1 - Math.min(1, T.balanceDamping * dt);
  state.balance += state.balanceVel * dt;
  state.time += dt;
  return Math.abs(state.balance) > 1;
}

function groundStep(s: SkaterState, input: SkateInput, dt: number, surface: SkateSurface, events: SkateEvent[]) {
  up.copy(s.position).normalize();
  const n = s.groundNormal;
  s.velocity.addScaledVector(n, -s.velocity.dot(n));
  f.copy(s.heading).addScaledVector(n, -s.heading.dot(n));
  if (f.lengthSq() < 1e-8) f.copy(s.velocity);
  f.normalize();
  const along = s.velocity.dot(f);
  if (Math.abs(along) > .35) s.fakie = along < 0;
  const travel = s.fakie ? -1 : 1;
  const speed0 = s.velocity.length();

  // Manual: start on request (rolling), balance with up/down, no pushing.
  if (!s.manual && input.manual && speed0 > 1) {
    s.manual = { id: input.manual, balance: (Math.sin(s.clock * 7.3) * .08), balanceVel: 0, time: 0, seed: s.clock * 3.1 };
    events.push({ type: 'manual-start', id: input.manual });
  }
  const manual = s.manual;

  // Tank steering: the board turns on the spot; faster riders turn a little wider.
  const rate = T.turnRate + (T.turnRateFast - T.turnRate) * clamp(speed0 / T.topSpeed, 0, 1);
  turn.setFromAxisAngle(n, -clamp(input.steer, -1, 1) * rate * (manual ? .7 : 1) * dt);
  f.applyQuaternion(turn); s.heading.applyQuaternion(turn);
  r.crossVectors(f, n).normalize();

  // Wheels grip: the velocity swings round to the board, keeping most of its energy.
  let vF = s.velocity.dot(f), vR = s.velocity.dot(r);
  const removed = vR * (1 - Math.exp(-T.grip * dt));
  const kept = vR * vR - (vR - removed) ** 2;
  vR -= removed;
  vF = (vF >= 0 ? 1 : -1) * Math.sqrt(vF * vF + Math.max(0, kept) * T.gripEfficiency);
  if (Math.abs(vF) < 1e-4 && Math.abs(s.velocity.dot(f)) < 1e-4) vF = 0;
  s.velocity.copy(f).multiplyScalar(vF).addScaledVector(r, vR);

  // Gravity along the surface; pushes and the foot brake on rideable ground.
  g.copy(up).multiplyScalar(-T.gravity);
  s.velocity.addScaledVector(g.addScaledVector(n, -g.dot(n)), dt);
  // Dropping down a transition pumps a little speed in, so bowl lines keep their energy.
  const incline = 1 - n.dot(up);
  if (incline > .06 && s.velocity.dot(up) < -.4) s.velocity.addScaledVector(tmp.copy(s.velocity).normalize(), T.pumpAccel * Math.min(1, incline * 3) * dt);
  const flat = n.dot(up) > .85;
  s.pushing = !manual && input.push && flat && Math.abs(s.velocity.dot(f)) < T.pushSpeed;
  if (s.pushing) s.velocity.addScaledVector(f, travel * T.pushAccel * dt);
  s.braking = !manual && input.brake && !input.push && flat;
  const speed = s.velocity.length();
  if (speed > 1e-4) {
    const mu = T.friction[s.surface] * T.gravity * Math.max(.2, n.dot(up));
    const decel = mu + T.drag * speed * speed + Math.max(0, speed - T.topSpeed) * T.overspeedDrag + (s.braking ? T.brakeDecel : 0);
    s.velocity.multiplyScalar(Math.max(0, 1 - decel * dt / speed));
  }

  if (manual) {
    const fell = balanceStep(manual, input.lean, dt);
    if (fell) { s.manual = null; events.push({ type: 'manual-end', id: manual.id, time: manual.time, bailed: true }); bail(s, 'balance', events); return; }
    if (s.velocity.length() < .8) { s.manual = null; events.push({ type: 'manual-end', id: manual.id, time: manual.time, bailed: false }); }
  }

  // Grind from the ground: pop straight onto a rail within reach.
  if (input.grind && tryGrind(s, input, surface, events, false)) return;

  const pop = ollieCharge(s, input, dt);
  s.crouch += ((input.jump ? .35 + .65 * s.charge : s.braking ? .25 : manual ? .2 : 0) - s.crouch) * (1 - Math.exp(-12 * dt));
  if (pop > 0 && s.manual) { events.push({ type: 'manual-end', id: s.manual.id, time: s.manual.time, bailed: false }); s.manual = null; }

  // Pop off the deck along its normal; on a steep wall the pop drives up the wall instead.
  const steep = 1 - n.dot(up);
  if (pop > 0) s.velocity.addScaledVector(tmp.copy(n).lerp(up, clamp(steep * 2, 0, 1)).normalize(), steep > .5 ? T.vertPop : pop);

  // Move, then follow the surface, meet a face, or leave it.
  const radius = s.position.length();
  next.copy(s.position).addScaledVector(s.velocity, dt);
  dir.copy(next).normalize();
  surface.sample(dir, sample);
  const ground = groundRadius(sample.height);
  const predicted = next.length();
  if (pop === 0 && ground - predicted > T.stepUp) { wallFace(s, dir, surface, events); return; }
  const radial = s.velocity.dot(dir);
  const fall = T.gravity + Math.max(0, s.velocity.lengthSq() - radial * radial) / radius;
  const away = s.velocity.dot(sample.normal);
  const launching = pop > 0 || (away > fall * Math.max(.2, dir.dot(sample.normal)) * dt + T.launchTolerance && predicted > ground - .05);
  if (launching && pop === 0 && sample.normal.dot(dir) < .72 && n.dot(up) > sample.normal.dot(dir) + .15 && s.velocity.length() < T.dropInSpeed && s.velocity.dot(dir) < .6) {
    // Rolling over a lip into a bowl: drop in along the wall instead of flying across it.
    const v = s.velocity.length();
    s.position.copy(dir).multiplyScalar(ground);
    s.velocity.addScaledVector(sample.normal, -s.velocity.dot(sample.normal));
    if (s.velocity.lengthSq() < 1e-6) s.velocity.copy(dir).multiplyScalar(-1).addScaledVector(sample.normal, dir.dot(sample.normal));
    s.velocity.setLength(v);
    settle(s, sample);
  } else if (launching) {
    launch(s, input, n, pop, events);
  } else {
    s.position.copy(dir).multiplyScalar(ground);
    const v = s.velocity.length(), into = s.velocity.dot(sample.normal);
    s.velocity.addScaledVector(sample.normal, -into);
    // Smooth transitions keep their speed; only real impacts lose the normal component.
    if (Math.abs(into) < .4 * v && s.velocity.lengthSq() > 1e-8) s.velocity.setLength(v);
    else if (Math.abs(into) > 1.2) events.push({ type: 'bump', speed: Math.abs(into) });
    settle(s, sample);
  }
  if (s.mode === 'ground') {
    if (sample.kind === 'water') { bail(s, 'water', events); return; }
    if (sample.normal.dot(dir) > .97 && sample.kind !== 'grass' && sample.kind !== 'sand') { s.safe.copy(s.position); s.safeHeading.copy(s.heading); }
  }
  collide(s, surface, events);
}

function settle(s: SkaterState, surfaceSample: SurfaceSample) {
  s.heading.addScaledVector(surfaceSample.normal, -s.heading.dot(surfaceSample.normal)).normalize();
  s.groundNormal.copy(surfaceSample.normal); s.boardUp.copy(surfaceSample.normal);
  s.surface = surfaceSample.kind;
}

/** A curb, ledge side or wall face ahead: stop against it and slide along it. */
function wallFace(s: SkaterState, at: Vector3, surface: SkateSurface, events: SkateEvent[]) {
  // The face normal points down the local height gradient, back toward the rider.
  f.copy(s.velocity).addScaledVector(at, -s.velocity.dot(at));
  if (f.lengthSq() < 1e-8) return;
  f.normalize(); r.crossVectors(f, at).normalize();
  const h = (dx: number, dz: number) => { tmp.copy(at).multiplyScalar(MAP_RADIUS).addScaledVector(f, dx).addScaledVector(r, dz).normalize(); return surface.sample(tmp, probe).height; };
  const gf = h(.08, 0) - h(-.12, 0), gr = h(.0, .1) - h(0, -.1);
  tmp2.copy(f).multiplyScalar(-gf).addScaledVector(r, -gr);
  if (tmp2.lengthSq() < 1e-8) tmp2.copy(f).negate();
  tmp2.normalize();
  const into = s.velocity.dot(tmp2);
  if (into >= 0) return;
  if (-into > T.wallBailSpeed) { bail(s, 'wall', events); return; }
  s.velocity.addScaledVector(tmp2, -(1 + T.wallRestitution) * into);
  alignToTravel(s);
  events.push({ type: 'bump', speed: -into });
}

/** After a glancing hit the board swings round to run along the face. */
function alignToTravel(s: SkaterState) {
  if (s.velocity.lengthSq() < .25) return;
  s.heading.copy(s.velocity).normalize().multiplyScalar(s.fakie ? -1 : 1);
}

function launch(s: SkaterState, input: SkateInput, takeoff: Vector3, pop: number, events: SkateEvent[]) {
  up.copy(s.position).normalize();
  const air = emptyAir();
  air.popped = pop > 0; air.fakieTakeoff = s.fakie; air.startRadius = s.position.length();
  // Vert: the takeoff wall is steep and the rider is heading up it.
  const steepness = Math.acos(clamp(takeoff.dot(up), -1, 1));
  if (steepness > T.vertAngle && s.velocity.dot(up) > .4) {
    air.vertNormal.copy(takeoff).addScaledVector(up, -takeoff.dot(up)).normalize();
    const speed = s.velocity.length();
    if (input.push) {
      // Holding up skips the vert lock: the rider keeps their natural momentum, with just
      // enough carry over the coping to land on the deck behind it. The carry is timed
      // from the rise, so a big transfer floats over rather than flying off the back.
      air.transfer = true;
      const hang = 2 * Math.max(0, s.velocity.dot(up)) / T.gravity;
      const carry = clamp(T.transferReach / Math.max(hang, .25), T.transferCarryMin, T.transferCarry);
      const outward = -s.velocity.dot(air.vertNormal);
      if (outward < carry) s.velocity.addScaledVector(air.vertNormal, outward - carry);
    } else {
      // The vert lock: every bit of horizontal motion goes, and the whole speed (with a
      // capped boost) drives straight up, so the rider comes back down onto the same wall.
      air.vert = true;
      s.velocity.copy(up).multiplyScalar(Math.min(T.vertMaxLaunch, speed * T.vertBoost));
    }
  } else {
    s.position.copy(next);
  }
  s.mode = 'air'; s.air = air;
  s.boardUp.copy(takeoff);
  s.pushing = false; s.braking = false;
  // Rolling off something mid-manual carries the combo on into the air.
  if (s.manual) { events.push({ type: 'manual-end', id: s.manual.id, time: s.manual.time, bailed: false }); s.manual = null; }
  events.push({ type: 'launch', vert: air.vert, popped: air.popped, speed: s.velocity.length() });
}

// ---------------------------------------------------------------------------
const a0 = new Vector3(), a1 = new Vector3(), axis = new Vector3(), prev = new Vector3();

function settleTarget(angle: number, rate: number, unit: number, back: number) {
  const k = angle / unit, low = Math.floor(k) * unit, high = Math.ceil(k) * unit;
  if (Math.abs(rate) < .5) return Math.round(k) * unit;
  if (rate > 0) return angle - low < back ? low : high;
  return high - angle < back ? high : low;
}
function airStep(s: SkaterState, input: SkateInput, dt: number, surface: SkateSurface, events: SkateEvent[]) {
  const air = s.air;
  a0.copy(s.position).normalize();
  prev.copy(s.position);
  const radius = s.position.length(), radial = s.velocity.dot(a0);
  s.velocity.addScaledVector(a0, -(T.gravity + Math.max(0, s.velocity.lengthSq() - radial * radial) / radius) * dt);
  // A vert air stays a vertical projectile over its takeoff spot; nothing else drags in the air.
  if (air.vert) { const rise = s.velocity.dot(a0); s.velocity.copy(a0).multiplyScalar(rise); }
  s.position.addScaledVector(s.velocity, dt);
  a1.copy(s.position).normalize();
  turn.setFromUnitVectors(a0, a1);
  s.heading.applyQuaternion(turn); s.boardUp.applyQuaternion(turn); air.vertNormal.applyQuaternion(turn);
  air.time += dt;

  // A late ollie just off a lip still pops.
  if (input.jump) s.charge = Math.min(1, s.charge + dt / T.ollieChargeTime);
  else {
    if (s.jumpHeld && s.charge > .05 && !air.popped && air.time <= T.coyoteTime) {
      if (air.vert) s.velocity.addScaledVector(a1.copy(s.position).normalize(), Math.min(T.vertPop, Math.max(0, T.vertMaxLaunch + T.vertPop - s.velocity.length())));
      else s.velocity.addScaledVector(s.boardUp, T.ollieMin + (T.ollieMax - T.ollieMin) * s.charge);
      air.popped = true;
    }
    s.charge = 0;
  }
  s.jumpHeld = input.jump;
  if (input.manual) s.queuedManual = { id: input.manual, age: 0 };

  // Spin with left/right; released spins finish at the next half turn.
  if (Math.abs(input.steer) > .1) {
    s.spinTarget = null;
    s.spinRate += (-clamp(input.steer, -1, 1) * T.spinRate - s.spinRate) * (1 - Math.exp(-T.spinResponse * dt));
  } else if (air.spin !== 0 || s.spinRate !== 0) {
    s.spinTarget ??= settleTarget(air.spin, s.spinRate, Math.PI, T.spinSettleBack);
    s.spinRate = clamp((s.spinTarget - air.spin) * T.spinSettle, -T.spinRate, T.spinRate);
  }
  const spin = s.spinRate * dt;
  air.spin += spin;
  if (spin !== 0) { turn.setFromAxisAngle(s.boardUp, spin); s.heading.applyQuaternion(turn); }

  // Flip tricks run to completion; grabs last as long as the button is held.
  if (input.flip && !air.flip) { air.flip = flipFor(input.steer, input.lean); air.flipTime = 0; }
  if (air.flip) {
    air.flipTime += dt;
    if (air.flipTime >= FLIPS[air.flip].time) { air.flips.push(air.flip); events.push({ type: 'flip', id: air.flip }); air.flip = null; air.flipTime = 0; }
  }
  if (input.grab && !air.grab && !air.flip) { air.grab = grabFor(input.steer, input.lean); air.grabTime = 0; }
  if (air.grab) {
    if (input.grab) air.grabTime += dt;
    else { air.grabs.push({ id: air.grab, time: air.grabTime }); air.grab = null; }
  }
  s.crouch += ((air.grab ? 1 : input.jump ? .35 + .65 * s.charge : .45) - s.crouch) * (1 - Math.exp(-10 * dt));

  // Ordinary airs level to the surface below, snapping parallel to it just before
  // touchdown; vert airs keep the wall's plane, which is where they land.
  surface.sample(a1, sample);
  const above = s.position.length() - groundRadius(sample.height);
  const falling = s.velocity.dot(a1) < 0;
  if (!air.vert && !air.flip) {
    const rate = falling && above < T.landSnapHeight ? T.landSnap : T.airLevel;
    axis.crossVectors(s.boardUp, sample.normal);
    const sine = axis.length();
    if (sine > 1e-5) { turn.setFromAxisAngle(axis.divideScalar(sine), Math.atan2(sine, s.boardUp.dot(sample.normal)) * (1 - Math.exp(-rate * dt))); s.boardUp.applyQuaternion(turn); s.heading.applyQuaternion(turn); }
  }

  if (input.grind && tryGrind(s, input, surface, events, true)) return;

  const ground = groundRadius(sample.height);
  const height = s.position.length() - ground;
  air.height = Math.max(air.height, s.position.length() - air.startRadius);
  if (sample.kind === 'water' && s.position.length() <= MAP_RADIUS + MAP_SEA_LEVEL + .15) { bail(s, 'water', events); return; }
  if (height <= 0) {
    // Flying into a wall face is a bounce, not a landing a metre up its side.
    if (ground - prev.length() > T.wallSnap && sample.normal.dot(a1) < .8) {
      s.position.copy(prev);
      tmp.copy(sample.normal).addScaledVector(a1, -sample.normal.dot(a1));
      if (tmp.lengthSq() > 1e-6) {
        tmp.normalize();
        const into = s.velocity.dot(tmp);
        if (into < 0) s.velocity.addScaledVector(tmp, -(1 + T.wallRestitution) * into);
      }
      return;
    }
    land(s, surface, events, ground);
    return;
  }
  collide(s, surface, events);
}

function summary(air: Air): AirSummary {
  const grabs = air.grab ? [...air.grabs, { id: air.grab, time: air.grabTime }] : [...air.grabs];
  return { time: air.time, spin: air.spin, popped: air.popped, vert: air.vert, height: air.height, fakieTakeoff: air.fakieTakeoff, flips: [...air.flips], grabs };
}

function land(s: SkaterState, surface: SkateSurface, events: SkateEvent[], ground: number) {
  const air = s.air;
  s.position.normalize().multiplyScalar(ground);
  const n = sample.normal;
  if (air.flip && air.flipTime / FLIPS[air.flip].time < T.flipLandFraction) { bail(s, 'flip', events); return; }
  const travel = tmp.copy(s.velocity).addScaledVector(n, -s.velocity.dot(n));
  const slide = travel.length();
  const nose = tmp2.copy(s.heading).addScaledVector(n, -s.heading.dot(n));
  if (nose.lengthSq() < 1e-6) nose.copy(travel);
  nose.normalize();
  if (slide < .3) travel.copy(nose); else travel.divideScalar(slide);
  const angle = nose.angleTo(travel), yaw = Math.min(angle, Math.PI - angle);
  if (yaw > T.landYaw) { bail(s, 'landing', events); return; }
  const fakie = angle > Math.PI / 2;
  // Inertia: on a transition the whole falling speed carries on along the ramp; on the
  // flat the rider keeps their rolling speed and the drop is absorbed.
  const onRamp = n.dot(up.copy(s.position).normalize()) < T.rampLanding;
  s.velocity.copy(travel).multiplyScalar(onRamp ? Math.max(slide, s.velocity.length()) : slide);
  const perfect = yaw <= T.perfectYaw && s.boardUp.angleTo(n) <= T.perfectTilt;
  s.heading.copy(travel).multiplyScalar(fakie ? -1 : 1);
  s.fakie = fakie;
  s.boardUp.copy(n); s.groundNormal.copy(n); s.surface = sample.kind;
  s.mode = 'ground';
  s.spinRate = 0; s.spinTarget = null;
  const done = summary(air);
  s.air = emptyAir();
  const manual = s.queuedManual?.id ?? null;
  s.queuedManual = null;
  if (manual) { s.manual = { id: manual, balance: 0, balanceVel: 0, time: 0, seed: s.clock * 2.7 }; }
  events.push({ type: 'land', air: done, fakie, manual, speed: s.velocity.length(), perfect });
  if (manual) events.push({ type: 'manual-start', id: manual });
}

// ---------------------------------------------------------------------------
const q = new Vector3(), qa = new Vector3(), seg = new Vector3(), off = new Vector3(), qUp = new Vector3();

function segment(line: GrindLine, i: number): [Vector3, Vector3] | null {
  const n = line.points.length;
  if (line.closed) return [line.points[((i % n) + n) % n], line.points[(((i + 1) % n) + n) % n]];
  if (i < 0 || i >= n - 1) return null;
  return [line.points[i], line.points[i + 1]];
}

function tryGrind(s: SkaterState, input: SkateInput, surface: SkateSurface, events: SkateEvent[], fromAir: boolean) {
  const lines = surface.grindLines(s.position, 2);
  let best: { line: GrindLine; i: number; t: number; score: number; point: Vector3 } | null = null;
  for (const line of lines) {
    if (s.leftRail?.id === line.id && s.clock - s.leftRail.time < T.grindRecatch) continue;
    const count = line.closed ? line.points.length : line.points.length - 1;
    for (let i = 0; i < count; i++) {
      const pair = segment(line, i)!;
      seg.subVectors(pair[1], pair[0]);
      const length = seg.length();
      if (length < 1e-4) continue;
      seg.divideScalar(length);
      const t = clamp(off.subVectors(s.position, pair[0]).dot(seg), 0, length);
      // Past an open end and heading away from it is leaving the rail, not catching it.
      if (!line.closed) {
        const along = s.velocity.dot(seg);
        if ((i === 0 && t <= 1e-3 && along < -.3) || (i === count - 1 && t >= length - 1e-3 && along > .3)) continue;
      }
      q.copy(pair[0]).addScaledVector(seg, t);
      qUp.copy(q).normalize();
      off.subVectors(s.position, q);
      const vertical = off.dot(qUp), horizontal = off.addScaledVector(qUp, -vertical).length();
      const ok = horizontal <= T.grindCatch && (fromAir ? vertical >= -T.grindBelow && vertical <= T.grindAbove : vertical >= -T.grindReach && vertical <= .25);
      if (!ok) continue;
      const score = horizontal + Math.abs(vertical) * .3;
      if (!best || score < best.score) best = { line, i, t, score, point: q.clone() };
    }
  }
  if (!best) return false;
  const pair = segment(best.line, best.i)!;
  seg.subVectors(pair[1], pair[0]).normalize();
  const along = s.velocity.dot(seg);
  const dirSign: 1 | -1 = (Math.abs(along) > .3 ? along : s.heading.dot(seg)) >= 0 ? 1 : -1;
  qUp.copy(best.point).normalize();
  tmp.copy(s.velocity).addScaledVector(qUp, -s.velocity.dot(qUp));
  const approach = tmp.lengthSq() > .25 ? tmp.angleTo(seg.clone().multiplyScalar(dirSign)) : 0;
  const speed = Math.max(T.grindMinSpeed, Math.abs(along) + tmp.length() * .25);
  const trick = grindFor(input.steer, input.lean, approach);
  const airDone = fromAir ? summary(s.air) : null;
  if (fromAir && s.air.flip && s.air.flipTime / FLIPS[s.air.flip].time < T.flipLandFraction) return false;
  s.grind = { line: best.line, segment: best.i, t: best.t, dir: dirSign, speed, trick, balance: Math.sin(s.clock * 9.1) * .12, balanceVel: 0, time: 0, seed: s.clock * 1.9, fakie: s.fakie };
  s.mode = 'grind'; s.air = emptyAir(); s.manual = null;
  s.spinRate = 0; s.spinTarget = null;
  s.position.copy(best.point).addScaledVector(qUp, T.boardOffset);
  events.push({ type: 'grind-start', trick, line: best.line, air: airDone });
  return true;
}

function grindStep(s: SkaterState, input: SkateInput, dt: number, surface: SkateSurface, events: SkateEvent[]) {
  const grind = s.grind!;
  let pair = segment(grind.line, grind.segment);
  if (!pair) { leaveRail(s, 0, events, false); return; }
  seg.subVectors(pair[1], pair[0]);
  let length = seg.length();
  seg.divideScalar(length || 1).multiplyScalar(grind.dir);
  up.copy(s.position).normalize();
  // Gravity along a sloped rail, and a little friction.
  grind.speed += -T.gravity * up.dot(seg) * dt - T.grindFriction * dt;
  if (grind.speed < .45) { leaveRail(s, 0, events, false); return; }
  let travel = grind.speed * dt * grind.dir;
  grind.t += travel;
  // Walk across segment ends; an open end throws the rider off into the air.
  for (let guard = 0; guard < 8 && (grind.t > length || grind.t < 0); guard++) {
    const forward = grind.t > length;
    const overshoot = forward ? grind.t - length : -grind.t;
    grind.segment += forward ? 1 : -1;
    pair = segment(grind.line, grind.segment);
    if (!pair) { grind.segment -= forward ? 1 : -1; leaveRail(s, .9, events, false); return; }
    length = pair[1].distanceTo(pair[0]);
    grind.t = forward ? overshoot : length - overshoot;
    travel = 0;
  }
  if (grind.line.closed) grind.segment = ((grind.segment % grind.line.points.length) + grind.line.points.length) % grind.line.points.length;
  pair = segment(grind.line, grind.segment)!;
  seg.subVectors(pair[1], pair[0]);
  length = seg.length();
  seg.divideScalar(length || 1);
  qa.copy(pair[0]).addScaledVector(seg, grind.t);
  qUp.copy(qa).normalize();
  s.position.copy(qa).addScaledVector(qUp, T.boardOffset);
  seg.multiplyScalar(grind.dir);
  s.velocity.copy(seg).multiplyScalar(grind.speed);
  if (GRINDS[grind.trick].across) s.heading.crossVectors(seg, qUp).normalize();
  else s.heading.copy(seg).multiplyScalar(grind.fakie ? -1 : 1);
  s.boardUp.copy(qUp); s.groundNormal.copy(qUp);
  s.crouch += (.55 - s.crouch) * (1 - Math.exp(-10 * dt));

  if (balanceStep(grind, clamp(input.steer, -1, 1), dt)) { leaveRail(s, 0, events, true); return; }
  const pop = ollieCharge(s, input, dt);
  if (pop > 0) leaveRail(s, pop, events, false, true);
}

function leaveRail(s: SkaterState, lift: number, events: SkateEvent[], bailed: boolean, popped = false) {
  const grind = s.grind!;
  events.push({ type: 'grind-end', trick: grind.trick, time: grind.time, line: grind.line, bailed });
  s.grind = null;
  s.leftRail = { id: grind.line.id, time: s.clock };
  if (bailed) { bail(s, 'balance', events); return; }
  up.copy(s.position).normalize();
  s.velocity.addScaledVector(up, lift);
  // Nudge clear of the rail so the landing is on the ground beside or past it.
  s.mode = 'air';
  s.air = emptyAir();
  s.air.popped = popped; s.air.startRadius = s.position.length(); s.air.fakieTakeoff = s.fakie;
  s.heading.addScaledVector(up, -s.heading.dot(up)).normalize();
  if (GRINDS[grind.trick].across) s.heading.copy(s.velocity).addScaledVector(up, -s.velocity.dot(up)).normalize().multiplyScalar(grind.fakie ? -1 : 1);
  s.boardUp.copy(up);
  s.position.addScaledVector(up, .06);
  events.push({ type: 'launch', vert: false, popped, speed: s.velocity.length() });
}

// ---------------------------------------------------------------------------
function bail(s: SkaterState, reason: 'wall' | 'landing' | 'flip' | 'balance' | 'water' | 'obstacle', events: SkateEvent[]) {
  if (s.manual) s.manual = null;
  s.mode = 'bail'; s.bailTimer = T.bailTime; s.bailReason = reason;
  s.grind = null; s.air = emptyAir(); s.charge = 0; s.crouch = 0; s.pushing = false; s.braking = false;
  s.spinRate = 0; s.spinTarget = null;
  events.push({ type: 'bail', reason });
}

function bailStep(s: SkaterState, dt: number, surface: SkateSurface) {
  s.bailTimer -= dt;
  up.copy(s.position).normalize();
  s.velocity.addScaledVector(up, -s.velocity.dot(up)).multiplyScalar(Math.exp(-T.bailFriction * dt));
  dir.copy(s.position).addScaledVector(s.velocity, dt).normalize();
  surface.sample(dir, sample);
  if (sample.kind === 'water' || sample.height - (s.position.length() - MAP_RADIUS) > .5) s.velocity.set(0, 0, 0);
  else s.position.copy(dir).multiplyScalar(groundRadius(sample.height));
  if (s.bailTimer <= 0) {
    surface.sample(up.copy(s.position).normalize(), sample);
    // Get back up where you fell, on flat footing, unless it is water or a wall.
    const facing = tmp.copy(s.heading).addScaledVector(up, -s.heading.dot(up));
    if (sample.kind === 'water' || sample.normal.dot(up) < .85) placeSkater(s, surface, tmp2.copy(s.safe).normalize(), s.safeHeading, 0);
    else placeSkater(s, surface, up, facing.lengthSq() > 1e-6 ? facing : s.safeHeading, 0);
  }
}

function collide(s: SkaterState, surface: SkateSurface, events: SkateEvent[]) {
  up.copy(s.position).normalize();
  const hit = surface.obstacle(s.position, up, T.riderRadius, T.riderHalfHeight);
  if (!hit) return;
  s.position.addScaledVector(hit.normal, hit.depth);
  const into = s.velocity.dot(hit.normal);
  if (into >= 0) return;
  if (-into > T.wallBailSpeed) { bail(s, 'obstacle', events); return; }
  s.velocity.addScaledVector(hit.normal, -(1 + T.wallRestitution) * into);
  if (s.mode === 'ground') alignToTravel(s);
  events.push({ type: 'bump', speed: -into });
}

/** Board visual: flip progress, for the rider model. */
export function flipPose(s: SkaterState) {
  const air = s.air;
  if (!air.flip) return null;
  const spec = FLIPS[air.flip], t = Math.min(1, air.flipTime / spec.time);
  return { roll: spec.roll * t * Math.PI * 2, yaw: spec.yaw * t * Math.PI * 2, pitch: spec.pitch * t * Math.PI * 2 };
}
