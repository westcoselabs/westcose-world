import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { TOWN_INTERIORS } from './town-layout';
import type { InteriorId, TownBuilding, WallSegment } from './town-types';
import { MAP_RADIUS, mapFrame } from './world-map';

export const WALL_THICKNESS = 0.22;
export const DOOR_HEIGHT = 2.7;
export const APRON_LENGTH = 2.4;
type Point = { x:number; y:number; z:number };
type LocalPoint = readonly [number, number, number];
const Y_AXIS = new Vector3(0, 1, 0);

/** Placement uses the authored periodic map; geographic helpers remain runtime-only. */
export function buildingFrame(building: TownBuilding, radius = MAP_RADIUS) {
  const frame = mapFrame(building.x, building.z);
  const quaternion = frame.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(Y_AXIS, building.rotation));
  const position = frame.up.clone().multiplyScalar(radius + building.floorHeight);
  return { position, quaternion, inverse: quaternion.clone().invert(), up: frame.up };
}

export function buildingMatrix(building: TownBuilding, radius = MAP_RADIUS): Matrix4 {
  const frame = buildingFrame(building, radius);
  return new Matrix4().compose(frame.position, frame.quaternion, new Vector3(1, 1, 1));
}

export function buildingLocalPoint(building: TownBuilding, point: LocalPoint, radius = MAP_RADIUS): Vector3 {
  const frame = buildingFrame(building, radius);
  return new Vector3(...point).applyQuaternion(frame.quaternion).add(frame.position);
}

export function buildingDoorPoint(building: TownBuilding, outward = 0, lift = 0, radius = MAP_RADIUS): Vector3 {
  return buildingLocalPoint(building, [building.entryOffset, lift, building.depth / 2 + outward], radius);
}

/** Local +Z is the front. Rendering and player/camera collision share every segment. */
export function buildingWallSegments(building: TownBuilding): WallSegment[] {
  const { id, width, depth, height } = building;
  const segment = (suffix:string, center:LocalPoint, size:LocalPoint):WallSegment => ({
    id: `${id}:${suffix}`, buildingId:id, center, size, camera:true,
  });
  if (!building.interior) return [segment('body', [0, height / 2, 0], [width, height, depth])];
  const thickness = WALL_THICKNESS;
  const doorWidth = Math.min(building.entryWidth, width - thickness * 2);
  const offset = MathUtils.clamp(building.entryOffset, -width / 2 + thickness + doorWidth / 2, width / 2 - thickness - doorWidth / 2);
  const leftEdge = offset - doorWidth / 2;
  const rightEdge = offset + doorWidth / 2;
  const frontZ = (depth - thickness) / 2;
  const walls = [
    segment('left', [-(width - thickness) / 2, height / 2, 0], [thickness, height, depth]),
    segment('right', [(width - thickness) / 2, height / 2, 0], [thickness, height, depth]),
    segment('back', [0, height / 2, -(depth - thickness) / 2], [width, height, thickness]),
    segment('front-left', [(-width / 2 + leftEdge) / 2, height / 2, frontZ], [leftEdge + width / 2, height, thickness]),
    segment('front-right', [(rightEdge + width / 2) / 2, height / 2, frontZ], [width / 2 - rightEdge, height, thickness]),
  ];
  if (height > DOOR_HEIGHT) walls.push(segment('header', [offset, (DOOR_HEIGHT + height) / 2, frontZ], [doorWidth, height - DOOR_HEIGHT, thickness]));
  return walls;
}

/** Low-detail furniture proxies also describe the visible bases; center aisles stay open. */
export function interiorFurnitureSegments(building:TownBuilding):WallSegment[] {
  if (!building.interior) return [];
  const { width, depth } = building;
  const furniture = (suffix:string, x:number, z:number, size:LocalPoint):WallSegment => ({
    id:`${building.id}:furniture-${suffix}`, buildingId:building.id, center:[x, size[1] / 2, z], size, camera:true,
  });
  switch (building.interior) {
    // The gallery keeps its centre aisle open from the doors to the feature wall.
    case 'studio': return [
      furniture('worktable', -(width / 2 - 1.1), -1.2, [1.3, 0.9, 3.4]),
      furniture('flat-files', width / 2 - 1.1, -1.2, [1.3, 0.9, 3.4]),
      furniture('plinth', 0, -depth / 2 + 2.4, [2.4, 0.75, 1.1]),
    ];
    case 'workshop': return [
      ...[-1, 1].map(side => furniture(`bench-${side}`, side * (width / 2 - 1), -0.9, [1.3, 0.9, 4.4])),
      furniture('island', 0, -depth / 2 + 2.3, [2.6, 0.9, 1.2]),
    ];
    case 'arcade': return [-1, 1].map(side => furniture(`cabinets-${side}`, side * (width / 2 - 0.8), -0.5, [1.1, 1.9, 3.8]));
    // The lobby's reception counter faces the door across the room; a lounge sofa sits opposite.
    case 'about': return [
      furniture('desk', width / 2 - 1.5, -depth / 2 + 1.5, [2.2, 1.0, 0.8]),
      furniture('sofa', -(width / 2 - 1.1), -depth / 2 + 1.1, [1.8, 0.8, 0.85]),
    ];
    case 'lab': return [-1, 1].map(side => furniture(`lab-bench-${side}`, side * (width / 2 - 0.95), -0.6, [1.25, 0.95, 3.1]));
    // The counter keeps the board wall behind it; its west end stays open to walk round.
    case 'skateshop': return [
      furniture('counter', 0.9, -depth / 2 + 2.2, [5.4, 1.05, 0.75]),
      furniture('deck-rack', width / 2 - 0.35, 1.0, [0.5, 1.7, 3.4]),
      furniture('display', 1.8, 1.4, [1.6, 0.8, 1.2]),
    ];
  }
}

const frames = new WeakMap<TownBuilding, { radius:number; frame:ReturnType<typeof buildingFrame> }>();
function cachedFrame(building:TownBuilding, radius:number) {
  const cached = frames.get(building);
  if (cached?.radius === radius) return cached.frame;
  const frame = buildingFrame(building, radius);
  frames.set(building, { radius, frame });
  return frame;
}

/** Exact intersection of a radial ray and the visible flat tangent floor. */
export function buildingFloorRadius(building:TownBuilding, direction:Point, margin = 0, radius = MAP_RADIUS):number|null {
  const frame = cachedFrame(building, radius);
  const normal = new Vector3(direction.x, direction.y, direction.z).normalize();
  const cosine = frame.up.dot(normal);
  if (cosine < 0.85) return null;
  const support = (radius + building.floorHeight) / cosine;
  const local = normal.multiplyScalar(support).sub(frame.position).applyQuaternion(frame.inverse);
  if (Math.abs(local.x) > building.width / 2 + margin + 1e-7 || Math.abs(local.z) > building.depth / 2 + margin + 1e-7) return null;
  return support;
}

export const buildingApronWidth = (building:TownBuilding) => building.entryWidth + 0.8;

/** An authored door ramp, shared by support queries and the apron mesh samples. */
export function buildingApronRadius(building:TownBuilding, direction:Point, groundRadius:number, radius = MAP_RADIUS):number|null {
  if (!building.interior) return null;
  const frame = cachedFrame(building, radius);
  const normal = new Vector3(direction.x, direction.y, direction.z).normalize();
  const cosine = frame.up.dot(normal);
  if (cosine < 0.85) return null;
  const planeRadius = (radius + building.floorHeight) / cosine;
  const local = normal.multiplyScalar(planeRadius).sub(frame.position).applyQuaternion(frame.inverse);
  const outward = local.z - building.depth / 2;
  const lateral = Math.abs(local.x - building.entryOffset);
  const halfWidth = buildingApronWidth(building) / 2;
  if (outward < -1e-7 || outward > APRON_LENGTH + 1e-7 || lateral > halfWidth + 1e-7) return null;
  const blend = (1 - MathUtils.smoothstep(outward, 0, APRON_LENGTH)) * (1 - MathUtils.smoothstep(lateral, halfWidth - 0.3, halfWidth));
  return MathUtils.lerp(groundRadius, planeRadius, blend);
}

export function buildingApronPoint(building:TownBuilding, lateral:number, outward:number, groundRadiusAt:(direction:Point)=>number, radius = MAP_RADIUS):Vector3 {
  const point = buildingLocalPoint(building, [building.entryOffset + lateral, 0, building.depth / 2 + outward], radius);
  const normal = point.clone().normalize();
  const groundRadius = groundRadiusAt(normal);
  return normal.multiplyScalar(buildingApronRadius(building, normal, groundRadius, radius) ?? groundRadius);
}

/** Interior state is spatial; walking through a door never changes routes or teleports. */
export function activeInteriorAt(position:Point, buildings:readonly TownBuilding[] = TOWN_INTERIORS, radius = MAP_RADIUS):InteriorId|null {
  const point = new Vector3(position.x, position.y, position.z);
  for (const building of buildings) {
    if (!building.interior) continue;
    const frame = cachedFrame(building, radius);
    if (point.distanceToSquared(frame.position) > (Math.hypot(building.width, building.depth) / 2 + building.height) ** 2) continue;
    const local = point.clone().sub(frame.position).applyQuaternion(frame.inverse);
    if (Math.abs(local.x) < building.width / 2 - WALL_THICKNESS * 0.5
      && Math.abs(local.z) < building.depth / 2 - WALL_THICKNESS * 0.5
      && local.y > -0.1 && local.y < building.height) return building.interior;
  }
  return null;
}
