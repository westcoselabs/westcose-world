import { Matrix4, Quaternion, Vector3 } from 'three';
import { MAP_RADIUS, mapDirection, mapFrame } from './world-map';
import { PENINSULA_CAVE, PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import { BLUFF_WALL, COURTYARD, DOWNTOWN_FURNITURE, WALK_LEVEL } from './downtown-layout';
import { GRAND_STAIRS, halfpipeRailSegments, parkFootprintOutline, parkPoint, parkSurfaceLocal, SKATEPARK } from './skatepark-layout';
import { peninsulaCaveColliders } from './peninsula-cave';
import { peninsulaCliffColliders } from './peninsula-cliffs';
export { caveDistanceAt, caveBlendAt, caveHeightAt } from './peninsula-cave';

/** Authoring data is shared by the walkable terrain, visible blockout, and OBB collision. */
export const CAVE_POINTS = PENINSULA_CAVE.points;
export const CAVE_WIDTH = PENINSULA_CAVE.width;
export const CAVE_CLEARANCE = PENINSULA_CAVE.clearance;
export const CAVE_FLOOR = PENINSULA_CAVE.floor;
export const LIGHTHOUSE = PENINSULA_LIGHTHOUSE;
export const ART_WALLS = [{ x: -28.8, z: -13.2, elevation: WALK_LEVEL, title: 'ART WALL' }, { x: 22, z: -13, elevation: .2, title: 'GRAFFITI WALL' }] as const;

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

const artWallSolids = ART_WALLS.map(wall => {
  const frame = mapFrame(wall.x, wall.z, wall.elevation);
  return solid(`art-wall:${wall.x}`, 'art-wall', new Vector3(0, 1.1, 0).applyQuaternion(frame.quaternion).add(frame.position), frame.quaternion, [3.6, 2.2, .22], '#ABACA0');
});

/** A box between two surface points, standing on the higher of their radii. */
function span(id: string, owner: string, a: Vector3, b: Vector3, height: number, thickness: number, color: string, camera: boolean, lift = 0): LandmarkSolid {
  const up = a.clone().add(b).normalize(), along = b.clone().sub(a);
  along.addScaledVector(up, -along.dot(up));
  const length = along.length();
  along.divideScalar(length || 1);
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(along, up, along.clone().cross(up)));
  const base = Math.max(a.length(), b.length()) + lift;
  return solid(id, owner, up.clone().multiplyScalar(base + height / 2), quaternion, [length + .04, height, thickness], color, camera);
}

// The bluff's retaining wall faces the west promenade, broken only by the grand stairs.
// Short segments follow the planet's curve. The park deck stops at its outer face, so the
// park fence guards the whole drop.
const WALL_COLOR = '#B9B4A6';
const bluffSolids: LandmarkSolid[] = [], bluffDecor: LandmarkSolid[] = [];
for (const [z0, z1] of [[BLUFF_WALL.z0, -GRAND_STAIRS.halfWidth], [GRAND_STAIRS.halfWidth, BLUFF_WALL.z1]] as const) {
  const count = Math.ceil((z1 - z0) / 1.4), x = BLUFF_WALL.x - BLUFF_WALL.thickness / 2;
  for (let i = 0; i < count; i++) {
    const a = mapDirection(x, z0 + (z1 - z0) * i / count).multiplyScalar(MAP_RADIUS + WALK_LEVEL - .6);
    const b = mapDirection(x, z0 + (z1 - z0) * (i + 1) / count).multiplyScalar(MAP_RADIUS + WALK_LEVEL - .6);
    bluffSolids.push(span(`bluff-wall:${z0}:${i}`, 'bluff-wall', a, b, SKATEPARK.deck - WALK_LEVEL + .65, BLUFF_WALL.thickness, WALL_COLOR, true));
    const za = z0 + (z1 - z0) * i / count;
    // A wide coping slab covers the terrain seam just behind the wall top.
    const capAt = (z: number) => mapDirection(BLUFF_WALL.x - .75, z).multiplyScalar(MAP_RADIUS + SKATEPARK.deck - .08);
    bluffDecor.push(span(`bluff-cap:${z0}:${i}`, 'bluff-wall', capAt(za), capAt(z0 + (z1 - z0) * (i + 1) / count), .12, 1.5, '#CFCABB', false));
  }
}
// Grand-stair cheek walls close the stair ends against the bluff.
for (const side of [-1, 1]) {
  const z = side * (GRAND_STAIRS.halfWidth + .2), steps = 6;
  for (let i = 0; i < steps; i++) {
    const x0 = GRAND_STAIRS.foot + (GRAND_STAIRS.top - GRAND_STAIRS.foot) * i / steps, x1 = GRAND_STAIRS.foot + (GRAND_STAIRS.top - GRAND_STAIRS.foot) * (i + 1) / steps;
    const height = GRAND_STAIRS.base + (SKATEPARK.deck - GRAND_STAIRS.base) * (i + 1) / steps + .45 - WALK_LEVEL;
    bluffSolids.push(span(`stair-cheek:${side}:${i}`, 'grand-stairs', mapDirection(x0, z).multiplyScalar(MAP_RADIUS + WALK_LEVEL - .2), mapDirection(x1, z).multiplyScalar(MAP_RADIUS + WALK_LEVEL - .2), height + .2, .4, WALL_COLOR, true));
  }
}

/** The park fence follows the footprint, open at the east entrance above the stairs, and
 * stands on whatever is beneath it (the wall bank's top runs out to the edge). Segments
 * are [u0, v0, u1, v1, base0, base1]. The park kit draws posts and rails; these thin
 * panels only collide. */
export const PARK_FENCE_INSET = .3;
export function parkFenceSegments(): [number, number, number, number, number, number][] {
  const points = parkFootprintOutline(PARK_FENCE_INSET, 2), out: [number, number, number, number, number, number][] = [];
  const base = (u: number, v: number) => parkSurfaceLocal(u, v)?.height ?? SKATEPARK.deck;
  for (let i = 0; i < points.length; i++) {
    const [u0, v0] = points[i], [u1, v1] = points[(i + 1) % points.length];
    if (u0 > SKATEPARK.halfU - 1 && u1 > SKATEPARK.halfU - 1 && Math.min(Math.abs(v0), Math.abs(v1)) < GRAND_STAIRS.halfWidth - .2) continue;
    out.push([u0, v0, u1, v1, base(u0, v0), base(u1, v1)]);
  }
  return out;
}
// A panel crossing a step stands on the lower side and reaches the higher side's rail.
const fenceSolids = parkFenceSegments().map(([u0, v0, u1, v1, b0, b1], i) => span(`park-fence:${i}`, 'park-fence', parkPoint(u0, v0, Math.min(b0, b1)), parkPoint(u1, v1, Math.min(b0, b1)), 1.05 + Math.abs(b1 - b0), .06, '#56645F', false));

/** Solid street furniture: rendered by the downtown kit, collided here. */
const furnitureColliders: LandmarkSolid[] = DOWNTOWN_FURNITURE.map((item, i) => {
  const frame = mapFrame(item.x, item.z, WALK_LEVEL);
  const size: [number, number, number] = item.kind === 'palm' ? [.42, 3.4, .42] : item.kind === 'lamp' ? [.2, 4.2, .2] : [1.7, .5, .55];
  const quaternion = frame.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), item.yaw ?? 0));
  return solid(`furniture:${item.kind}:${i}`, `street-${item.kind}`, new Vector3(0, size[1] / 2, 0).applyQuaternion(quaternion).add(frame.position), quaternion, size, '#56645F', item.kind === 'palm');
});
const sculptureFrame = mapFrame(COURTYARD.sculpture[0], COURTYARD.sculpture[1], WALK_LEVEL);
const sculptureCollider = solid('courtyard:sculpture', 'courtyard-sculpture', new Vector3(0, 1.2, 0).applyQuaternion(sculptureFrame.quaternion).add(sculptureFrame.position), sculptureFrame.quaternion, [3.2, 2.4, 3.2], '#56645F');

/** Render these exact boxes; do not make a separate hand-authored collision version. */
export const landmarkSolids: LandmarkSolid[] = [...towerSolids, ...artWallSolids, ...bluffSolids];
/** Drawn like the solids but never collided (the wall-top coping sits flush with the deck). */
export const landmarkDecor: LandmarkSolid[] = bluffDecor;
/** Solids drawn by their own scene kits (street furniture, the plaza sculpture). */
/** The park arch over the top of the grand stairs (drawn by the downtown kit): its posts,
 * and the sign board the cameras must not slip behind. */
const archFrame = mapFrame(GRAND_STAIRS.top - .5, 0, SKATEPARK.deck);
const archQuaternion = archFrame.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
const archPart = (id: string, position: [number, number, number], size: [number, number, number]) => solid(`stair-arch:${id}`, 'stair-arch', new Vector3(...position).applyQuaternion(archQuaternion).add(archFrame.position), archQuaternion, size, '#394F51');
const archColliders = [archPart('board', [0, 3.25, 0], [GRAND_STAIRS.halfWidth * 2 + .9, .95, .2]), ...[-1, 1].map(side => archPart(`post:${side}`, [side * (GRAND_STAIRS.halfWidth + .25), 1.7, 0], [.3, 3.4, .3]))];
/** Railings round the halfpipe decks, so nobody walks off a 3.5m drop. */
const halfpipeRails = halfpipeRailSegments().map(([u0, v0, u1, v1, base], i) => span(`halfpipe-rail:${i}`, 'halfpipe-rail', parkPoint(u0, v0, SKATEPARK.deck + base), parkPoint(u1, v1, SKATEPARK.deck + base), 1.05, .06, '#56645F', false));
export const hiddenColliders: LandmarkSolid[] = [...furnitureColliders, sculptureCollider, ...fenceSolids, ...halfpipeRails, ...archColliders];
export const landmarkColliders = [...landmarkSolids, ...hiddenColliders, ...peninsulaCaveColliders, ...peninsulaCliffColliders];
