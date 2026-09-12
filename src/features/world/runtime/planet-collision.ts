import { MathUtils, Quaternion, Vector3 } from "three";
import { RADIUS, SEA_LEVEL } from "../data/planet";
import { activeInteriorAt, buildingApronRadius, buildingFloorRadius, buildingFrame, buildingWallSegments, interiorFurnitureSegments } from "../data/building-shapes";
import { TOWN_BUILDINGS, TOWN_INTERIORS } from "../data/town-layout";
import { townCoordinates, townSurfaceAt } from "../data/town-surfaces";
import { PIER_RAIL_SEGMENTS } from "../data/pier-rails";
import { landmarkColliders } from "../data/concept-landmarks";
import type { InteriorId } from "../data/town-types";
import type { WorldPosition } from "./types";

export const VISITOR_RADIUS = 0.31;
export const STEP_HEIGHT = 0.32;
const CENTER_HEIGHT = 0.85;

/** The visible shell segments and perimeter furniture are the collision source of truth. */
const boxes = [...TOWN_BUILDINGS.flatMap(building => {
  const frame = buildingFrame(building, RADIUS);
  return [...buildingWallSegments(building), ...interiorFurnitureSegments(building)].map(segment => ({
    id: segment.id, buildingId: building.id,
    center: new Vector3(...segment.center).applyQuaternion(frame.quaternion).add(frame.position),
    quaternion: frame.quaternion, inverse: frame.inverse,
    half: new Vector3(...segment.size).multiplyScalar(0.5), camera: segment.camera !== false,
  }));
}), ...PIER_RAIL_SEGMENTS.map(rail => ({
  id:rail.id, buildingId:'pier-rail', center:rail.center,
  quaternion:rail.quaternion, inverse:rail.quaternion.clone().invert(),
  half:rail.size.clone().multiplyScalar(0.5), camera:false,
})), ...landmarkColliders];

export type SurfaceSupport = { radius:number; kind:"ground"|"floor"|"pier"|"water"; id?:string; interior?:InteriorId };

/** Query actual support, so a deck over the sea is dry and rooms use their flat floors. */
export function supportAt(direction:WorldPosition):SurfaceSupport {
  const coordinates = townCoordinates(direction);
  const town = townSurfaceAt(coordinates.x, coordinates.z);
  const height = town.height;
  const base:SurfaceSupport = {
    radius: RADIUS + Math.max(SEA_LEVEL, height),
    kind: town.kind === 'pier' ? 'pier' : height <= SEA_LEVEL ? 'water' : 'ground',
    id: town.route,
  };
  for (const building of TOWN_INTERIORS) {
    const floor = buildingFloorRadius(building, direction, 0, RADIUS);
    if (floor !== null) return { radius: floor, kind:'floor', id:building.id, interior:building.interior };
  }
  for (const building of TOWN_INTERIORS) {
    const apron = buildingApronRadius(building, direction, base.radius, RADIUS);
    if (apron !== null) return { radius:apron, kind:'floor', id:`${building.id}:apron` };
  }
  return base;
}

export function supportRadius(direction: WorldPosition): number {
  return supportAt(direction).radius;
}

export { activeInteriorAt };

/** Exact great-circle advance; it remains nonsingular at either geographic pole. */
export function advanceOnSphere(up: Vector3, tangent: Vector3, distance: number, radius = RADIUS) {
  const direction = tangent.clone().addScaledVector(up, -tangent.dot(up)).normalize();
  const angle = distance / radius;
  const nextUp = up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle)).normalize();
  const rotation = new Quaternion().setFromUnitVectors(up, nextUp);
  return { up: nextUp, forward: direction.applyQuaternion(rotation).normalize(), rotation };
}

export function buildingContact(position: WorldPosition, radius = VISITOR_RADIUS): { id: string; segmentId:string; normal: Vector3 } | null {
  const point = new Vector3(position.x, position.y, position.z);
  for (const box of boxes) {
    // Avoid inversions for buildings on the far side of the world.
    if (point.distanceToSquared(box.center) > (box.half.length() + 2) ** 2) continue;
    const local = point.clone().sub(box.center).applyQuaternion(box.inverse);
    if (local.y - CENTER_HEIGHT > box.half.y || local.y + CENTER_HEIGHT < -box.half.y) continue;
    const closestX = MathUtils.clamp(local.x, -box.half.x, box.half.x);
    const closestZ = MathUtils.clamp(local.z, -box.half.z, box.half.z);
    const dx = local.x - closestX;
    const dz = local.z - closestZ;
    if (dx * dx + dz * dz >= radius * radius) continue;
    const normal = new Vector3(dx, 0, dz);
    if (normal.lengthSq() < 1e-10) {
      if (box.half.x - Math.abs(local.x) < box.half.z - Math.abs(local.z)) normal.x = Math.sign(local.x) || 1;
      else normal.z = Math.sign(local.z) || 1;
    }
    return { id: box.buildingId, segmentId:box.id, normal: normal.normalize().applyQuaternion(box.quaternion) };
  }
  return null;
}

/** Small fixed steps, checked against support height and building footprints, then wall sliding. */
export function moveOnSurface(up: Vector3, tangent: Vector3, distance: number, currentFootRadius = supportRadius(up)) {
  const attempt = (direction: Vector3, amount: number) => {
    const advanced = advanceOnSphere(up, direction, amount);
    const ground = supportRadius(advanced.up);
    const tooHigh = ground > currentFootRadius + STEP_HEIGHT;
    const center = advanced.up.clone().multiplyScalar(Math.max(ground, currentFootRadius) + CENTER_HEIGHT);
    return { ...advanced, ground, tooHigh, contact: buildingContact(center), distance: amount };
  };
  const direct = attempt(tangent, distance);
  if (!direct.tooHigh && !direct.contact) return { ...direct, blocked: false };
  if (direct.contact) {
    const normal = direct.contact.normal.addScaledVector(up, -direct.contact.normal.dot(up)).normalize();
    const slide = tangent.clone().addScaledVector(normal, -tangent.dot(normal));
    const fraction = slide.length();
    if (fraction > 0.03) {
      const sliding = attempt(slide.normalize(), distance * fraction);
      if (!sliding.tooHigh && !sliding.contact) return { ...sliding, blocked: true };
    }
  }
  return { up: up.clone(), forward: tangent.clone(), rotation: new Quaternion(), ground: currentFootRadius, distance: 0, blocked: true };
}

/** Swept camera ray through expanded OBBs, protecting the near plane at alley corners. */
export function cameraClearDistance(origin: Vector3, direction: Vector3, maxDistance: number, interior:InteriorId|null = activeInteriorAt(origin)): number {
  let nearest = maxDistance;
  const cutawayHeader = interior ? `${TOWN_INTERIORS.find(building => building.interior === interior)?.id}:header` : null;
  for (const box of boxes) {
    if (!box.camera) continue;
    // Match the active room's upper-front cutaway while retaining jamb and wall collision.
    if (box.id === cutawayHeader) continue;
    if (origin.distanceToSquared(box.center) > (maxDistance + box.half.length()) ** 2) continue;
    const point = origin.clone().sub(box.center).applyQuaternion(box.inverse);
    const ray = direction.clone().applyQuaternion(box.inverse);
    let enter = 0;
    let leave = maxDistance;
    for (const axis of ["x", "y", "z"] as const) {
      const extent = box.half[axis] + 0.22;
      if (Math.abs(ray[axis]) < 1e-8) {
        if (Math.abs(point[axis]) > extent) { leave = -1; break; }
      } else {
        const first = (-extent - point[axis]) / ray[axis];
        const second = (extent - point[axis]) / ray[axis];
        enter = Math.max(enter, Math.min(first, second));
        leave = Math.min(leave, Math.max(first, second));
      }
    }
    if (enter <= leave && leave >= 0) nearest = Math.min(nearest, Math.max(0.7, enter - 0.15));
  }
  // Hills use the shared analytic terrain, including the steps and raised walks.
  const sample = new Vector3();
  for (let distance = 0.7; distance < nearest; distance += 0.22) {
    sample.copy(origin).addScaledVector(direction, distance);
    const radius = sample.length();
    if (radius < supportRadius(sample.normalize()) + 0.2) return Math.max(0.7, distance - 0.25);
  }
  return nearest;
}
