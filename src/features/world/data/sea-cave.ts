/** The Sea Caves as one analytic 2.5D volume.
 *
 * The plan is a signed-distance field in local metres (negative inside the walkable region):
 * a smooth union of passages (capsule chains with width profiles) and chambers (ellipses),
 * minus the standing pillars, with a low-frequency wobble that only ever widens the rock.
 * Floor and ceiling are smooth blends of the shapes' own profiles. Walking support, the
 * camera, area names, the terrain cover and the cave mesh all read `seaCaveAt`, so nothing
 * depends on fitted wall boxes. Pure `three` maths: safe for the check scripts.
 */
import { Vector3 } from 'three';
import { MAP_RADIUS, mapDirection, mapFrame } from './world-map';
import { createLocalFrame } from './local-frame';
import { placeVector } from './peninsula-frame';
import { PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import {
  type CavePoint, SEA_CAVE_CHAMBERS, SEA_CAVE_COVER, SEA_CAVE_MASSIF, SEA_CAVE_MOUTH,
  SEA_CAVE_PASSAGES, SEA_CAVE_PILLARS, SEA_CAVE_WALL_OFFSET, SEA_CAVE_WINDOW,
} from './sea-cave-layout';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

/** Local frame on the lighthouse axis, carried with the peninsula's rigid placement. */
const authored = mapFrame(PENINSULA_LIGHTHOUSE.x, PENINSULA_LIGHTHOUSE.z);
export const SEA_CAVE_FRAME = createLocalFrame(placeVector(authored.up.clone()), placeVector(authored.east.clone()), placeVector(authored.north.clone()));

export type SeaCaveZone = 'tunnel' | 'undercroft' | 'crawl' | 'slot' | 'grotto' | 'window' | 'arches' | 'tidepool';
export const SEA_CAVE_ZONE_NAMES: Record<SeaCaveZone, string> = {
  tunnel: 'Sea Cave Tunnel', undercroft: 'Undercroft', crawl: 'The Crawl', slot: 'The Slot',
  grotto: 'The Grotto', window: 'Ocean Window', arches: 'Twin Arches', tidepool: 'Tide Pool',
};

type ShapeSample = { d: number; floor: number; ceiling: number };
type Shape = { zone: SeaCaveZone; wobble: number; seed: number; sample(u: number, v: number, out: ShapeSample): void };

/** Low-frequency rock wobble in [-1, 1]; a handful of sines, no texture lookups. */
function wobbleAt(u: number, v: number, seed: number) {
  return .55 * Math.sin(.83 * u + .5 * v + seed) * Math.cos(.61 * v - .4 * u + seed * 1.7)
    + .3 * Math.sin(1.73 * u - 1.21 * v + seed * 2.3) + .15 * Math.sin(2.9 * u + 2.3 * v + seed * .7);
}

/** Cross-profile crown: the share of the centre height lost at the rock wall. */
const CROWN: Record<CavePassage['kind'], number> = { tunnel: .25, crawl: .08, slot: .03, arch: .3 };
type CavePassage = (typeof SEA_CAVE_PASSAGES)[number];

function passageShape(passage: CavePassage, seed: number): Shape {
  const zone: SeaCaveZone = passage.kind === 'arch' ? 'arches' : passage.id as SeaCaveZone;
  const wobble = passage.kind === 'crawl' ? .4 : passage.kind === 'slot' ? .14 : passage.kind === 'tunnel' ? .12 : .25;
  const points = passage.points, crown = CROWN[passage.kind];
  return { zone, wobble, seed, sample(u, v, out) {
    let best = Infinity, floor = 0, ceiling = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [au, av] = points[i], [bu, bv] = points[i + 1], du = bu - au, dv = bv - av;
      const t = clamp(((u - au) * du + (v - av) * dv) / (du * du + dv * dv));
      const distance = Math.hypot(u - au - du * t, v - av - dv * t);
      const rock = lerp(passage.width[i], passage.width[i + 1], t) / 2;
      const d = distance - rock + SEA_CAVE_WALL_OFFSET;
      if (d < best) {
        best = d;
        floor = lerp(passage.floor[i], passage.floor[i + 1], t);
        const lateral = clamp(distance / rock);
        ceiling = floor + lerp(passage.height[i], passage.height[i + 1], t) * (1 - crown * lateral * lateral);
      }
    }
    out.d = best; out.floor = floor; out.ceiling = ceiling;
  } };
}

/** Cheap ellipse distance (exact on the axes, close elsewhere), negative inside. */
function ellipseDistance(x: number, y: number, a: number, b: number) {
  const k0 = Math.hypot(x / a, y / b), k1 = Math.hypot(x / (a * a), y / (b * b));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(a, b);
}
const rotated = (u: number, v: number, center: CavePoint, degrees: number) => {
  const c = Math.cos(degrees * DEG), s = Math.sin(degrees * DEG), du = u - center[0], dv = v - center[1];
  return [du * c + dv * s, -du * s + dv * c] as const;
};

function chamberShape(chamber: (typeof SEA_CAVE_CHAMBERS)[number], seed: number): Shape {
  const [a, b] = chamber.radii, ramp = chamber.ramp, face = chamber.face;
  const faceOut = face ? (() => { const l = Math.hypot(face.outward[0], face.outward[1]); return [face.outward[0] / l, face.outward[1] / l] as const; })() : [0, 0] as const;
  const wobble = chamber.id === 'window' ? .2 : .45;
  return { zone: chamber.id as SeaCaveZone, wobble, seed, sample(u, v, out) {
    const [x, y] = rotated(u, v, chamber.center, chamber.rotation);
    out.d = ellipseDistance(x, y, a, b) + SEA_CAVE_WALL_OFFSET;
    if (face) out.d = Math.max(out.d, (u - face.point[0]) * faceOut[0] + (v - face.point[1]) * faceOut[1] + face.inset + SEA_CAVE_WALL_OFFSET);
    let floor = chamber.floor;
    if (ramp) {
      const du = ramp.to[0] - ramp.from[0], dv = ramp.to[1] - ramp.from[1];
      const t = clamp(((u - ramp.from[0]) * du + (v - ramp.from[1]) * dv) / (du * du + dv * dv));
      floor = lerp(ramp.floors[0], ramp.floors[1], t * t * (3 - 2 * t));
    }
    const rho = Math.min(1, (x / a) ** 2 + (y / b) ** 2);
    out.floor = floor;
    out.ceiling = chamber.wall + (chamber.crown - chamber.wall) * (1 - rho) + (chamber.tilt ?? 0) * clamp(x / a, -1, 1);
  } };
}

const SHAPES: Shape[] = [
  ...SEA_CAVE_PASSAGES.map((passage, i) => passageShape(passage, 1.3 + i * 2.1)),
  ...SEA_CAVE_CHAMBERS.map((chamber, i) => chamberShape(chamber, 7.7 + i * 1.9)),
];

const MOUTH_INWARD = (() => { const [u, v] = SEA_CAVE_MOUTH.inward, l = Math.hypot(u, v); return [u / l, v / l] as const; })();
const WINDOW_OUT = (() => { const [u, v] = SEA_CAVE_WINDOW.outward, l = Math.hypot(u, v); return [u / l, v / l] as const; })();

/** Signed metres past the mouth plane along the cave axis (negative outside, on the beach)
 * and across it. */
export function seaCavePortalAt(u: number, v: number) {
  const du = u - SEA_CAVE_MOUTH.center[0], dv = v - SEA_CAVE_MOUTH.center[1];
  return { s: du * MOUTH_INWARD[0] + dv * MOUTH_INWARD[1], lateral: -du * MOUTH_INWARD[1] + dv * MOUTH_INWARD[0] };
}
/** Window frame: `out` metres seaward of the cliff face and `across` it. */
export function seaCaveWindowAt(u: number, v: number) {
  const du = u - SEA_CAVE_WINDOW.center[0], dv = v - SEA_CAVE_WINDOW.center[1];
  return { out: du * WINDOW_OUT[0] + dv * WINDOW_OUT[1], across: -du * WINDOW_OUT[1] + dv * WINDOW_OUT[0] };
}
/** Wobble is faded out near both openings so their cut terrain meets a clean profile. */
function openingCalm(u: number, v: number) {
  const mouth = Math.hypot(u - SEA_CAVE_MOUTH.center[0], v - SEA_CAVE_MOUTH.center[1]);
  const w = seaCaveWindowAt(u, v), alongFace = Math.max(0, Math.abs(w.across) - SEA_CAVE_WINDOW.halfWidth);
  const windowDistance = Math.hypot(Math.max(0, -w.out), alongFace);
  return smooth(2, 5, mouth) * smooth(1.5, 4.5, windowDistance);
}

export type SeaCaveSample = {
  /** Signed distance to the walkable edge (negative inside). The rock face is drawn at
   * `sdf = SEA_CAVE_WALL_OFFSET`. */
  sdf: number; inside: boolean; floor: number; ceiling: number; zone: SeaCaveZone;
};

const shapeSample: ShapeSample = { d: 0, floor: 0, ceiling: 0 };
const ds = new Float64Array(SHAPES.length), floors = new Float64Array(SHAPES.length), ceilings = new Float64Array(SHAPES.length);
/** The volume at a local point. */
export function seaCaveLocal(u: number, v: number): SeaCaveSample {
  const calm = openingCalm(u, v);
  let union = Infinity, dmin = Infinity;
  for (let i = 0; i < SHAPES.length; i++) {
    const shape = SHAPES[i];
    shape.sample(u, v, shapeSample);
    // Outward-only wobble: walls bulge into the rock, so authored widths are minimums.
    const d = shapeSample.d + shape.wobble * calm * (wobbleAt(u, v, shape.seed) - 1) / 2;
    ds[i] = d; floors[i] = shapeSample.floor; ceilings[i] = shapeSample.ceiling;
    if (d < dmin) dmin = d;
    // Polynomial smooth union rounds every junction.
    const k = 1.2, h = clamp(.5 + .5 * (union - d) / k);
    union = union === Infinity ? d : lerp(union, d, h) - k * h * (1 - h);
  }
  let weight = 0, floor = 0, ceiling = 0, zone = SHAPES[0].zone, best = 0;
  for (let i = 0; i < SHAPES.length; i++) {
    const w = Math.exp(-(ds[i] - dmin) / .7);
    weight += w; floor += floors[i] * w; ceiling += ceilings[i] * w;
    if (w > best) { best = w; zone = SHAPES[i].zone; }
  }
  floor /= weight; ceiling /= weight;
  // The ramp up onto the window ledge, along the window's own axis.
  const face = seaCaveWindowAt(u, v), ramp = SEA_CAVE_WINDOW.ramp;
  floor += ramp.rise * smooth(ramp.from, ramp.to, face.out) * (1 - smooth(SEA_CAVE_WINDOW.halfWidth, SEA_CAVE_WINDOW.halfWidth + 2.8, Math.abs(face.across)));
  let sdf = union;
  for (const pillar of SEA_CAVE_PILLARS) {
    const [x, y] = rotated(u, v, pillar.center, pillar.rotation);
    const rock = ellipseDistance(x, y, pillar.radii[0], pillar.radii[1]) - .25 * calm * (wobbleAt(u, v, 4.1) - 1) / 2;
    sdf = Math.max(sdf, SEA_CAVE_WALL_OFFSET - rock);
  }
  return { sdf, inside: sdf <= 0, floor, ceiling, zone };
}

/** Unit plan gradient of the signed distance (pointing into the rock), by central differences. */
export function seaCaveGradient(u: number, v: number, step = .05) {
  const du = seaCaveLocal(u + step, v).sdf - seaCaveLocal(u - step, v).sdf;
  const dv = seaCaveLocal(u, v + step).sdf - seaCaveLocal(u, v - step).sdf;
  const length = Math.hypot(du, dv) || 1;
  return { u: du / length, v: dv / length };
}

/** Local bounds that contain the whole plan, the massif and its blend margins. */
export const SEA_CAVE_LOCAL_BOUNDS = { minU: -14, maxU: 31, minV: -4, maxV: 52 } as const;
/** World chart bounds of the local box, sampled along its edges and padded. */
export const SEA_CAVE_CHART_BOUNDS = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const { minU, maxU, minV, maxV } = SEA_CAVE_LOCAL_BOUNDS;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    for (const [u, v] of [[lerp(minU, maxU, t), minV], [lerp(minU, maxU, t), maxV], [minU, lerp(minV, maxV, t)], [maxU, lerp(minV, maxV, t)]]) {
      const c = SEA_CAVE_FRAME.chart(u, v);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
    }
  }
  return { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1 };
})();
export const nearSeaCave = (x: number, z: number) => x >= SEA_CAVE_CHART_BOUNDS.minX && x <= SEA_CAVE_CHART_BOUNDS.maxX
  && z >= SEA_CAVE_CHART_BOUNDS.minZ && z <= SEA_CAVE_CHART_BOUNDS.maxZ;

let lastX = NaN, lastZ = NaN, lastLocal = { u: 0, v: 0 };
/** Local coordinates of a world chart point, cached for runs of queries at one point. */
export function seaCaveLocalAt(x: number, z: number) {
  if (x !== lastX || z !== lastZ) { lastX = x; lastZ = z; lastLocal = SEA_CAVE_FRAME.local(mapDirection(x, z)); }
  return lastLocal;
}

/** The volume at a world chart point, or null well outside the caves. */
export function seaCaveAt(x: number, z: number): (SeaCaveSample & { u: number; v: number }) | null {
  if (!nearSeaCave(x, z)) return null;
  const { u, v } = seaCaveLocalAt(x, z);
  const b = SEA_CAVE_LOCAL_BOUNDS;
  if (u < b.minU || u > b.maxU || v < b.minV || v > b.maxV) return null;
  return { ...seaCaveLocal(u, v), u, v };
}

/** True only inside the open cave void (walkable plan plus the camera margin to the drawn
 * rock), between floor and ceiling. */
export function isInsideSeaCaveVoid(point: { x: number; y: number; z: number }, margin = .14) {
  const radius = Math.hypot(point.x, point.y, point.z), { u, v } = SEA_CAVE_FRAME.local(point);
  const b = SEA_CAVE_LOCAL_BOUNDS;
  if (u < b.minU || u > b.maxU || v < b.minV || v > b.maxV) return false;
  const sample = seaCaveLocal(u, v), elevation = radius - MAP_RADIUS;
  return sample.sdf <= SEA_CAVE_WALL_OFFSET && elevation >= sample.floor - margin && elevation <= sample.ceiling + margin;
}

// ---------------------------------------------------------------------------
// Terrain: the massif over the old cove, and a guaranteed rock cover over every passage.

type FootprintEdge = { au: number; av: number; du: number; dv: number; length2: number; width: number };
const FOOTPRINT: FootprintEdge[] = SEA_CAVE_MASSIF.footprint.map(([au, av, width], i, all) => {
  const [bu, bv] = all[(i + 1) % all.length];
  return { au, av, du: bu - au, dv: bv - av, length2: (bu - au) ** 2 + (bv - av) ** 2, width };
});
/** Signed metres inside the massif footprint (positive inside) and the nearest edge's blend width. */
export function seaCaveFootprintAt(u: number, v: number) {
  let inside = false, distance = Infinity, width = 2;
  for (const e of FOOTPRINT) {
    const bv = e.av + e.dv;
    if ((e.av > v) !== (bv > v) && u < e.du * (v - e.av) / e.dv + e.au) inside = !inside;
    const t = clamp(((u - e.au) * e.du + (v - e.av) * e.dv) / e.length2);
    const d = Math.hypot(u - e.au - e.du * t, v - e.av - e.dv * t);
    if (d < distance) { distance = d; width = e.width; }
  }
  return { distance: inside ? distance : -distance, width };
}

/** How much of the ground at a world chart point is the headland (0 away from it). */
export function seaCaveMassifWeightAt(x: number, z: number) {
  if (!nearSeaCave(x, z)) return 0;
  const { u, v } = seaCaveLocalAt(x, z), footprint = seaCaveFootprintAt(u, v);
  return smooth(0, footprint.width, footprint.distance);
}

/** True at the foot of the headland's cliffs (within 1.6m outside its footprint) and on it. */
export function seaCaveCliffFootAt(x: number, z: number) {
  if (!nearSeaCave(x, z)) return false;
  const { u, v } = seaCaveLocalAt(x, z);
  return seaCaveFootprintAt(u, v).distance > -1.6;
}

/** Sculpted top of the massif (before any cover over the passages). */
function massifTopAt(u: number, v: number) {
  const { west, slope, max } = SEA_CAVE_MASSIF.base;
  let height = Math.min(max, west + slope * (u + 2));
  for (const [ku, kv, extra, radius] of SEA_CAVE_MASSIF.knolls) {
    const d = Math.hypot(u - ku, v - kv);
    if (d < radius) height += extra * (.5 + .5 * Math.cos(Math.PI * d / radius));
  }
  return rocky(u, v, height);
}
/** Chunky outcrops rather than fine noise, then rock benches: flat-ish treads with short
 * steep risers, the way layered coastal rock weathers. `upOnly` never lowers the surface. */
function rocky(u: number, v: number, height: number, upOnly = false) {
  const chunk = .55 * Math.sin(.9 * u + .4) * Math.sin(.7 * v + 1.1) + .35 * Math.sin(1.7 * u - 1.3 * v + .6) + .2 * Math.sin(2.9 * u + 2.1 * v);
  const h = height + (upOnly ? .55 + chunk / 2 : chunk);
  const bench = 1.4, level = h / bench, base = Math.floor(level);
  const benched = .45 * h + .55 * bench * (base + smooth(.6, .95, level - base));
  return upOnly ? Math.max(height, benched + .5) : benched;
}

/** Rock over the passages: ceiling + cover over the drawn rock, falling away outside it.
 * It fades out through the mouth so the beach meets the portal. */
function coverAt(u: number, v: number, sample: SeaCaveSample) {
  const outside = Math.max(0, sample.sdf - SEA_CAVE_WALL_OFFSET);
  const height = rocky(u, v, sample.ceiling + SEA_CAVE_COVER + .3 - 1.2 * outside, true);
  const portal = seaCavePortalAt(u, v);
  const mouth = Math.max(smooth(-.2, 1.6, portal.s), smooth(2.5, 4, Math.abs(portal.lateral)));
  // No cover is built seaward of the window's cliff line: every room lies inland of it.
  const seaward = smooth(-.4, .8, seaCaveWindowAt(u, v).out);
  return { height, weight: (1 - smooth(1, 2.4, outside)) * mouth * (1 - seaward) };
}

/** Terrain over the caves at a world chart point: the massif blended over the existing
 * ground, then the cover over every passage. Returns `height` unchanged far away. */
export function seaCaveTerrainAt(x: number, z: number, height: number) {
  if (!nearSeaCave(x, z)) return height;
  const { u, v } = seaCaveLocalAt(x, z);
  const b = SEA_CAVE_LOCAL_BOUNDS;
  if (u < b.minU || u > b.maxU || v < b.minV || v > b.maxV) return height;
  return seaCaveTerrainLocal(u, v, height);
}
export function seaCaveTerrainLocal(u: number, v: number, height: number) {
  const footprint = seaCaveFootprintAt(u, v);
  const massif = smooth(0, footprint.width, footprint.distance);
  if (massif > 0) height += (Math.max(height, massifTopAt(u, v)) - height) * massif;
  const sample = seaCaveLocal(u, v), cover = coverAt(u, v, sample);
  if (cover.weight > 0) height += (Math.max(height, cover.height) - height) * cover.weight;
  return height;
}

/** World point at local metres and an elevation, for scenes and checks. */
export const seaCavePoint = (u: number, v: number, elevation: number, target = new Vector3()) => SEA_CAVE_FRAME.point(u, v, elevation, target);
