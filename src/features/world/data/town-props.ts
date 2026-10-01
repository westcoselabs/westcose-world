/** Solid street, beach and pier props. Their placement is shared by the scene kits that draw
 * them and the collision boxes that stop the walker, so the two can never drift apart.
 * Leaf data module: chart coordinates and local frames only. */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { MAP_RADIUS, mapFrame } from './world-map';
import { CUL_DE_SACS, WALK_LEVEL } from './downtown-layout';
import { pierFrameAt, pierHeightAtZ } from './pier-layout';
import type { LandmarkSolid } from './concept-landmarks';

const Y = new Vector3(0, 1, 0);
type Triple = readonly [number, number, number];

/** The motel on Main St: a glazed corner lobby (the About room) and a two-storey room wing.
 * The wing is set back so its open upper walkway roofs a ground-floor walkway; a stair at
 * the alley end climbs to it. Both face north (rotation PI): local +X points west. */
export const MOTEL = {
  floorHeight: .45,
  lobby: { x: 10.1, z: -9.6, width: 6.2, depth: 6.6, height: 4.6 },
  rooms: { x: 18.4, z: -10.3, width: 10, depth: 5.6, height: 6.6, upper: 3.3, walkway: 1.25, doors: 3 },
  /** The neon sign on its own pylon at the Pier St corner. */
  pylon: { x: 6.5, z: -8.2, height: 10.4 },
} as const;
const roomsFrame = (() => {
  const { x, z } = MOTEL.rooms, frame = mapFrame(x, z);
  const quaternion = frame.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(Y, Math.PI));
  return { quaternion, matrix: new Matrix4().compose(frame.up.clone().multiplyScalar(MAP_RADIUS + MOTEL.floorHeight), quaternion, new Vector3(1, 1, 1)) };
})();
/** The room wing's local frame (building origin, local +Z = the street front). */
export const MOTEL_ROOMS_FRAME = roomsFrame.matrix;
const r = MOTEL.rooms;
/** Walkway posts at the front edge, ground to roof, in the wing's local frame. */
export const MOTEL_POSTS: readonly Triple[] = Array.from({ length: 5 }, (_, i) => [(i / 4 - .5) * (r.width - .3), r.height / 2, r.depth / 2 + r.walkway - .1] as const);
/** The stair along the east (alley) wall: local x span, its foot and top in local z. */
export const MOTEL_STAIR = { x0: -r.width / 2 - 1.2, x1: -r.width / 2, footZ: -r.depth / 2 + .2, topZ: r.depth / 2, steps: 15 } as const;

/** The overlook railing on the Cliff Cul-de-sac, above the hidden-beach cove (degrees). */
export const OVERLOOK = { from: -12, to: 48, radius: CUL_DE_SACS[0].walk - .12, height: 1.05 } as const;
export const overlookPoint = (degrees: number, radius: number = OVERLOOK.radius) => {
  const [cx, cz] = CUL_DE_SACS[0].center, a = degrees * Math.PI / 180;
  return { x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius };
};

/** Beach furniture. Positions keep clear of the pier, both beach ramps and the waterline. */
export type BeachProp =
  | { kind: 'lifeguard'; x: number; z: number; yaw: number; color: string }
  | { kind: 'umbrella'; x: number; z: number; yaw: number; color: string }
  | { kind: 'volleyball'; x: number; z: number; yaw: number }
  | { kind: 'firepit'; x: number; z: number }
  | { kind: 'boards'; x: number; z: number; yaw: number }
  | { kind: 'bin'; x: number; z: number }
  | { kind: 'shower'; x: number; z: number }
  | { kind: 'palm'; x: number; z: number };
export const BEACH_PROPS: readonly BeachProp[] = [
  { kind: 'lifeguard', x: -23.5, z: -25.2, yaw: 0, color: '#C4553F' },
  { kind: 'lifeguard', x: 16.5, z: -25.6, yaw: .12, color: '#5B7E8A' },
  { kind: 'volleyball', x: 7.5, z: -24.4, yaw: Math.PI / 2 },
  { kind: 'umbrella', x: -16.4, z: -29.6, yaw: .4, color: '#C4553F' },
  { kind: 'umbrella', x: -5.2, z: -22.6, yaw: 1.3, color: '#E9DFCE' },
  { kind: 'umbrella', x: -7.4, z: -31, yaw: 2.2, color: '#5B7E8A' },
  { kind: 'umbrella', x: 12.6, z: -30, yaw: -.6, color: '#D9A441' },
  { kind: 'umbrella', x: 22.4, z: -28.2, yaw: .9, color: '#C4553F' },
  { kind: 'umbrella', x: 27.8, z: -23.4, yaw: -1.6, color: '#E9DFCE' },
  { kind: 'firepit', x: -27, z: -21.6 },
  { kind: 'boards', x: 22.6, z: -19.3, yaw: 0 },
  { kind: 'boards', x: -11.2, z: -19.3, yaw: 0 },
  { kind: 'bin', x: -7.6, z: -18.7 }, { kind: 'bin', x: 7.8, z: -18.7 }, { kind: 'bin', x: 27.6, z: -18.7 },
  { kind: 'shower', x: -3.1, z: -18.9 },
  // A loose row of palms along the back of the beach, Venice style.
  { kind: 'palm', x: -22.4, z: -18.9 }, { kind: 'palm', x: -9.4, z: -18.8 }, { kind: 'palm', x: 4.2, z: -19 },
  { kind: 'palm', x: 14.6, z: -18.8 }, { kind: 'palm', x: 25.4, z: -18.9 },
];

/** The bait shack on the east side of the pier head (pier-across metres and chart z). */
/** Inside the head's perimeter walking loop, east of the centre line out to the seaward rail. */
export const PIER_SHACK = { across0: 1.4, across1: 4.4, z0: -62.4, z1: -58.8, height: 2.9 } as const;

function box(id: string, owner: string, center: Vector3, quaternion: Quaternion, size: Triple, camera: boolean): LandmarkSolid {
  return { id, buildingId: owner, center, quaternion, inverse: quaternion.clone().invert(), half: new Vector3(...size).multiplyScalar(.5), camera, color: '#56645F', shape: 'box', matrix: new Matrix4().compose(center, quaternion, new Vector3(...size)) };
}
/** A box in a chart frame at an elevation, its base on that elevation. */
function standing(id: string, owner: string, x: number, z: number, elevation: number, size: Triple, yaw = 0, camera = false) {
  const frame = mapFrame(x, z, elevation), quaternion = frame.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(Y, yaw));
  return box(id, owner, frame.position.clone().addScaledVector(frame.up, size[1] / 2), quaternion, size, camera);
}
const inRooms = (id: string, center: Triple, size: Triple, camera = false) =>
  box(id, 'motel-rooms', new Vector3(...center).applyMatrix4(MOTEL_ROOMS_FRAME), roomsFrame.quaternion, size, camera);

const motelColliders = [
  ...MOTEL_POSTS.map((p, i) => inRooms(`motel:post:${i}`, p, [.18, r.height, .18])),
  inRooms('motel:stair', [(MOTEL_STAIR.x0 + MOTEL_STAIR.x1) / 2, (r.upper + 1) / 2, (MOTEL_STAIR.footZ + MOTEL_STAIR.topZ) / 2], [MOTEL_STAIR.x1 - MOTEL_STAIR.x0, r.upper + 1, MOTEL_STAIR.topZ - MOTEL_STAIR.footZ], true),
  standing('motel:pylon', 'motel-pylon', MOTEL.pylon.x, MOTEL.pylon.z, WALK_LEVEL - .2, [.6, MOTEL.pylon.height, .6], 0, true),
];
const overlookColliders = (() => {
  const out: LandmarkSolid[] = [], steps = 10;
  for (let i = 0; i < steps; i++) {
    const a = OVERLOOK.from + (OVERLOOK.to - OVERLOOK.from) * i / steps, b = OVERLOOK.from + (OVERLOOK.to - OVERLOOK.from) * (i + 1) / steps;
    const p = overlookPoint((a + b) / 2), pa = overlookPoint(a), pb = overlookPoint(b);
    const length = Math.hypot(pb.x - pa.x, (pb.z - pa.z) * Math.cos(p.x / MAP_RADIUS)) + .05;
    out.push(standing(`overlook:rail:${i}`, 'overlook-rail', p.x, p.z, WALK_LEVEL, [.12, OVERLOOK.height, length], (a + b) / 2 * Math.PI / 180));
  }
  return out;
})();
const beachColliders = BEACH_PROPS.flatMap((prop, i): LandmarkSolid[] => {
  switch (prop.kind) {
    case 'lifeguard': return [standing(`beach:lifeguard:${i}`, 'lifeguard-tower', prop.x, prop.z, -.4, [2.5, 4.6, 2.5], prop.yaw, true)];
    case 'umbrella': return [standing(`beach:umbrella:${i}`, 'beach-umbrella', prop.x, prop.z, -.4, [.12, 2.6, .12])];
    case 'volleyball': return [-1, 1].map(side => {
      const frame = mapFrame(prop.x, prop.z), along = frame.east.clone().multiplyScalar(Math.cos(prop.yaw)).addScaledVector(frame.north, Math.sin(prop.yaw));
      const x = prop.x + along.dot(frame.east) * side * 4.2, z = prop.z + along.dot(frame.north) * side * 4.2 / Math.cos(prop.x / MAP_RADIUS);
      return standing(`beach:volleyball:${i}:${side}`, 'volleyball-post', x, z, -.4, [.14, 3, .14]);
    });
    case 'firepit': return [standing(`beach:firepit:${i}`, 'fire-pit', prop.x, prop.z, -.4, [1.5, .85, 1.5])];
    case 'boards': return [standing(`beach:boards:${i}`, 'board-rack', prop.x, prop.z, -.4, [2.6, 2.4, .5], prop.yaw)];
    case 'bin': return [standing(`beach:bin:${i}`, 'beach-bin', prop.x, prop.z, -.2, [.6, 1.2, .6])];
    case 'shower': return [standing(`beach:shower:${i}`, 'beach-shower', prop.x, prop.z, -.2, [.2, 2.6, .2])];
    case 'palm': return [standing(`beach:palm:${i}`, 'beach-palm', prop.x, prop.z, -.3, [.42, 3.6, .42], 0, true)];
  }
});
/** The bait shack stands on the pier head deck. */
const shackCollider = (() => {
  const across = (PIER_SHACK.across0 + PIER_SHACK.across1) / 2, z = (PIER_SHACK.z0 + PIER_SHACK.z1) / 2;
  const frame = pierFrameAt(across, z, pierHeightAtZ(z));
  const size: Triple = [PIER_SHACK.across1 - PIER_SHACK.across0, PIER_SHACK.height + .5, PIER_SHACK.z1 - PIER_SHACK.z0];
  return box('pier:shack', 'pier-shack', frame.position.clone().addScaledVector(frame.up, size[1] / 2), frame.quaternion.clone(), size, true);
})();

export const TOWN_PROP_COLLIDERS: LandmarkSolid[] = [...motelColliders, ...overlookColliders, ...beachColliders, shackCollider];
