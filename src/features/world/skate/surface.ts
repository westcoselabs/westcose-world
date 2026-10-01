/** The world as the skateboard feels it: the same analytic surfaces that carry the walker
 * and draw the terrain, with exact normals in the park, a smooth ramp down the grand
 * stairs, curb-aware normals in town, building and fence solids, and every grind line. */
import { Vector3 } from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL, mapCoordinates, mapDirection, mapFrame } from '../data/world-map';
import { capsuleContact, upperSupportAt } from '../runtime/planet-collision';
import { GRAND_STAIRS, GRAND_STAIR_TREAD, nearSkatepark, PARK_FRAME, parkLocal, parkSurfaceLocal, skateparkGrindLines } from '../data/skatepark-layout';
import { DOWNTOWN_FURNITURE, downtownCells, WALK_LEVEL } from '../data/downtown-layout';
import { TOWN_ROUTES } from '../data/town-layout';
import type { GrindLine, ObstacleHit, SkateSurface, SurfaceSample } from './physics';
import type { SkateGround } from './tuning';

const STREETS = new Set(['main-st', 'pier-st', 'palm-ave']);
const ROUTE_MATERIAL = new Map(TOWN_ROUTES.map(route => [route.id, route.material]));
const e = new Vector3(), n = new Vector3(), d = new Vector3();

function materialOf(id: string | undefined, kind: string, height: number, x: number, z: number): SkateGround {
  if (kind === 'water') return 'water';
  if (kind === 'floor') return 'floor';
  if (kind === 'pier') return 'wood';
  if (id) {
    if (STREETS.has(id)) return 'asphalt';
    if (id.startsWith('skatepark') || id === 'grand-stairs') return 'concrete';
    const material = ROUTE_MATERIAL.get(id);
    if (material === 'timber') return 'wood';
    if (material === 'dirt') return 'dirt';
    if (material === 'sand') return 'sand';
    if (material) return 'concrete';
    return 'paving';
  }
  // Open ground: the beaches are sand, everything else is grass underfoot.
  return height < .6 && (z < -17 || x < -66) ? 'sand' : 'grass';
}

/** Height above the base sphere for walking support, with the stairs as a smooth ramp. */
function heightAt(direction: Vector3) {
  const { x, z } = mapCoordinates(direction);
  const stair = x < GRAND_STAIRS.foot + .5 && x > GRAND_STAIRS.top - .5 ? stairRamp(x, z) : null;
  if (stair !== null) return stair;
  return upperSupportAt(direction).radius - MAP_RADIUS;
}
function stairRamp(x: number, z: number) {
  const s = GRAND_STAIRS;
  if (x > s.foot || x < s.top || Math.abs(z) > s.halfWidth) return null;
  return s.base + s.rise * (.5 + (s.foot - x) / (s.foot - s.top) * (s.count - .5));
}

/** Finite-difference normal that ignores curb and ledge edges: where the two one-sided
 * slopes disagree sharply, the gentler side is the surface the wheels are actually on. */
function townNormal(direction: Vector3, height: number, target: Vector3) {
  const { x, z } = mapCoordinates(direction), frame = mapFrame(x, z);
  const span = .14, k = Math.max(.2, Math.cos(x / MAP_RADIUS));
  const at = (dx: number, dz: number) => heightAt(mapDirection(x + dx, z + dz / k));
  const slope = (plus: number, minus: number) => {
    const a = (plus - height) / span, b = (height - minus) / span;
    const s = Math.abs(a - b) > .45 ? (Math.abs(a) < Math.abs(b) ? a : b) : (a + b) / 2;
    return Math.max(-3, Math.min(3, s));
  };
  const gx = slope(at(span, 0), at(-span, 0)), gz = slope(at(0, span), at(0, -span));
  return target.copy(frame.up).addScaledVector(frame.east, -gx).addScaledVector(frame.north, -gz).normalize();
}

// ---------------------------------------------------------------------------
// Grind lines: the park's lines, merged street curbs and the plaza benches.
function curbLines(): GrindLine[] {
  const { X, Z, kind } = downtownCells();
  type Run = { axis: 'x' | 'z'; fixed: number; from: number; to: number };
  const runs: Run[] = [];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    if (kind[i][j] !== 'walk') continue;
    if (kind[i - 1]?.[j] === 'road') runs.push({ axis: 'z', fixed: X[i], from: Z[j], to: Z[j + 1] });
    if (kind[i + 1]?.[j] === 'road') runs.push({ axis: 'z', fixed: X[i + 1], from: Z[j], to: Z[j + 1] });
    if (kind[i][j - 1] === 'road') runs.push({ axis: 'x', fixed: Z[j], from: X[i], to: X[i + 1] });
    if (kind[i][j + 1] === 'road') runs.push({ axis: 'x', fixed: Z[j + 1], from: X[i], to: X[i + 1] });
  }
  // Merge touching collinear runs so a curb grind carries through cell boundaries.
  runs.sort((a, b) => a.axis.localeCompare(b.axis) || a.fixed - b.fixed || a.from - b.from);
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.axis === run.axis && Math.abs(last.fixed - run.fixed) < 1e-6 && run.from <= last.to + 1e-6) last.to = Math.max(last.to, run.to);
    else merged.push({ ...run });
  }
  return merged.map((run, i) => {
    const count = Math.max(1, Math.ceil(run.to - run.from));
    const points = Array.from({ length: count + 1 }, (_, k) => {
      const t = run.from + (run.to - run.from) * k / count;
      return run.axis === 'x' ? mapDirection(t, run.fixed).multiplyScalar(MAP_RADIUS + WALK_LEVEL) : mapDirection(run.fixed, t).multiplyScalar(MAP_RADIUS + WALK_LEVEL);
    });
    return { id: `curb:${i}`, name: 'Curb', kind: 'curb' as const, closed: false, points };
  });
}
function benchLines(): GrindLine[] {
  return DOWNTOWN_FURNITURE.filter(item => item.kind === 'bench').map((item, i) => {
    const frame = mapFrame(item.x, item.z, WALK_LEVEL), yaw = item.yaw ?? 0;
    const along = frame.east.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(frame.north, Math.sin(yaw));
    const seat = frame.position.clone().addScaledVector(frame.up, .47);
    return { id: `bench:${i}`, name: 'Bench', kind: 'bench' as const, closed: false, points: [seat.clone().addScaledVector(along, -.8), seat.clone().addScaledVector(along, .8)] };
  });
}

let index: Map<number, GrindLine[]> | null = null;
const CELL = 6;
const cellKey = (x: number, z: number) => (Math.floor(x / CELL) + 64) + (Math.floor(z / CELL) + 128) * 256;
export function allGrindLines(): GrindLine[] { return [...skateparkGrindLines(), ...curbLines(), ...benchLines()]; }
function grindIndex() {
  if (index) return index;
  index = new Map();
  for (const line of allGrindLines()) {
    const keys = new Set<number>();
    for (const p of line.points) { const c = mapCoordinates(p); for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) keys.add(cellKey(c.x + dx * CELL * .5, c.z + dz * CELL * .5)); }
    for (const key of keys) { const bucket = index.get(key); if (bucket) bucket.push(line); else index.set(key, [line]); }
  }
  return index;
}

const center = new Vector3();
export const WORLD_SKATE: SkateSurface = {
  sample(direction: Vector3, target: SurfaceSample) {
    const { x, z } = mapCoordinates(direction);
    if (nearSkatepark(x, z)) {
      const local = parkLocal(direction), park = parkSurfaceLocal(local.u, local.v);
      if (park) {
        // Exact normals from the park's analytic slopes, in its local tangent frame.
        d.copy(direction).normalize();
        e.copy(PARK_FRAME.east).addScaledVector(d, -PARK_FRAME.east.dot(d)).normalize();
        n.copy(PARK_FRAME.north).addScaledVector(d, -PARK_FRAME.north.dot(d)).normalize();
        target.height = park.height; target.kind = 'concrete';
        target.normal.copy(d).addScaledVector(e, -park.gu).addScaledVector(n, -park.gv).normalize();
        return target;
      }
    }
    const ramp = x < GRAND_STAIRS.foot + .5 && x > GRAND_STAIRS.top - .5 ? stairRamp(x, z) : null;
    if (ramp !== null) {
      const frame = mapFrame(x, z);
      target.height = ramp; target.kind = 'concrete';
      target.normal.copy(frame.up).addScaledVector(frame.east, GRAND_STAIRS.rise / GRAND_STAIR_TREAD).normalize();
      return target;
    }
    const support = upperSupportAt(direction);
    target.height = support.radius - MAP_RADIUS;
    target.kind = materialOf(support.id, support.kind, target.height, x, z);
    if (support.kind === 'water') { target.height = Math.max(target.height, MAP_SEA_LEVEL); target.normal.copy(direction).normalize(); return target; }
    townNormal(direction, target.height, target.normal);
    return target;
  },
  obstacle(position: Vector3, up: Vector3, radius: number, halfHeight: number): ObstacleHit | null {
    center.copy(position).addScaledVector(up, halfHeight + .12);
    const hit = capsuleContact(center, radius, halfHeight);
    if (!hit) return null;
    hit.normal.addScaledVector(up, -hit.normal.dot(up));
    if (hit.normal.lengthSq() < 1e-8) return null;
    hit.normal.normalize();
    return hit;
  },
  grindLines(position: Vector3) {
    const chart = mapCoordinates(position);
    return grindIndex().get(cellKey(chart.x, chart.z)) ?? [];
  },
};
