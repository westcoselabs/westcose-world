import { MAP_RADIUS } from './world-map';
import { nearPeninsula, peninsulaAuthoredPoint, placedPoint } from './peninsula-frame';

/** Local coastal reconstruction. All dimensions are metres on the curved world.
 * Everything in this file down to the "World placement" section is the approved authoring
 * data, in the chart frame it was approved in. peninsula-frame.ts carries it, rigidly, to
 * where it now stands east of the cul-de-sacs; use the placed exports for world positions. */
export const PENINSULA_CAVE = {
  // Public mouth → directly under the lighthouse → cove behind the headland.
  points: [[28, -29], [31, -30.5], [34, -32], [36, -32], [37, -30], [38, -26], [38, -22], [38, -20]],
  floor: -.1,
  width: 3.4,
  clearance: 4,
} as const;

export const PENINSULA_LIGHTHOUSE = { x: 36, z: -32, elevation: 6.2, height: 12 } as const;
// Discovery/arrival lies on open sand beyond the exit wall, with room for the normal camera.
export const PENINSULA_COVE = { x: 37, z: -11 } as const;

export type CoastPoint = readonly [number, number];
// Approved single-cove shoreline: the former middle spur is absent. The eastern
// indentation runs continuously from the lighthouse cape to the northern arm.
export const PENINSULA_COAST: readonly CoastPoint[] = [
  [24, 30], [37, 30], [40, 27], [40, 24], [37, 21], [35, 16],
  [34, 10], [34, 4], [35, -3], [37, -11], [41, -19], [44, -24],
  [45, -29], [43, -34], [40, -38], [36, -40], [32, -38], [29, -35], [27, -31], [24, -32],
];
export const PENINSULA_TERRACE: readonly CoastPoint[] = [
  [29.5, -28], [31, -24], [34, -22.5], [38, -24], [41, -28],
  [40, -33], [37, -36], [33, -35], [30, -32],
];
// Solid rock above the passage. The two low mouths cut its western and north-
// eastern faces; the walking surface itself never drops into the tunnel.
export const PENINSULA_CAP: readonly CoastPoint[] = [
  [26.8, -31], [26.9, -27.4], [29.5, -24.5], [33, -23],
  [35, -20], [37.5, -18.3], [40.5, -20], [43, -26],
  [41.5, -34], [37, -38], [32, -37], [29, -34],
];
export const PENINSULA_UPPER: readonly CoastPoint[] = [
  [24, 30], [36, 28], [32, 23], [28.5, 18], [27.8, 12], [28.5, 5],
  [29.8, -3], [32, -12], [35, -20], [32, -24], [29, -23], [27, -14], [26, -5],
];
export const PENINSULA_SAND: readonly CoastPoint[] = [
  [36, 26], [33, 22], [30, 17], [29, 10], [29.5, 3], [31, -5],
  [33, -13], [36, -20], [38, -23], [41, -20], [38, -14], [36, -7],
  [34, 2], [34, 10], [35, 17], [37, 22], [40, 25],
];
/** Back edge of the one crescent, not a second arm projecting into its water. */
export const PENINSULA_INNER_CLIFF: readonly CoastPoint[] = [
  [36, 28], [32, 23], [28.5, 18], [27.8, 12], [28.5, 5],
  [29.8, -3], [32, -12], [35, -20], [38, -24],
];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Signed distance in local physical metres; positive inside an authored polygon. */
export function coastDistance(x: number, z: number, polygon: readonly CoastPoint[]) {
  let inside = false, distance = Infinity;
  const scaleZ = Math.cos(x / MAP_RADIUS);
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dz = (b[1] - a[1]) * scaleZ;
    const px = x - a[0], pz = (z - a[1]) * scaleZ;
    const t = clamp((px * dx + pz * dz) / (dx * dx + dz * dz));
    distance = Math.min(distance, Math.hypot(px - t * dx, pz - t * dz));
  }
  return distance * (inside ? 1 : -1);
}

/** Replace the old eastern mound, with a seam collar only at the unchanged map. */
function authoredBlendAt(x: number, z: number) {
  if (!inAuthoredRegion(x, z)) return 0;
  const west = z < -18 ? smooth(15, 20, x) : smooth(24, 27, x);
  // At the protected boardwalk corner, approach the unchanged level gently.
  const townCorner = x < 24 ? 1 - smooth(-23, -18, z) : 1;
  // Keep the entire approved basin authoritative through its northern mouth.
  // Only the last 3m joins the untouched mainland; the old 14m fade restored a
  // skinny finger of the obsolete shoreline inside the new cove.
  return west * townCorner * smooth(-47, -44, z) * (1 - smooth(27, 30, z)) * (1 - smooth(47, 51, x));
}

function authoredHeightAt(x: number, z: number) {
  const shore = coastDistance(x, z, PENINSULA_COAST);
  // Low intertidal skirt → broken coastal shelf. No continuous 8m radial wall.
  let height = -3 + 3.12 * smooth(-2.6, .65, shore);
  // Keep the low public beach continuous into the south-west cave approach.
  // This skirt meets the existing public shore; it is not a raised causeway.
  const publicShore = -34 + 1.3 * Math.sin(x * .13) + .8 * Math.cos(x * .3);
  const publicBeach = -3 + 2.9 * smooth(publicShore - 2, publicShore + 3, z);
  height += (Math.max(height, publicBeach) - height) * (1 - smooth(24, 27, x));
  const shelf = .65 + .18 * Math.sin(x * .8 + z * .55);
  height += shelf * smooth(.6, 2.2, shore);
  const terrace = coastDistance(x, z, PENINSULA_TERRACE);
  height += (6.2 - height) * smooth(-1.35, 1.3, terrace);
  const upper = coastDistance(x, z, PENINSULA_UPPER);
  const upperHeight = .4 + 3.6 * (1 - smooth(-23, 4, z)) + 2.2 * smooth(4, 15, z);
  height += (Math.max(height, upperHeight) - height) * smooth(-2, 1.2, upper);
  // Town approach is a graded neck, with the high part east of its path.
  if (z > -18) height += (.16 - height) * (1 - smooth(24, 28.5, x));
  // Public beach joins the peninsula's low south-west shore without a climb.
  if (x < 27 && z < -25) height += (-.1 - height) * (1 - smooth(24, 28, x)) * smooth(-37, -32, z);
  const sand = coastDistance(x, z, PENINSULA_SAND);
  // A continuous low crescent, not a second independent beach patch. Its
  // seaward feather also joins the intertidal skirt without a retaining lip.
  height += (Math.min(height, -.1) - height) * smooth(-1, .2, sand);
  const cap = coastDistance(x, z, PENINSULA_CAP);
  height += (Math.max(height, 5.2) - height) * smooth(-.7, .4, cap);
  return height;
}

/** A small tangent foundation avoids either burying or floating the unchanged tower. */
function authoredFoundationAt(x: number, z: number): { height: number; blend: number } {
  const tower = PENINSULA_LIGHTHOUSE;
  const a = x / MAP_RADIUS, a0 = tower.x / MAP_RADIUS, b = (z - tower.z) / MAP_RADIUS;
  const dot = Math.sin(a) * Math.sin(a0) + Math.cos(a) * Math.cos(a0) * Math.cos(b);
  const height = (MAP_RADIUS + tower.elevation) / dot - MAP_RADIUS;
  const east = (MAP_RADIUS + height) * (Math.sin(a) * Math.cos(a0) - Math.cos(a) * Math.sin(a0) * Math.cos(b));
  const north = (MAP_RADIUS + height) * Math.cos(a) * Math.sin(b);
  const edge = Math.max(Math.abs(east) - 2.8, Math.abs(north) - 2.8);
  return { height, blend: 1 - smooth(0, 1.2, edge) };
}

/** The authored replacement region: the public access spur and the cape east of the old town. */
export function inAuthoredRegion(x: number, z: number) {
  return (x >= 15 && z >= -47 && z < -18) || (x > 24 && z >= -18 && z <= 30);
}
/** Authored chart metres outside the replacement region (0 inside). */
function authoredRegionOutside(x: number, z: number) {
  const spur = Math.hypot(Math.max(0, 15 - x), Math.max(0, -47 - z, z + 18));
  const cape = Math.hypot(Math.max(0, 24 - x), Math.max(0, -18 - z, z - 30));
  return Math.min(spur, cape);
}

// ---------------------------------------------------------------------------
// World placement: the queries below take world chart coordinates.

let lastX = NaN, lastZ = NaN, last: { x: number; z: number } | null = null;
/** Authored point for a world point near the placed peninsula, else null. Cached for the
 * runs of queries the terrain makes at one point. */
export function peninsulaLocal(x: number, z: number) {
  if (x === lastX && z === lastZ) return last;
  lastX = x; lastZ = z;
  last = nearPeninsula(x, z) ? peninsulaAuthoredPoint(x, z) : null;
  return last;
}
export function inPeninsulaRegion(x: number, z: number) {
  const a = peninsulaLocal(x, z);
  return !!a && inAuthoredRegion(a.x, a.z);
}
export function peninsulaBlendAt(x: number, z: number) {
  const a = peninsulaLocal(x, z);
  return a ? authoredBlendAt(a.x, a.z) : 0;
}
export function peninsulaHeightAt(x: number, z: number) {
  const a = peninsulaLocal(x, z)!;
  return authoredHeightAt(a.x, a.z);
}
export function peninsulaFoundationAt(x: number, z: number): { height: number; blend: number } {
  const a = peninsulaLocal(x, z);
  return a ? authoredFoundationAt(a.x, a.z) : { height: 0, blend: 0 };
}
/** Signed distance to an authored polygon, for a world point. */
export function peninsulaCoastDistance(x: number, z: number, polygon: readonly CoastPoint[]) {
  const a = peninsulaLocal(x, z);
  return a ? coastDistance(a.x, a.z, polygon) : -Infinity;
}
/** How much of the base terrain is the original coast carried with the peninsula: 1 inside
 * its region, fading over 6 authored metres outside so its seams join the new town land. */
export function peninsulaTransplantWeight(x: number, z: number) {
  const a = peninsulaLocal(x, z);
  return a ? 1 - smooth(0, 6, authoredRegionOutside(a.x, a.z)) : 0;
}

/** The authored anchors at their world chart positions. */
const tower = placedPoint([PENINSULA_LIGHTHOUSE.x, PENINSULA_LIGHTHOUSE.z]);
export const PLACED_LIGHTHOUSE = { ...PENINSULA_LIGHTHOUSE, x: tower[0], z: tower[1] } as const;
const cove = placedPoint([PENINSULA_COVE.x, PENINSULA_COVE.z]);
export const PLACED_COVE = { x: cove[0], z: cove[1] } as const;
export const PLACED_CAVE_POINTS: readonly (readonly [number, number])[] = PENINSULA_CAVE.points.map(point => placedPoint(point));
