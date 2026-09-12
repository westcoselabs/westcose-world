/** Local coastal reconstruction. All dimensions are metres on the curved world. */
export const PENINSULA_CAVE = {
  points: [[30, -29], [33, -25.5], [36, -22]],
  floor: -.1,
  width: 3.4,
  clearance: 3.6,
} as const;

export const PENINSULA_LIGHTHOUSE = { x: 27, z: -22, elevation: 2.8, height: 12 } as const;
export const PENINSULA_COVE = { x: 36, z: -18 } as const;

export type CoastPoint = readonly [number, number];
// A narrow town neck, two unequal cove arms, and an outward-facing rocky toe.
// The concave eastern edge is the cove's waterline, not another straight beach.
export const PENINSULA_COAST: readonly CoastPoint[] = [
  [24, 12], [29, 14], [32, 9], [34, 1], [35, -5], [40, -7], [43, -12],
  [40, -13], [38, -15], [37.5, -18], [38.5, -21], [41, -23], [44, -25],
  [43, -29], [39, -33], [33, -35], [28, -34], [24, -31], [21, -29],
  [23, -24], [24, -18],
];
export const PENINSULA_TERRACE: readonly CoastPoint[] = [
  [24, -18.5], [26, -16.5], [30, -17], [32, -20], [32, -24],
  [30, -27], [26, -28], [23.5, -25],
];
export const PENINSULA_UPPER: readonly CoastPoint[] = [
  [26, 5], [29, 7], [31, 3], [32, -4], [30, -11], [27, -13], [25, -8],
];
export const PENINSULA_SAND: readonly CoastPoint[] = [
  [33, -12], [38, -11.5], [41, -13], [38, -16], [37.5, -18],
  [39, -21], [41, -23], [39, -25], [34, -23], [31.8, -20], [31.5, -16],
];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Signed distance in local physical metres; positive inside an authored polygon. */
export function coastDistance(x: number, z: number, polygon: readonly CoastPoint[]) {
  let inside = false, distance = Infinity;
  const scaleZ = Math.cos(x / 36);
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
export function peninsulaBlendAt(x: number, z: number) {
  if (!inPeninsulaRegion(x, z)) return 0;
  const west = z < -18 ? smooth(15, 20, x) : smooth(24, 27, x);
  // At the protected boardwalk corner, approach the unchanged level gently.
  const townCorner = x < 24 ? 1 - smooth(-23, -18, z) : 1;
  return west * townCorner * smooth(-43, -39, z) * (1 - smooth(16, 30, z)) * (1 - smooth(47, 51, x));
}

export function peninsulaHeightAt(x: number, z: number) {
  const shore = coastDistance(x, z, PENINSULA_COAST);
  // Low intertidal skirt → broken coastal shelf. No continuous 8m radial wall.
  let height = -3 + 3.12 * smooth(-2.6, .65, shore);
  // Keep the low public beach continuous into the south-west cave approach.
  // This skirt meets the existing public shore; it is not a raised causeway.
  const publicShore = -34 + 1.3 * Math.sin(x * .13) + .8 * Math.cos(x * .3);
  const publicBeach = -3 + 2.9 * smooth(publicShore - 2, publicShore + 3, z);
  height += (Math.max(height, publicBeach) - height) * (1 - smooth(24, 27, x));
  const shelf = .8 + .2 * Math.sin(x * .8 + z * .55);
  height += shelf * smooth(.6, 2.2, shore);
  const terrace = coastDistance(x, z, PENINSULA_TERRACE);
  height += (2.8 - height) * smooth(-1.8, .8, terrace);
  const upper = coastDistance(x, z, PENINSULA_UPPER);
  height += (3.25 - height) * smooth(-3, 1.2, upper);
  // Town approach is a graded neck, with the high part east of its path.
  if (z > -18) height += (.16 - height) * (1 - smooth(24, 28.5, x));
  if (z > 9) height += (.16 - height) * smooth(9, 18, z);
  // Public beach joins the peninsula's low south-west shore without a climb.
  if (x < 27 && z < -25) height += (-.1 - height) * (1 - smooth(24, 28, x)) * smooth(-37, -32, z);
  const sand = coastDistance(x, z, PENINSULA_SAND);
  height += (Math.min(height, -.1) - height) * smooth(-1.4, .5, sand);
  return height;
}

/** A small tangent foundation avoids either burying or floating the unchanged tower. */
export function peninsulaFoundationAt(x: number, z: number): { height: number; blend: number } {
  const tower = PENINSULA_LIGHTHOUSE;
  const a = x / 36, a0 = tower.x / 36, b = (z - tower.z) / 36;
  const dot = Math.sin(a) * Math.sin(a0) + Math.cos(a) * Math.cos(a0) * Math.cos(b);
  const height = (36 + tower.elevation) / dot - 36;
  const east = (36 + height) * (Math.sin(a) * Math.cos(a0) - Math.cos(a) * Math.sin(a0) * Math.cos(b));
  const north = (36 + height) * Math.cos(a) * Math.sin(b);
  const edge = Math.max(Math.abs(east) - 2.8, Math.abs(north) - 2.8);
  return { height, blend: 1 - smooth(0, 1.2, edge) };
}

/** The public access spur belongs to this edit; the town side of z=-18 is protected. */
export function inPeninsulaRegion(x: number, z: number) {
  return (x >= 15 && z >= -43 && z < -18) || (x > 24 && z >= -18 && z <= 30);
}
