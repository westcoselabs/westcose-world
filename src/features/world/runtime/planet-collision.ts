import { MathUtils, Quaternion, Vector3 } from "three";
import { RADIUS, SEA_LEVEL } from "../data/planet";
import { activeInteriorAt, buildingApronRadius, buildingFloorRadius, buildingFrame, buildingWallSegments, interiorFurnitureSegments } from "../data/building-shapes";
import { TOWN_BUILDINGS, TOWN_INTERIORS } from "../data/town-layout";
import { townCoordinates, townSurfaceAt } from "../data/town-surfaces";
import { PIER_RAIL_SEGMENTS } from "../data/pier-rails";
import { landmarkColliders } from "../data/concept-landmarks";
import { cavePortalCameraClearDistance, caveSectionAt } from "../data/peninsula-cave";
import type { InteriorId } from "../data/town-types";
import type { SupportLayer, WorldPosition } from "./types";

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

export type SurfaceSupport = {
  radius:number;
  kind:"ground"|"floor"|"pier"|"water";
  /** `tunnel` is a second radial support beneath the unchanged outdoor terrain. */
  layer:SupportLayer;
  id?:string;
  interior?:InteriorId;
};

/**
 * A direction alone is ambiguous below the lighthouse: it intersects both the
 * terrace and the cave floor. Callers that have a foot radius/layer keep that
 * context through movement; callers without it deliberately get the outdoors.
 */
export type SupportHint = { footRadius?:number; layer?:SupportLayer };

const CAVE_QUERY_MARGIN = .06;
const PORTAL_ENTRY_FLOOR_BAND = .25;
// Physical metres beyond the cave end, still inside its 2.4m open-cut apron. On the
// radius-72 globe the chart-authored cap face rises ~1.7m out, so the handoff starts
// on the low beach before it.
const EXIT_HANDOFF_MIN_APRON = 2.05;
const EXIT_HANDOFF_FLOOR_EPSILON = .1;

/** The normal exposed support. This is intentionally the no-hint default. */
export function upperSupportAt(direction:WorldPosition):SurfaceSupport {
  const coordinates = townCoordinates(direction);
  const town = townSurfaceAt(coordinates.x, coordinates.z);
  const height = town.height;
  const base:SurfaceSupport = {
    radius: RADIUS + Math.max(SEA_LEVEL, height),
    kind: town.kind === 'pier' ? 'pier' : height <= SEA_LEVEL ? 'water' : 'ground',
    layer:'upper', id: town.route,
  };
  for (const building of TOWN_INTERIORS) {
    const floor = buildingFloorRadius(building, direction, 0, RADIUS);
    if (floor !== null) return { radius: floor, kind:'floor', layer:'upper', id:building.id, interior:building.interior };
  }
  for (const building of TOWN_INTERIORS) {
    const apron = buildingApronRadius(building, direction, base.radius, RADIUS);
    if (apron !== null) return { radius:apron, kind:'floor', layer:'upper', id:`${building.id}:apron` };
  }
  return base;
}

/**
 * The shared cave query measures the finite inner corridor and its two straight
 * portal aprons. Its widened bend comes from the exact rendered lining, rather
 * than a second, approximate capsule in the collision runtime.
 */
function tunnelSectionAt(direction:WorldPosition) {
  const { x, z } = townCoordinates(direction);
  const section = caveSectionAt(x, z);
  return section && section.distance <= section.halfWidth + CAVE_QUERY_MARGIN ? section : null;
}

function tunnelSupportAt(direction:WorldPosition):SurfaceSupport|null {
  const section = tunnelSectionAt(direction);
  if (!section) return null;
  return { radius:RADIUS + Math.max(SEA_LEVEL, section.floor), kind:'ground', layer:'tunnel', id:'cave' };
}

function footPrefersTunnel(footRadius:number|undefined, upper:SurfaceSupport, lower:SurfaceSupport):boolean {
  return footRadius !== undefined
    && Math.abs(footRadius - lower.radius) + .03 < Math.abs(footRadius - upper.radius);
}

/** Query support while retaining radial context where a stack exists. */
export function supportAt(direction:WorldPosition, hint:SupportHint = {}):SurfaceSupport {
  const upper = upperSupportAt(direction);
  const lower = tunnelSupportAt(direction);
  if (!lower) return upper;
  const section = tunnelSectionAt(direction);
  if (hint.layer === 'upper') {
    // The public beach/cove portals are low, continuous connectors. A visitor
    // who is already at that low elevation can enter; an upper-deck visitor at
    // the same map direction can never fall through the foundation.
    // A low visitor reaches either public portal before the outdoor surface
    // turns steep. Switching here prevents the growing upper slope from
    // blocking the entrance, while the terrace remains far outside this band.
    // The outer exit apron is the explicit handoff boundary. Letting an
    // already-upper visitor re-enter its still-queryable portal extension
    // beyond this point creates upper/tunnel chatter on every fixed step.
    const beyondExitHandoff = section?.portal === 'exit'
      && section.along >= section.length + EXIT_HANDOFF_MIN_APRON;
    return section?.portal && !beyondExitHandoff
      && hint.footRadius !== undefined && hint.footRadius <= lower.radius + PORTAL_ENTRY_FLOOR_BAND
      ? lower
      : upper;
  }
  if (hint.layer === 'tunnel') {
    // The rear apron opens onto low cove sand. Do not hand off at its inner
    // edge: that upper surface immediately rises into the cap on a reverse
    // walk. Only the outer, stably-low sand portion returns to outdoor support.
    if (section?.portal === 'exit'
      && section.along >= section.length + EXIT_HANDOFF_MIN_APRON
      && upper.radius <= lower.radius + EXIT_HANDOFF_FLOOR_EPSILON) return upper;
    return lower;
  }
  if (footPrefersTunnel(hint.footRadius, upper, lower)) return lower;
  return upper;
}

export function supportRadius(direction: WorldPosition, hint?:SupportHint): number {
  return supportAt(direction, hint).radius;
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
export function moveOnSurface(
  up: Vector3,
  tangent: Vector3,
  distance: number,
  currentFootRadius = supportRadius(up),
  currentLayer?:SupportLayer,
) {
  const initial = supportAt(up, { footRadius:currentFootRadius, layer:currentLayer });
  const layer = currentLayer ?? initial.layer;
  const attempt = (direction: Vector3, amount: number) => {
    const advanced = advanceOnSphere(up, direction, amount);
    const support = supportAt(advanced.up, { footRadius:currentFootRadius, layer });
    const ground = support.radius;
    const tooHigh = ground > currentFootRadius + STEP_HEIGHT;
    const center = advanced.up.clone().multiplyScalar(Math.max(ground, currentFootRadius) + CENTER_HEIGHT);
    return { ...advanced, support, ground, tooHigh, contact: buildingContact(center), distance: amount };
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
  return { up: up.clone(), forward: tangent.clone(), rotation: new Quaternion(), support:initial, ground: currentFootRadius, distance: 0, blocked: true };
}

/** True only within the lower tunnel void, never merely near its exterior rock. */
function isInsideTunnelVoid(position:WorldPosition):boolean {
  const radius = Math.hypot(position.x, position.y, position.z);
  const direction = new Vector3(position.x, position.y, position.z).normalize();
  const section = tunnelSectionAt(direction);
  const elevation = radius - RADIUS;
  return !!section
    && elevation >= section.floor - .14
    && elevation <= section.ceiling + .14;
}

/** Swept camera ray through expanded OBBs, protecting the near plane at alley corners. */
export function cameraClearDistance(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  interior:InteriorId|null = activeInteriorAt(origin),
  layer?:SupportLayer,
): number {
  // Direct diagnostic callers do not have controller state. Their target sits
  // 1.4m above the selected foot support, so infer the lower layer only when
  // its actual radial position proves it is already in the passage.
  const activeLayer = layer ?? supportAt(origin, { footRadius:origin.length() - 1.4 }).layer;
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
  // Portal collars are detailed terrain-derived triangles rather than fitted
  // boxes. Their registry expands each triangle into a local .22m prism, so
  // this preserves the same near-plane safety margin as the OBB collision.
  nearest = Math.min(nearest, cavePortalCameraClearDistance(origin, direction, nearest));
  // The outdoor shell remains solid above the tunnel. In the lined void itself,
  // local roof/wall OBBs are the source of truth; querying the upper radial
  // surface there would incorrectly close the real passage to the camera.
  const sample = new Vector3();
  for (let distance = 0.7; distance < nearest; distance += 0.22) {
    sample.copy(origin).addScaledVector(direction, distance);
    const radius = sample.length();
    const up = sample.clone().normalize();
    if (!(activeLayer === 'tunnel' && isInsideTunnelVoid(sample)) && radius < upperSupportAt(up).radius + 0.2) return Math.max(0.7, distance - 0.25);
  }
  return nearest;
}
