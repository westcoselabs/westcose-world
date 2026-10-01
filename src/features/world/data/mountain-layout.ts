/** Mountain revision 4 for the radius-72 planet: the snowboard mountain.
 * A rounded summit sits above a gentle bowl, a steep headwall and a long concave
 * south face toward the resort; the flanks are rocky and the rear drops to a new
 * rear shore. Pure layout data and height fields: no scene, movement or game code.
 * Ski runs are carved separately (ski-runs.ts) and composed in town-surfaces.ts.
 */
import { islandTerrainAt } from './island-terrain';
import { MAP_RADIUS, MAP_SUMMIT } from './world-map';

export type MountainMapPoint = readonly [number, number];
export type MountainArea = {
  x: number; z: number; height: number; width: number; depth: number;
  feather?: number; shape?: 'oval'; treatment?: string;
};
export type FinishAreaId = 'resort' | 'west' | 'east';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const DEGREE = Math.PI / 180;

// Height profiles by base-sphere distance (metres at radius R) from the summit.
// Physical slopes are gentler high up: one chart metre spans (R + h) / R metres.
const H = MAP_SUMMIT.height;
const PROFILE = {
  south: [[0, H], [9, H - 4], [50, 65], [64, 58], [88, 36], [112, 16], [134, 8], [152, 4.5], [170, 2.6], [1e9, 2.6]],
  flank: [[0, H], [9, H - 5], [36, 64], [52, 52], [70, 26], [88, 4], [96, 2.6], [1e9, 2.6]],
  rear: [[0, H], [9, H - 5], [30, 62], [50, 40], [72, 0], [1e9, 0]],
} as const;

// North island outline. Its southern edge extends below the blend zone so it is
// never mistaken for a coast beside the unchanged town terrain.
const COAST: readonly MountainMapPoint[] = [
  [37, 20], [36, 38], [54, 54], [74, 84], [88, 128], [92, 180], [84, 232], [62, 276], [30, 300], [0, 306],
  [-30, 300], [-62, 276], [-84, 232], [-92, 180], [-88, 128], [-74, 84], [-54, 54], [-36, 38], [-37, 20],
];

const layout = {
  status: 'Mountain revision 4 — snowboard V1 on the radius-72 planet',
  summit: { x: MAP_SUMMIT.x, z: MAP_SUMMIT.z, height: MAP_SUMMIT.height },
  // Every run starts on this broad level shelf just below the rounded summit.
  summitPlateau: { x: 0, z: 214, height: 70.5, width: 40, depth: 14, feather: 10 },
  // Rev-3 resort anchors are unchanged in chart space.
  resort: { x: 1, z: 53.7, height: 2.8 },
  resortTerrace: { x: 1, z: 53.7, height: 2.8, width: 22, depth: 16, feather: 2, shape: 'oval' as const, treatment: 'compact resort at the foot of the south face' },
  ticketHut: { x: 5.07216494845, z: 55, height: 2.8, width: 3.4, depth: 3 },
  lodge: { x: -3, z: 55, height: 2.8, width: 8, depth: 6 },
  pedestrianArrival: { x: 1, z: 50, height: 2.8, width: 10, depth: 3, treatment: 'shared forecourt in front of both resort buildings' },
  pedestrianLinks: [
    { id: 'resort-approach', width: 3, treatment: 'short connection from the forest approach to the base resort', points: [[0, 45], [1, 50]] as readonly MountainMapPoint[] },
    { id: 'lodge-walk', width: 2.4, points: [[1, 50], [-3, 52.2]] as readonly MountainMapPoint[] },
    { id: 'ticket-walk', width: 2.4, points: [[1, 50], [5.07216494845, 53.6]] as readonly MountainMapPoint[] },
    { id: 'finish-return', width: 2.4, treatment: 'walk from the resort finish through the gap between the buildings', points: [[2.1, 61], [2.1, 56], [2.1, 52], [1, 50]] as readonly MountainMapPoint[] },
  ],
  // Run-outs; heights are sampled from the base terrain when this module loads.
  finishAreas: {
    resort: { id: 'resort' as const, name: 'Resort Finish', x: 2, z: 65, width: 40, depth: 10, feather: 4 },
    // Kept north of the protected town forest; only its feather meets the z<=42 band.
    west: { id: 'west' as const, name: 'West Forest Run-out', x: -27, z: 48, width: 14, depth: 8, feather: 3 },
    east: { id: 'east' as const, name: 'East Bluff Run-out', x: 31, z: 44, width: 14, depth: 10, feather: 4 },
  },
  coast: COAST,
  snowLine: 6.5,
};

function table(points: readonly (readonly number[])[], d: number) {
  for (let i = 1; i < points.length; i++) {
    if (d > points[i][0]) continue;
    const u = (d - points[i - 1][0]) / (points[i][0] - points[i - 1][0]);
    return mix(points[i - 1][1], points[i][1], mix(u, u * u * (3 - 2 * u), .35));
  }
  return points[points.length - 1][1];
}

// Azimuthal-equidistant frame about the summit, so the massif keeps its physical
// shape instead of inheriting the chart's cos(x / R) distortion.
const summitA = MAP_SUMMIT.x / MAP_RADIUS, summitB = MAP_SUMMIT.z / MAP_RADIUS;
const SUMMIT_UP = [Math.sin(summitA), Math.cos(summitA) * Math.sin(summitB), Math.cos(summitA) * Math.cos(summitB)] as const;
const SUMMIT_EAST = [Math.cos(summitA), -Math.sin(summitA) * Math.sin(summitB), -Math.sin(summitA) * Math.cos(summitB)] as const;
const SUMMIT_NORTH = [0, Math.cos(summitB), -Math.sin(summitB)] as const;
function summitPolar(x: number, z: number) {
  const a = x / MAP_RADIUS, b = z / MAP_RADIUS;
  const px = Math.sin(a), py = Math.cos(a) * Math.sin(b), pz = Math.cos(a) * Math.cos(b);
  const c = clamp(px * SUMMIT_UP[0] + py * SUMMIT_UP[1] + pz * SUMMIT_UP[2], -1, 1);
  const tx = px - SUMMIT_UP[0] * c, ty = py - SUMMIT_UP[1] * c, tz = pz - SUMMIT_UP[2] * c;
  const east = tx * SUMMIT_EAST[0] + ty * SUMMIT_EAST[1] + tz * SUMMIT_EAST[2];
  const north = tx * SUMMIT_NORTH[0] + ty * SUMMIT_NORTH[1] + tz * SUMMIT_NORTH[2];
  const length = Math.hypot(east, north) || 1;
  return { distance: MAP_RADIUS * Math.acos(c), east: east / length, north: north / length };
}

/** Bare massif above the base sphere, before the island coast and plates. */
export function massifHeightAt(x: number, z: number): number {
  const { distance, east, north } = summitPolar(x, z);
  const bearing = Math.abs(Math.atan2(east, -north)); // 0 = due south, toward the resort
  const southWeight = 1 - smooth(55 * DEGREE, 100 * DEGREE, bearing);
  const rearWeight = smooth(125 * DEGREE, 160 * DEGREE, bearing);
  const flankWeight = Math.max(0, 1 - southWeight - rearWeight);
  return southWeight * table(PROFILE.south, distance) + flankWeight * table(PROFILE.flank, distance) + rearWeight * table(PROFILE.rear, distance);
}

/** Signed physical distance to the north-island coast; positive on land. */
export function mountainCoastDistance(x: number, z: number): number {
  let inside = false, best = Infinity;
  const k = Math.cos(x / MAP_RADIUS);
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const a = COAST[j], b = COAST[i];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dz = (b[1] - a[1]) * k, px = x - a[0], pz = (z - a[1]) * k;
    const t = clamp((px * dx + pz * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(px - t * dx, pz - t * dz));
  }
  return inside ? best : -best;
}

/** How much of the terrain belongs to the mountain overlay rather than the frozen town. */
export function mountainBlendAt(_x: number, z: number): number {
  return smooth(40, 52, z);
}

function overlayAt(x: number, z: number): number {
  const coast = mountainCoastDistance(x, z);
  const land = .16 + 2.22 * smooth(20, 110, z) + .35 * Math.sin(x * .09 + z * .05);
  const lowland = -3 + (land + 3) * smooth(-3, 9, coast);
  return Math.max(lowland, mix(lowland, massifHeightAt(x, z), smooth(2, 18, coast)));
}

/** Unplated terrain: the frozen town substrate blended into the mountain island. */
export function mountainBaseAt(x: number, z: number): number {
  const blend = mountainBlendAt(x, z);
  const existing = blend < 1 ? islandTerrainAt(x, z) : 0;
  return blend === 0 ? existing : blend === 1 ? overlayAt(x, z) : mix(existing, overlayAt(x, z), blend);
}

// Chart-space bounds (including feather) let most queries skip a plate immediately.
const plateBounds = new WeakMap<MountainArea, { x: number; z: number }>();
function boundsOf(area: MountainArea) {
  let bounds = plateBounds.get(area);
  if (!bounds) {
    const k = (MAP_RADIUS + area.height) / MAP_RADIUS, reach = Math.max(area.width, area.depth) / 2 + (area.feather ?? 2.5) + .5;
    bounds = { x: reach / k, z: reach / (k * Math.max(.05, Math.cos(area.x / MAP_RADIUS))) };
    plateBounds.set(area, bounds);
  }
  return bounds;
}
function plateauAt(x: number, z: number, area: MountainArea, height: number): number {
  const bounds = boundsOf(area);
  if (Math.abs(x - area.x) > bounds.x || Math.abs(z - area.z) > bounds.z) return height;
  const k = (MAP_RADIUS + area.height) / MAP_RADIUS;
  const dx = Math.abs(x - area.x) * k;
  const dz = Math.abs(z - area.z) * Math.cos(area.x / MAP_RADIUS) * k;
  const outside = area.shape === 'oval'
    ? (Math.hypot(dx / (area.width / 2), dz / (area.depth / 2)) - 1) * Math.min(area.width, area.depth) / 2
    : Math.max(dx - area.width / 2, dz - area.depth / 2);
  return mix(height, area.height, 1 - smooth(0, area.feather ?? 2.5, outside));
}

const finishAreas = Object.fromEntries(Object.values(layout.finishAreas).map(area => [area.id, { ...area, height: +mountainBaseAt(area.x, area.z).toFixed(3) }])) as Record<FinishAreaId, MountainArea & { id: FinishAreaId; name: string }>;
const RESORT_PLATES: readonly MountainArea[] = [layout.resortTerrace, layout.ticketHut, layout.lodge, layout.pedestrianArrival];
const RUN_PLATES: readonly MountainArea[] = [layout.summitPlateau, ...Object.values(finishAreas)];

/** Flat run starts and finishes, applied to the base terrain before run carving. */
export function mountainRunPlatesAt(x: number, z: number, height: number): number {
  for (const area of RUN_PLATES) height = plateauAt(x, z, area, height);
  return height;
}

/** How strongly a run plate owns this point (1 inside, feathered to 0). */
export function mountainRunPlateWeightAt(x: number, z: number): number {
  let weight = 0;
  for (const area of RUN_PLATES) {
    const bounds = boundsOf(area);
    if (Math.abs(x - area.x) > bounds.x || Math.abs(z - area.z) > bounds.z) continue;
    const k = (MAP_RADIUS + area.height) / MAP_RADIUS;
    const outside = Math.max(Math.abs(x - area.x) * k - area.width / 2, Math.abs(z - area.z) * Math.cos(area.x / MAP_RADIUS) * k - area.depth / 2);
    weight = Math.max(weight, 1 - smooth(0, area.feather ?? 2.5, outside));
  }
  return weight;
}

/** Resort building foundations are always applied last. */
export function mountainResortPlatesAt(x: number, z: number, height: number): number {
  for (const area of RESORT_PLATES) height = plateauAt(x, z, area, height);
  return height;
}

/** Natural snowfield: the massif above the snow line. Groomed runs are added by ski-runs.ts. */
export function mountainSnowAt(x: number, z: number): boolean {
  if (z < 56 || z > 310 || mountainBlendAt(x, z) < .5 || massifHeightAt(x, z) < layout.snowLine) return false;
  return mountainCoastDistance(x, z) >= 4;
}

/** A finish area at the given chart point, if any. */
export function mountainFinishAreaAt(x: number, z: number): (typeof finishAreas)[FinishAreaId] | undefined {
  return Object.values(finishAreas).find(area => {
    const k = (MAP_RADIUS + area.height) / MAP_RADIUS;
    return Math.abs(x - area.x) * k <= area.width / 2 && Math.abs(z - area.z) * Math.cos(area.x / MAP_RADIUS) * k <= area.depth / 2;
  });
}

export const MOUNTAIN_LAYOUT = { ...layout, finishAreas };
export const MOUNTAIN_FINISH_AREAS = finishAreas;
export const MOUNTAIN_PEDESTRIAN_LINKS = layout.pedestrianLinks;

export default MOUNTAIN_LAYOUT;
