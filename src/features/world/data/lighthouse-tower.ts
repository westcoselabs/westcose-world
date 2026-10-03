/** The climbable lighthouse: tower dimensions, the exterior spiral stair and the balcony,
 * and the walking/camera queries that read them. Everything is in the tower's own frame:
 * origin on the lighthouse axis at its terrace, height up the axis. Azimuths are degrees
 * anticlockwise from local east seen from above; local east/north are the sea-cave frame's
 * (the same placed lighthouse frame). The tower's axis is radial at its foot, so every
 * radial line from the planet centre keeps one azimuth. Pure data and maths.
 *
 * Tower-local (x, y, z) matches LIGHTHOUSE_FRAME: x east, y up the axis, z = -north. */
import { Vector3 } from 'three';
import { MAP_RADIUS, mapCoordinates } from './world-map';
import { PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import { SEA_CAVE_FRAME } from './sea-cave';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;

export const LIGHTHOUSE_TOWER = {
  /** Terrace (foundation pad) elevation above the base sphere. */
  terrace: PENINSULA_LIGHTHOUSE.elevation,
  /** Sixteen-sided shaft, tapering from the base to the gallery. */
  sides: 16, baseRadius: 2.5, topRadius: 1.8,
  /** Gallery (balcony) floor height above the terrace. */
  gallery: 19.8,
  balcony: { outer: 3.3, rail: 3.25, slab: .3, railHeight: 1.05 },
  lantern: { radius: 1.45, top: 22.6 },
  roof: 23.9, finial: 24.3,
  /** Round foundation pad on the terrace (peninsula-layout.ts shapes the ground). */
  pad: { radius: PENINSULA_LIGHTHOUSE.pad, skirt: PENINSULA_LIGHTHOUSE.skirt },
  stair: {
    width: 1.3,
    /** Full turns from the terrace to the gallery. */
    turns: 1.5,
    /** Azimuth of the stair foot: toward the trail's arrival from the north-west. */
    start: 129,
    /** -1 climbs clockwise seen from above. */
    spin: -1,
    /** Visual tread rise; the walked surface is a smooth ramp beneath the tread noses. */
    tread: .18,
    /** Clear height needed beneath anything overhead (stair or balcony). */
    headroom: 2.1,
    /** Thickness of the stair's stone slab under its walking surface. */
    slab: .35,
  },
} as const;

export const STAIR_RISE = LIGHTHOUSE_TOWER.gallery;
export const STAIR_SWEEP = LIGHTHOUSE_TOWER.stair.turns * 360;

/** Shaft radius at a height above the terrace (the lantern room above the gallery). */
export function towerRadiusAt(height: number) {
  const t = LIGHTHOUSE_TOWER;
  if (height > t.gallery) return height <= t.lantern.top ? t.lantern.radius : 0;
  return t.baseRadius + (t.topRadius - t.baseRadius) * clamp(height / t.gallery);
}

/** The stair at a fraction of its climb: azimuth, height and its band out from the shaft. */
export function stairAt(fraction: number) {
  const f = clamp(fraction), height = f * STAIR_RISE, s = LIGHTHOUSE_TOWER.stair;
  const inner = towerRadiusAt(height), outer = inner + s.width;
  return { fraction: f, height, azimuth: s.start + s.spin * f * STAIR_SWEEP, inner, outer, centre: (inner + outer) / 2 };
}

/** Tower-local point on the stair: `lateral` -1 at the wall, 1 at the outer edge. */
export function stairPoint(fraction: number, lateral = 0) {
  const at = stairAt(fraction), r = at.centre + lateral * (at.outer - at.inner) / 2;
  return { x: Math.cos(at.azimuth * DEG) * r, y: at.height, z: -Math.sin(at.azimuth * DEG) * r, ...at };
}

/** Run along the stair centreline and its slope in degrees. */
export function stairSlope() {
  let run = 0;
  const steps = 400;
  for (let i = 0; i < steps; i++) {
    const a = stairPoint(i / steps), b = stairPoint((i + 1) / steps);
    run += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return { run, slope: Math.atan2(STAIR_RISE, run) / DEG };
}

/** Arc (degrees, back from the top) where the stair passes beneath the balcony with less
 * than headroom: the balcony floor is left open there as a hatch. */
export const HATCH_SWEEP = (LIGHTHOUSE_TOWER.stair.headroom + LIGHTHOUSE_TOWER.balcony.slab + .2) / STAIR_RISE * STAIR_SWEEP;
/** Azimuth of the stair's top, where it meets the balcony floor. */
export const STAIR_END_AZIMUTH = LIGHTHOUSE_TOWER.stair.start + LIGHTHOUSE_TOWER.stair.spin * STAIR_SWEEP;
/** True where the balcony floor is open above the stair's last stretch. */
export const inHatch = (azimuth: number) => wrap((azimuth - STAIR_END_AZIMUTH) * -LIGHTHOUSE_TOWER.stair.spin) <= HATCH_SWEEP;

/** Heights (above the terrace) where the stair passes over an azimuth, lowest first. */
export function stairHeightsAt(azimuth: number) {
  const s = LIGHTHOUSE_TOWER.stair, heights: number[] = [];
  for (let offset = wrap((azimuth - s.start) * s.spin); offset <= STAIR_SWEEP + 1e-9; offset += 360) heights.push(offset / STAIR_SWEEP * STAIR_RISE);
  return heights;
}

// ---------------------------------------------------------------------------
// World placement and queries.

const AXIS = SEA_CAVE_FRAME.center, EAST = SEA_CAVE_FRAME.east, NORTH = SEA_CAVE_FRAME.north;
/** Distance from the planet centre to the terrace on the axis. */
const BASE = MAP_RADIUS + LIGHTHOUSE_TOWER.terrace;
const VISITOR = .31;
/** Walkable band for the visitor's centre: clear of the shaft, and of the rail at the edge. */
export const STAIR_WALK = { inner: VISITOR, outer: LIGHTHOUSE_TOWER.stair.width - .36 };
export const BALCONY_WALK = { inner: VISITOR, outer: LIGHTHOUSE_TOWER.balcony.outer - .36 };
/** Beyond this angle from the axis nothing of the tower or its pad can be reached. */
const REACH = (LIGHTHOUSE_TOWER.pad.radius + 1.5) / BASE;

/** World point at tower-local (x, y, z) (y up the axis, z = -north). */
export function lighthousePoint(x: number, y: number, z: number, target = new Vector3()) {
  return target.copy(AXIS).multiplyScalar(BASE + y).addScaledVector(EAST, x).addScaledVector(NORTH, -z);
}
/** Tower-local cylindrical coordinates of a world point: height, radius, azimuth. */
export function lighthouseLocal(point: { x: number; y: number; z: number }) {
  const along = point.x * AXIS.x + point.y * AXIS.y + point.z * AXIS.z;
  const east = point.x * EAST.x + point.y * EAST.y + point.z * EAST.z, north = point.x * NORTH.x + point.y * NORTH.y + point.z * NORTH.z;
  return { height: along - BASE, radius: Math.hypot(east, north), azimuth: Math.atan2(north, east) / DEG };
}

export type TowerSupport = { radius: number; id: 'lighthouse:stair' | 'lighthouse:balcony' | 'lighthouse:tower'; solid: boolean; normal?: Vector3 };

/**
 * Support on and around the lighthouse for a planet direction, or null where the ground
 * beneath (`ground`, a radius) is the answer. With a foot radius, the highest surface within
 * a step of the foot is chosen; without one, the ground, so spawns land at the tower's foot.
 * Solid where the shaft is, where something overhead leaves less than headroom (which makes
 * the stair's low end a masonry base), and where a visitor up on the structure would drop
 * more than a metre: the stair's outer edge, the balcony's edge and the hatch all hold.
 */
export function lighthouseSupportAt(direction: { x: number; y: number; z: number }, ground: number, footRadius?: number, step = .32): TowerSupport | null {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const cos = (direction.x * AXIS.x + direction.y * AXIS.y + direction.z * AXIS.z) / length;
  if (cos < Math.cos(REACH)) return null;
  const east = (direction.x * EAST.x + direction.y * EAST.y + direction.z * EAST.z) / length;
  const north = (direction.x * NORTH.x + direction.y * NORTH.y + direction.z * NORTH.z) / length;
  const tan = Math.hypot(east, north) / cos, azimuth = Math.atan2(north, east) / DEG;
  const radiusAt = (height: number) => (BASE + height) * tan, along = (height: number) => (BASE + height) / cos;

  // Walkable surfaces, and the undersides of everything physically overhead.
  const walk: { radius: number; id: TowerSupport['id'] | 'ground' }[] = [{ radius: ground, id: 'ground' }];
  const overhead: number[] = [];
  for (const height of stairHeightsAt(azimuth)) {
    const r = radiusAt(height), inner = towerRadiusAt(height);
    if (r >= inner + STAIR_WALK.inner && r <= inner + STAIR_WALK.outer) walk.push({ radius: along(height), id: 'lighthouse:stair' });
    if (r >= inner && r <= inner + LIGHTHOUSE_TOWER.stair.width) overhead.push(along(height) - LIGHTHOUSE_TOWER.stair.slab);
  }
  const gallery = LIGHTHOUSE_TOWER.gallery, rg = radiusAt(gallery), shaftTop = towerRadiusAt(gallery);
  if (!inHatch(azimuth)) {
    if (rg >= shaftTop + BALCONY_WALK.inner && rg <= BALCONY_WALK.outer) walk.push({ radius: along(gallery), id: 'lighthouse:balcony' });
    if (rg >= shaftTop && rg <= LIGHTHOUSE_TOWER.balcony.outer) overhead.push(along(gallery) - LIGHTHOUSE_TOWER.balcony.slab);
  }
  let picked = walk[0];
  if (footRadius !== undefined) for (const surface of walk) if (surface.radius <= footRadius + step && surface.radius > picked.radius) picked = surface;

  const pickedHeight = picked.radius * cos - BASE;
  const solid = (id: TowerSupport['id']): TowerSupport => ({ radius: picked.radius, id, solid: true,
    normal: new Vector3().addScaledVector(EAST, east).addScaledVector(NORTH, north).normalize() });
  if (pickedHeight <= LIGHTHOUSE_TOWER.lantern.top && radiusAt(pickedHeight) < towerRadiusAt(Math.max(0, pickedHeight)) + VISITOR) return solid('lighthouse:tower');
  if (overhead.some(underside => underside > picked.radius + 1e-6 && underside - picked.radius < LIGHTHOUSE_TOWER.stair.headroom)) return solid('lighthouse:tower');
  // Drop guard: up on the structure, never step off an edge or into the hatch.
  if (footRadius !== undefined && footRadius > ground + .6 && picked.radius < footRadius - 1) return solid(picked.id === 'ground' ? 'lighthouse:tower' : picked.id);
  if (picked.id === 'ground') return null;
  return { radius: picked.radius, id: picked.id, solid: false };
}

/** Is a world point inside the drawn tower, stair slab, balcony slab or roof? (camera) */
export function lighthouseCameraBlocked(point: { x: number; y: number; z: number }) {
  const { height, radius, azimuth } = lighthouseLocal(point), t = LIGHTHOUSE_TOWER;
  if (height < -1 || height > t.finial + .5 || radius > t.pad.radius + .5) return false;
  if (height <= t.lantern.top && radius < towerRadiusAt(Math.max(0, height)) + .12) return true;
  if (height > t.lantern.top && height <= t.roof && radius < (t.lantern.radius + .25) * (1 - (height - t.lantern.top) / (t.roof - t.lantern.top)) + .12) return true;
  for (const h of stairHeightsAt(azimuth)) {
    const inner = towerRadiusAt(h);
    if (radius >= inner - .12 && radius <= inner + t.stair.width + .12 && height >= h - t.stair.slab - .15 && height <= h + .12) return true;
  }
  return !inHatch(azimuth) && radius <= t.balcony.outer + .12 && height >= t.gallery - t.balcony.slab - .15 && height <= t.gallery + .12;
}

/** A balcony point at an azimuth, midway across the walkable ring. */
function balconyAt(azimuth: number) {
  const r = (towerRadiusAt(LIGHTHOUSE_TOWER.gallery) + BALCONY_WALK.inner + BALCONY_WALK.outer) / 2;
  const point = lighthousePoint(Math.cos(azimuth * DEG) * r, LIGHTHOUSE_TOWER.gallery, -Math.sin(azimuth * DEG) * r);
  const chart = mapCoordinates(point);
  return { x: chart.x, z: chart.z, elevation: point.length() - MAP_RADIUS, azimuth, point };
}
/** The field note on the balcony, past the stair's top, facing the open ocean to the south. */
export const LIGHTHOUSE_GALLERY_NOTE = balconyAt(-100);
/** Where a visitor stands on the balcony, just short of the note, clockwise from the stair top. */
export const LIGHTHOUSE_GALLERY_STAND = balconyAt(-72);
/** The stair foot, where the trail arrives and the climb begins. */
export const LIGHTHOUSE_STAIR_FOOT = (() => {
  const foot = stairPoint(.004, 0), point = lighthousePoint(foot.x, 0, foot.z), chart = mapCoordinates(point), local = SEA_CAVE_FRAME.local(point);
  return { x: chart.x, z: chart.z, u: local.u, v: local.v, azimuth: foot.azimuth };
})();

/** Hidden boxes for the skateboard's obstacle test (walkers and the camera read the analytic
 * queries above): the shaft's foot as eight crossing planks (their union is a near-cylinder
 * inside the shaft; turned squares would poke their corners out), and the stair's masonry
 * base, each segment topped well below the treads so a walker on the stair clears it.
 * Tower-local centre, size and yaw (degrees). */
export const LIGHTHOUSE_SOLID_BOXES: readonly { id: string; center: [number, number, number]; size: [number, number, number]; yaw: number }[] = (() => {
  const boxes: { id: string; center: [number, number, number]; size: [number, number, number]; yaw: number }[] = [];
  const reach = (towerRadiusAt(3) - .06) / 1.02, half = reach * Math.tan(Math.PI / 16);
  for (let k = 0; k < 8; k++) boxes.push({ id: `shaft:${k}`, center: [0, 1.5, 0], size: [reach * 2, 3, half * 2], yaw: k * 22.5 });
  const s = LIGHTHOUSE_TOWER.stair, baseEnd = (s.headroom + s.slab) / STAIR_RISE, segments = 9;
  for (let k = 1; k < segments; k++) {
    // Clear of a visitor's body reaching back over the segment's start (about 0.3m of arc).
    const f0 = baseEnd * k / segments, f1 = baseEnd * (k + 1) / segments, top = f0 * STAIR_RISE - .45;
    if (top < .15) continue;
    const a0 = s.start + s.spin * f0 * STAIR_SWEEP, a1 = s.start + s.spin * f1 * STAIR_SWEEP, mid = (a0 + a1) / 2;
    const inner = towerRadiusAt(0) - .05, outer = inner + s.width + .05, r = (inner + outer) / 2;
    const chord = 2 * outer * Math.sin(Math.abs(a1 - a0) * DEG / 2) + .06, bottom = -.3;
    boxes.push({ id: `stair-base:${k}`, center: [Math.cos(mid * DEG) * r, (top + bottom) / 2, -Math.sin(mid * DEG) * r], size: [outer - inner, top - bottom, chord], yaw: mid });
  }
  return boxes;
})();
