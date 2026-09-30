/** One run as a course: progress down the centerline, slalom gates, tokens,
 * checkpoints, near misses, the finish line and leaving the run. Pure (no scene). */
import { Vector3 } from 'three';
import { MAP_RADIUS, mapCoordinates, mapDirection, mapPoint } from '../data/world-map';
import { groundSurfaceAt } from '../data/town-surfaces';
import { runPointAt, runWidthAt, type SkiRun } from '../data/ski-runs';
import { obstacleDistance, obstaclesNear } from '../data/ski-obstacles';
import { SNOWBOARD as T } from './tuning';

/** Half the gap between a gate's poles. */
export const GATE_HALF_WIDTH = 2.1;
/** Tokens are collected within this distance of the rider's chest. */
export const TOKEN_RADIUS = 1.3;
export const CHEST_HEIGHT = .9;
export const NEAR_MISS_SPEED = 10;
/** Riding further than this beyond the groomed edge starts the out-of-bounds clock. */
export const OFF_COURSE_MARGIN = 9;
const FINISH_MARGIN = 2.5;

export type CourseEvent =
  | { type: 'gate'; index: number; passed: boolean }
  | { type: 'token'; index: number; count: number; total: number }
  | { type: 'checkpoint'; index: number }
  | { type: 'near-miss'; obstacleId: string }
  | { type: 'finish' };
export type RunLocation = { index: number; s: number; lateral: number; distance: number };

function metric(x: number, h: number) { const k = (MAP_RADIUS + h) / MAP_RADIUS; return { x: k, z: Math.cos(x / MAP_RADIUS) * k }; }

/** Nearest centerline point of a run (physical metres), searched around a sample index hint. */
export function locateOnRun(run: SkiRun, x: number, z: number, hint = -1, window = 80): RunLocation {
  const samples = run.samples;
  const from = hint < 0 ? 0 : Math.max(0, hint - window), to = hint < 0 ? samples.length - 2 : Math.min(samples.length - 2, hint + window);
  let best: RunLocation = { index: from, s: samples[from].s, lateral: 0, distance: Infinity };
  for (let i = from; i <= to; i++) {
    const a = samples[i], b = samples[i + 1], m = metric((a.x + b.x) / 2, (a.h + b.h) / 2);
    const dx = (b.x - a.x) * m.x, dz = (b.z - a.z) * m.z, px = (x - a.x) * m.x, pz = (z - a.z) * m.z;
    const lengthSq = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / lengthSq));
    const distance = Math.hypot(px - dx * t, pz - dz * t);
    if (distance < best.distance) best = { index: i, s: a.s + (b.s - a.s) * t, lateral: (dx * pz - dz * px) / Math.sqrt(lengthSq), distance };
  }
  return best;
}

/** A start or respawn pose on the run centerline, facing downhill. */
export function runPose(run: SkiRun, s: number) {
  const point = runPointAt(run, s, 0), ahead = runPointAt(run, Math.min(run.length, s + 1.5), 0);
  const direction = mapDirection(point.x, point.z);
  const forward = mapDirection(ahead.x, ahead.z).sub(direction);
  forward.addScaledVector(direction, -forward.dot(direction)).normalize();
  return { direction, forward, x: point.x, z: point.z };
}

const chest = new Vector3();
export class RunCourse {
  readonly run: SkiRun;
  /** Planet-centred token positions. */
  readonly tokenPoints: readonly Vector3[];
  location: RunLocation = { index: 0, s: 0, lateral: 0, distance: 0 };
  /** Furthest distance reached on the run. */
  progress = 0;
  /** Index into run.checkpoints of the last one passed. */
  checkpoint = 0;
  /** Per gate: null until reached, then passed or missed. */
  gates: (boolean | null)[];
  tokens: boolean[];
  tokenCount = 0;
  nearMisses = new Set<string>();
  /** Seconds spent out of bounds. */
  offCourse = 0;
  /** Seconds spent stopped. */
  stuck = 0;
  finished = false;

  constructor(run: SkiRun) {
    this.run = run;
    this.tokenPoints = run.tokens.map(token => {
      const point = runPointAt(run, token.s, token.offset);
      return mapPoint(point.x, point.z, groundSurfaceAt(point.x, point.z).height + token.lift);
    });
    this.gates = run.gates.map(() => null);
    this.tokens = run.tokens.map(() => false);
  }

  reset() {
    this.location = { index: 0, s: 0, lateral: 0, distance: 0 };
    this.progress = 0; this.checkpoint = 0; this.tokenCount = 0;
    this.gates = this.run.gates.map(() => null);
    this.tokens = this.run.tokens.map(() => false);
    this.nearMisses.clear();
    this.offCourse = 0; this.stuck = 0; this.finished = false;
  }

  /** Re-anchor after a teleport (start, respawn or debug spawn). */
  relocate(position: Vector3) {
    const { x, z } = mapCoordinates(position);
    this.location = locateOnRun(this.run, x, z);
    this.offCourse = 0; this.stuck = 0;
  }

  /** Respawn distance: the last checkpoint passed. */
  respawnDistance() { return this.run.checkpoints[this.checkpoint] ?? 0; }

  outOfBounds() { return this.offCourse >= T.outOfBoundsTime; }

  update(position: Vector3, speed: number, airborne: boolean, crashed: boolean, dt: number, events: CourseEvent[]) {
    const { x, z } = mapCoordinates(position);
    const previous = this.location.s;
    const location = this.location = locateOnRun(this.run, x, z, this.location.index);
    const half = runWidthAt(this.run, location.s) / 2;
    const onCourse = location.distance <= half + OFF_COURSE_MARGIN;
    // Gates are judged as the rider crosses their line, airborne or not.
    for (let i = 0; i < this.run.gates.length; i++) {
      const gate = this.run.gates[i];
      if (this.gates[i] !== null || previous >= gate.s || location.s < gate.s) continue;
      const passed = onCourse && Math.abs(location.lateral - gate.offset) <= GATE_HALF_WIDTH;
      this.gates[i] = passed;
      events.push({ type: 'gate', index: i, passed });
    }
    if (!crashed) {
      const r = position.length();
      chest.copy(position).multiplyScalar((r + CHEST_HEIGHT) / r);
      for (let i = 0; i < this.tokenPoints.length; i++) {
        if (this.tokens[i] || Math.abs(this.run.tokens[i].s - location.s) > 8) continue;
        if (chest.distanceTo(this.tokenPoints[i]) > TOKEN_RADIUS) continue;
        this.tokens[i] = true; this.tokenCount++;
        events.push({ type: 'token', index: i, count: this.tokenCount, total: this.tokenPoints.length });
      }
      if (speed >= NEAR_MISS_SPEED) {
        const height = r - MAP_RADIUS;
        for (const obstacle of obstaclesNear(x, z)) {
          if (obstacle.nearMiss <= 0 || this.nearMisses.has(obstacle.id) || height - obstacle.ground > obstacle.height) continue;
          const distance = obstacleDistance(obstacle, x, z, height);
          if (distance < obstacle.nearMiss && distance > obstacle.radius + T.riderRadius) {
            this.nearMisses.add(obstacle.id);
            events.push({ type: 'near-miss', obstacleId: obstacle.id });
          }
        }
      }
    }
    if (onCourse && !crashed) {
      this.progress = Math.max(this.progress, location.s);
      const checkpoints = this.run.checkpoints;
      while (this.checkpoint + 1 < checkpoints.length && location.s >= checkpoints[this.checkpoint + 1] && location.distance <= half + 1.5) {
        this.checkpoint++;
        events.push({ type: 'checkpoint', index: this.checkpoint });
      }
    }
    this.offCourse = onCourse ? 0 : this.offCourse + dt;
    this.stuck = speed < .4 && !airborne && !crashed && !this.finished ? this.stuck + dt : 0;
    if (!this.finished && !crashed && location.s >= this.run.length - FINISH_MARGIN && location.distance <= half + 6) {
      this.finished = true;
      events.push({ type: 'finish' });
    }
  }
}
