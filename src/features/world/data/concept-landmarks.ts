import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { MAP_RADIUS, mapDirection, mapFrame, mapMetric, mapPoint } from './world-map';
import { PENINSULA_CAVE, PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import { peninsulaCaveColliders } from './peninsula-cave';
export { caveDistanceAt, caveBlendAt, caveHeightAt } from './peninsula-cave';

/** Authoring data is shared by the walkable terrain, visible blockout, and OBB collision. */
export const SKATE_CENTER = [-27, 15] as const;
export const SKATE_ELEVATION = 2.5;
export const SKATE_SIZE = [14, 11] as const;
export const CAVE_POINTS = PENINSULA_CAVE.points;
export const CAVE_WIDTH = PENINSULA_CAVE.width;
export const CAVE_CLEARANCE = PENINSULA_CAVE.clearance;
export const CAVE_FLOOR = PENINSULA_CAVE.floor;
export const LIGHTHOUSE = PENINSULA_LIGHTHOUSE;
export const ART_WALLS = [{ x: -23, z: -13, elevation: .25, title: 'ART WALL' }, { x: 22, z: -13, elevation: .2, title: 'GRAFFITI WALL' }] as const;
const smooth = (a: number, b: number, value: number) => MathUtils.smoothstep(value, a, b);

export const SKATE_STAIRS = {
  points: [[-23, 0], [-24, 5], [-27, 9]], width: 3, count: 12, rise: .19, baseHeight: .22,
} as const;
const stairMeasureRadius = MAP_RADIUS + SKATE_STAIRS.baseHeight + SKATE_STAIRS.count * SKATE_STAIRS.rise / 2;
export const SKATE_STAIR_LENGTH = SKATE_STAIRS.points.slice(1).reduce((length, b, index) => {
  const a = SKATE_STAIRS.points[index];
  return length + mapDirection(a[0], a[1]).angleTo(mapDirection(b[0], b[1])) * stairMeasureRadius;
}, 0);
export const SKATE_STAIR_BREAKS = [SKATE_STAIRS.points[1][1] / SKATE_STAIRS.points[2][1] * SKATE_STAIR_LENGTH];
// Constant-z treads stay continuous through the bend. A4.35m cross-section
// guarantees at least3m of physical width perpendicular to the steeper flight.
const stairCrossScale = 1.45;

function stairCenterAt(z: number) {
  const [start, bend, end] = SKATE_STAIRS.points;
  const a = z <= bend[1] ? start : bend, b = z <= bend[1] ? bend : end;
  return { x: MathUtils.lerp(a[0], b[0], MathUtils.clamp((z - a[1]) / (b[1] - a[1]), 0, 1)), z };
}

/** Shared riser frame: all points across a tread share one continuous height at the bend. */
export function skateStairFrameAt(along: number, height: number) {
  const distance = MathUtils.clamp(along, 0, SKATE_STAIR_LENGTH);
  const center = stairCenterAt(distance / SKATE_STAIR_LENGTH * SKATE_STAIRS.points[2][1]);
  const frame = mapFrame(center.x, center.z, height);
  return { ...frame, tangent: frame.north, right: frame.east };
}

export function skateStairPointAt(along: number, lateral: number, height: number) {
  const z = MathUtils.clamp(along / SKATE_STAIR_LENGTH, 0, 1) * SKATE_STAIRS.points[2][1];
  const center = stairCenterAt(z), metric = mapMetric(center.x, height);
  return mapPoint(center.x + lateral * stairCrossScale / metric.x, z, height);
}

/** Twelve discrete .19m risers, not a smooth visual ramp; null outside the three-metre treads. */
export function skateStairSurfaceAt(x: number, z: number): { height: number; step: number; along: number; distance: number } | null {
  if (x < -30 || x > -20 || z < -.000001 || z > 9.000001) return null;
  const progress = MathUtils.clamp(z / SKATE_STAIRS.points[2][1], 0, 1), center = stairCenterAt(z);
  const step = Math.min(SKATE_STAIRS.count, Math.floor(progress * SKATE_STAIRS.count + 1e-7));
  const height = SKATE_STAIRS.baseHeight + step * SKATE_STAIRS.rise;
  const distance = Math.abs(x - center.x) * mapMetric(center.x, height).x / stairCrossScale;
  if (distance > SKATE_STAIRS.width / 2 + .025) return null;
  return { height, step, along: progress * SKATE_STAIR_LENGTH, distance };
}

function skateCoordinates(x: number, z: number) {
  const metric = mapMetric(SKATE_CENTER[0], SKATE_ELEVATION);
  return { x: (x - SKATE_CENTER[0]) * metric.x, z: (z - SKATE_CENTER[1]) * metric.z };
}

/** A smooth transition ring keeps both western approaches below the runtime step limit. */
export function skateBlendAt(x: number, z: number) {
  const p = skateCoordinates(x, z);
  const radius = Math.hypot(p.x / (SKATE_SIZE[0] / 2), p.z / (SKATE_SIZE[1] / 2));
  return 1 - smooth(1, 1.24, radius);
}

/** The bowl, bank, and two quarter pipes are terrain, not non-walkable visual props. */
export function skateHeightAt(x: number, z: number): number | undefined {
  if (skateBlendAt(x, z) === 0) return undefined;
  const p = skateCoordinates(x, z);
  const bowl = Math.hypot((p.x + 1) / 3.7, p.z / 2.7);
  let height = SKATE_ELEVATION - .7 * (1 - smooth(.43, 1, bowl));
  // A shallow, open entry ramp crosses the southern bowl lip.
  if (Math.abs(p.x + 1) < 1.15 && p.z < 0) {
    const entry = -.7 * smooth(-3.8, -1, p.z);
    height = Math.min(height, SKATE_ELEVATION + entry * (1 - smooth(.65, 1.15, Math.abs(p.x + 1))));
  }
  // The first quarter pipe rises eastward; the second rises along the northern edge.
  const eastQuarter = 1.05 * smooth(3.7, 5.5, p.x) * (1 - smooth(2, 2.6, Math.abs(p.z))) * (1 - smooth(5.5, 6.25, p.x));
  const northQuarter = .9 * smooth(3, 4.45, p.z) * (1 - smooth(1.8, 2.4, Math.abs(p.x - 1))) * (1 - smooth(4.45, 5.1, p.z));
  const bank = .65 * Math.max(0, 1 - Math.abs((p.x + 4.5) / 1.25)) * (1 - smooth(.7, 1.25, Math.abs(p.z + 3.65)));
  height += Math.max(eastQuarter, northQuarter, bank);
  return height;
}

export type LandmarkSolid = {
  id: string; buildingId: string; center: Vector3; quaternion: Quaternion; inverse: Quaternion;
  half: Vector3; camera: boolean; color: string; matrix: Matrix4; shape: 'box' | 'rock';
};

function solid(id: string, buildingId: string, center: Vector3, quaternion: Quaternion, size: [number, number, number], color: string, camera = true, shape: 'box' | 'rock' = 'box'): LandmarkSolid {
  return { id, buildingId, center, quaternion, inverse: quaternion.clone().invert(), half: new Vector3(...size).multiplyScalar(.5), camera, color, shape, matrix: new Matrix4().compose(center, quaternion, new Vector3(...size)) };
}

const towerFrame = mapFrame(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.elevation);
const towerParts: Array<{ id: string; position: [number, number, number]; size: [number, number, number]; color: string }> = [
  { id: 'foot', position: [0, .2, 0], size: [4.2, .4, 4.2], color: '#B3ADA0' },
  { id: 'lower', position: [0, 2.7, 0], size: [3.1, 4.6, 3.1], color: '#E4DBCB' },
  { id: 'stripe', position: [0, 6, 0], size: [2.8, 2, 2.8], color: '#B76D56' },
  { id: 'upper', position: [0, 8.2, 0], size: [2.55, 2.4, 2.55], color: '#E4DBCB' },
  { id: 'gallery', position: [0, 9.575, 0], size: [4.2, .35, 4.2], color: '#5C6869' },
  { id: 'lantern', position: [0, 10.425, 0], size: [2.5, 1.35, 2.5], color: '#D0C28D' },
];
const towerSolids = towerParts.map(part => solid(`lighthouse:${part.id}`, 'lighthouse', new Vector3(...part.position).applyQuaternion(towerFrame.quaternion).add(towerFrame.position), towerFrame.quaternion, part.size, part.color));

const skateRailFrame = mapFrame(-23.4, 11.1, skateHeightAt(-23.4, 11.1) ?? SKATE_ELEVATION);
const railSolids = [
  solid('skate:rail', 'skate-rail', new Vector3(0, .55, 0).applyQuaternion(skateRailFrame.quaternion).add(skateRailFrame.position), skateRailFrame.quaternion, [2.5, .08, .09], '#B2B5AE', false),
  ...[-1, 1].map(side => solid(`skate:rail-post:${side}`, 'skate-rail', new Vector3(side, .28, 0).applyQuaternion(skateRailFrame.quaternion).add(skateRailFrame.position), skateRailFrame.quaternion, [.075, .5, .075], '#717F7C', false)),
];

const artWallSolids = ART_WALLS.map(wall => {
  const frame = mapFrame(wall.x, wall.z, wall.elevation);
  return solid(`art-wall:${wall.x}`, 'art-wall', new Vector3(0, 1.1, 0).applyQuaternion(frame.quaternion).add(frame.position), frame.quaternion, [3.6, 2.2, .22], '#ABACA0');
});
const shopLinkFrame = mapFrame(11.45, 7, .4);
const shopLink = solid('shop-connector:canopy', 'shop-connector', new Vector3(0, 3.45, 0).applyQuaternion(shopLinkFrame.quaternion).add(shopLinkFrame.position), shopLinkFrame.quaternion, [1.4, .2, 4.8], '#707E7A');

/** Render these exact boxes; do not make a separate hand-authored collision version. */
export const landmarkSolids: LandmarkSolid[] = [...towerSolids, ...railSolids, ...artWallSolids, shopLink];
export const landmarkColliders = [...landmarkSolids, ...peninsulaCaveColliders];
