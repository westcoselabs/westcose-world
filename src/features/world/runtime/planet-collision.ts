import { MathUtils, Quaternion, Vector3 } from "three";
import { RADIUS, SEA_LEVEL } from "../data/planet";
import { activeInteriorAt, buildingApronRadius, buildingFloorRadius, buildingFrame, buildingWallSegments, interiorFurnitureSegments } from "../data/building-shapes";
import { TOWN_BUILDINGS, TOWN_INTERIORS } from "../data/town-layout";
import { townCoordinates, townSurfaceAt } from "../data/town-surfaces";
import { PIER_RAIL_SEGMENTS } from "../data/pier-rails";
import { landmarkColliders } from "../data/concept-landmarks";
import { isInsideSeaCaveVoid, SEA_CAVE_FRAME, seaCaveAt, seaCaveGradient, seaCavePortalAt } from "../data/sea-cave";
import { SEA_CAVE_MOUTH, SEA_CAVE_PASSAGES, SEA_CAVE_WALL_OFFSET } from "../data/sea-cave-layout";
import { seaCaveOpeningCameraClearDistance } from "../data/sea-cave-openings";
import { lighthouseCameraBlocked, lighthouseSupportAt } from "../data/lighthouse-tower";
import type { InteriorId } from "../data/town-types";
import type { SupportLayer, WorldPosition } from "./types";

export const VISITOR_RADIUS = 0.31;
export const STEP_HEIGHT = 0.32;
/** Bowls are smooth concrete with vertical tops: a visitor in one scrambles up its wall
 * this far in a stride, so nobody walks into a pool and is trapped at the bottom. */
const BOWL_SCRAMBLE_HEIGHT = 1.5;
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
  /** `tunnel` is the sea caves' floor, a second radial support beneath the outdoor terrain. */
  layer:SupportLayer;
  id?:string;
  interior?:InteriorId;
  /** Rock or masonry: never walkable. `radius` stays the nearest real floor; `normal` (a
   * tangent, either sign) lets movement slide along the face instead of sticking. */
  solid?:boolean;
  normal?:Vector3;
};

/**
 * A direction alone is ambiguous over the caves and on the lighthouse stair: it can meet
 * the headland, a cave floor, the stair and the balcony. Callers that have a foot radius
 * and layer keep that context through movement; callers without it get the ground.
 */
export type SupportHint = { footRadius?:number; layer?:SupportLayer };

const PORTAL_ENTRY_FLOOR_BAND = .25;
/** Metres out past the mouth, inside its apron, where the beach takes back over from the
 * cave floor on the way out. */
const EXIT_HANDOFF_MIN_APRON = 2.05;
/** Walkable half width of the tunnel at the mouth. */
const MOUTH_HALF_WIDTH = SEA_CAVE_PASSAGES[0].width[1] / 2 - SEA_CAVE_WALL_OFFSET;

/** The normal exposed support. This is intentionally the no-hint default; a foot radius
 * only matters on the lighthouse, where the stair and balcony stack over the terrace. */
export function upperSupportAt(direction:WorldPosition, footRadius?:number):SurfaceSupport {
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
  const tower = lighthouseSupportAt(direction, base.radius, footRadius, STEP_HEIGHT);
  if (tower) return { radius:tower.radius, kind:'ground', layer:'upper', id:tower.id, solid:tower.solid, normal:tower.normal };
  return base;
}

type CaveQuery = { sample:NonNullable<ReturnType<typeof seaCaveAt>>; s:number; lateral:number };
/** The sea-cave volume at a direction, with its place relative to the mouth. */
function caveQueryAt(direction:WorldPosition):CaveQuery|null {
  const { x, z } = townCoordinates(direction);
  const sample = seaCaveAt(x, z);
  if (!sample) return null;
  const portal = seaCavePortalAt(sample.u, sample.v);
  return { sample, s:portal.s, lateral:portal.lateral };
}
/** The cave floor inside the plan; solid rock everywhere outside it. */
function caveSupport(query:CaveQuery):SurfaceSupport {
  const { sample } = query, radius = RADIUS + Math.max(SEA_LEVEL, sample.floor);
  if (sample.inside) return { radius, kind:'ground', layer:'tunnel', id:`cave:${sample.zone}` };
  const gradient = seaCaveGradient(sample.u, sample.v), tangents = SEA_CAVE_FRAME.tangents(sample.u, sample.v);
  return { radius, kind:'ground', layer:'tunnel', id:'cave:rock', solid:true,
    normal:tangents.east.multiplyScalar(gradient.u).addScaledVector(tangents.north, gradient.v).normalize() };
}
/** The open-air apron in front of the mouth, where beach and cave floor meet. */
const inMouthApron = (query:CaveQuery) => query.s <= 0 && query.s >= -SEA_CAVE_MOUTH.apron && Math.abs(query.lateral) <= MOUTH_HALF_WIDTH;
/** The beach just outside the mouth: the only place a cave visitor returns outdoors. */
const outsideMouth = (query:CaveQuery) => query.s < 0 && query.s > -8 && Math.abs(query.lateral) < 6;

function footPrefersTunnel(footRadius:number|undefined, upper:SurfaceSupport, lower:SurfaceSupport):boolean {
  return footRadius !== undefined
    && Math.abs(footRadius - lower.radius) + .03 < Math.abs(footRadius - upper.radius);
}

/** Query support while retaining radial context where a stack exists. */
export function supportAt(direction:WorldPosition, hint:SupportHint = {}):SurfaceSupport {
  const upper = upperSupportAt(direction, hint.footRadius);
  const query = caveQueryAt(direction);
  if (!query) return upper;
  if (hint.layer === 'upper') {
    // A low visitor on the beach steps into the mouth inside its apron. Anyone up on the
    // headland or the lighthouse terrace at the same direction is never pulled into the rock.
    return query.sample.inside && inMouthApron(query) && hint.footRadius !== undefined
      && hint.footRadius <= RADIUS + query.sample.floor + PORTAL_ENTRY_FLOOR_BAND ? caveSupport(query) : upper;
  }
  const lower = caveSupport(query);
  if (hint.layer === 'tunnel') {
    // Out through the mouth, the dry beach takes over once it is level with the visitor:
    // past the apron's handoff, or stepping off the apron's side. Everywhere else, the window
    // lip included, outside the plan is rock, so nobody walks out of the caves into the sea.
    if (outsideMouth(query) && (query.s < -EXIT_HANDOFF_MIN_APRON || !query.sample.inside)
      && !upper.solid && upper.kind !== 'water' && Math.abs(upper.radius - (hint.footRadius ?? lower.radius)) <= STEP_HEIGHT) return upper;
    return lower;
  }
  if (!lower.solid && footPrefersTunnel(hint.footRadius, upper, lower)) return lower;
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

/** Deepest overlap of an upright capsule (centre, radius, half height) with any solid box,
 * with a tangent push-out normal. Used by the skateboard, which needs penetration depth. */
export function capsuleContact(center: Vector3, radius: number, halfHeight: number): { id: string; normal: Vector3; depth: number } | null {
  let best: { id: string; normal: Vector3; depth: number } | null = null;
  const local = new Vector3();
  for (const box of boxes) {
    if (center.distanceToSquared(box.center) > (box.half.length() + halfHeight + radius + 1) ** 2) continue;
    local.copy(center).sub(box.center).applyQuaternion(box.inverse);
    if (local.y - halfHeight > box.half.y || local.y + halfHeight < -box.half.y) continue;
    const dx = local.x - MathUtils.clamp(local.x, -box.half.x, box.half.x);
    const dz = local.z - MathUtils.clamp(local.z, -box.half.z, box.half.z);
    const outside = Math.hypot(dx, dz);
    let depth: number; const normal = new Vector3();
    if (outside > 1e-6) { if (outside >= radius) continue; depth = radius - outside; normal.set(dx / outside, 0, dz / outside); }
    else {
      const px = box.half.x - Math.abs(local.x), pz = box.half.z - Math.abs(local.z);
      if (px < pz) { depth = px + radius; normal.set(Math.sign(local.x) || 1, 0, 0); } else { depth = pz + radius; normal.set(0, 0, Math.sign(local.z) || 1); }
    }
    if (!best || depth > best.depth) best = { id: box.buildingId, normal: normal.applyQuaternion(box.quaternion), depth };
  }
  return best;
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
  const inBowl = initial.id === 'skatepark:pool' || initial.id === 'skatepark:snake';
  const attempt = (direction: Vector3, amount: number) => {
    const advanced = advanceOnSphere(up, direction, amount);
    const support = supportAt(advanced.up, { footRadius:currentFootRadius, layer });
    const ground = support.radius;
    const step = inBowl && support.id?.startsWith('skatepark:') ? BOWL_SCRAMBLE_HEIGHT : STEP_HEIGHT;
    const tooHigh = support.solid === true || ground > currentFootRadius + step;
    const center = advanced.up.clone().multiplyScalar(Math.max(ground, currentFootRadius) + CENTER_HEIGHT);
    return { ...advanced, support, ground, tooHigh, contact: buildingContact(center), distance: amount };
  };
  const direct = attempt(tangent, distance);
  if (!direct.tooHigh && !direct.contact) return { ...direct, blocked: false };
  // Slide along a wall box, or along cave rock and tower masonry.
  const face = direct.contact?.normal ?? direct.support.normal?.clone();
  if (face) {
    const normal = face.addScaledVector(up, -face.dot(up)).normalize();
    const slide = tangent.clone().addScaledVector(normal, -tangent.dot(normal));
    const fraction = slide.length();
    if (fraction > 0.03) {
      const sliding = attempt(slide.normalize(), distance * fraction);
      if (!sliding.tooHigh && !sliding.contact) return { ...sliding, blocked: true };
    }
  }
  return { up: up.clone(), forward: tangent.clone(), rotation: new Quaternion(), support:initial, ground: currentFootRadius, distance: 0, blocked: true };
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
  // The seals at the cave openings are drawn triangles rather than boxes; their registry
  // expands each into a thin prism with the same near-plane margin as the boxes.
  nearest = Math.min(nearest, seaCaveOpeningCameraClearDistance(origin, direction, nearest));
  // Rock is solid above and around the caves. Inside the open cave void the analytic volume
  // is the source of truth; the headland surface over it would wrongly close the passage.
  const sample = new Vector3();
  // March in fixed steps, and test the end point itself, so the camera never rests in rock.
  for (let step = 0.7; step < nearest + 0.22; step += 0.22) {
    const distance = Math.min(step, nearest);
    sample.copy(origin).addScaledVector(direction, distance);
    if (lighthouseCameraBlocked(sample)) return Math.max(0.7, distance - 0.25);
    const radius = sample.length();
    const up = sample.clone().normalize();
    if (!(activeLayer === 'tunnel' && isInsideSeaCaveVoid(sample)) && radius < upperSupportAt(up).radius + 0.2) return Math.max(0.7, distance - 0.25);
  }
  return nearest;
}
