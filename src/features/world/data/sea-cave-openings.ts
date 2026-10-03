/** Where the Sea Caves meet daylight: the beach mouth and the ocean window.
 *
 * The terrain stays one radial heightfield, so at the two openings its triangles are cut by
 * convex prisms that follow the cave's own profile there (the plan's wobble is zero near the
 * openings). Cut edges are stitched to the analytic cave surface with thin seal panels, and
 * those panels are registered for the camera. Everywhere else the rock cover keeps the
 * terrain well above every ceiling. Pure `three` maths: safe for the check scripts.
 */
import { Box3, Plane, Ray, Vector3 } from 'three';
import { MAP_RADIUS, mapCoordinates } from './world-map';
import { SEA_CAVE_FRAME, seaCaveGradient, seaCaveLocal, seaCaveTerrainLocal } from './sea-cave';
import { type CavePoint, SEA_CAVE_MOUTH, SEA_CAVE_PASSAGES, SEA_CAVE_WALL_OFFSET, SEA_CAVE_WINDOW } from './sea-cave-layout';

type Profile = readonly (readonly [lateral: number, elevation: number])[];
export type TerrainCut = { id: string; planes: Plane[]; bounds: Box3 };

const unit = ([u, v]: CavePoint) => { const l = Math.hypot(u, v); return [u / l, v / l] as const; };

/** World point at an opening's (along, lateral, elevation), in local metres. */
function openingPoint(origin: CavePoint, axis: readonly [number, number], along: number, lateral: number, elevation: number) {
  const u = origin[0] + axis[0] * along - axis[1] * lateral, v = origin[1] + axis[1] * along + axis[0] * lateral;
  return SEA_CAVE_FRAME.point(u, v, elevation);
}

/** A convex profile extruded along an opening's axis between two stations. Each plane is
 * pushed out to contain every vertex, so curved-globe round-off never leaves thin blades. */
function prism(id: string, profile: Profile, origin: CavePoint, axis: readonly [number, number], a0: number, a1: number): TerrainCut {
  const near = profile.map(([lateral, elevation]) => openingPoint(origin, axis, a0, lateral, elevation));
  const far = profile.map(([lateral, elevation]) => openingPoint(origin, axis, a1, lateral, elevation));
  const vertices = [...near, ...far], n = profile.length;
  const center = vertices.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / vertices.length);
  const faces: number[][] = [near.map((_, i) => i), far.map((_, i) => n + i).reverse()];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
  const planes: Plane[] = [];
  for (const face of faces) {
    let plane: Plane | undefined;
    for (let j = 1; j < face.length - 1 && !plane; j++) {
      const candidate = new Plane().setFromCoplanarPoints(vertices[face[0]], vertices[face[j]], vertices[face[j + 1]]);
      if (candidate.normal.lengthSq() > .5) plane = candidate;
    }
    if (!plane) continue;
    if (plane.distanceToPoint(center) > 0) plane.negate();
    plane.constant -= Math.max(0, ...vertices.map(vertex => plane!.distanceToPoint(vertex))) + .003;
    planes.push(plane);
  }
  return { id, planes, bounds: new Box3().setFromPoints(vertices).expandByScalar(.02) };
}

// ---------------------------------------------------------------------------
// The beach mouth: the tunnel's arch, from the outer end of its apron into the rock.

const MOUTH_AXIS = unit(SEA_CAVE_MOUTH.inward);
const TUNNEL = SEA_CAVE_PASSAGES.find(passage => passage.id === 'tunnel')!;
/** Rock half width, wall top and crown of the tunnel at the mouth (crown factor .25). */
const MOUTH_ROCK = TUNNEL.width[1] / 2, MOUTH_FLOOR = TUNNEL.floor[1], MOUTH_HEIGHT = TUNNEL.height[1];
/** The cut floor stays just above the beach and cave floor so neither is holed. */
const MOUTH_PROFILE: Profile = (() => {
  const points: [number, number][] = [[-MOUTH_ROCK, MOUTH_FLOOR + .1]];
  for (let i = 0; i <= 8; i++) {
    const lat = -1 + i / 4;
    points.push([lat * MOUTH_ROCK, MOUTH_FLOOR + MOUTH_HEIGHT * (1 - .25 * lat * lat)]);
  }
  points.push([MOUTH_ROCK, MOUTH_FLOOR + .1]);
  return points;
})();
/** Stations along the mouth axis: the open apron, then a short way into the cover. */
const MOUTH_STATIONS = [-SEA_CAVE_MOUTH.apron, -2, -1, 0, 1, 2, 3, 4];

// ---------------------------------------------------------------------------
// The ocean window: an arched opening in the sea cliff between the ledge and the lintel.

const WINDOW_AXIS = unit(SEA_CAVE_WINDOW.outward);
const W = SEA_CAVE_WINDOW;
/** A low arch across the opening (straight jambs, then an elliptical crown), cut in four
 * vertical strips so the globe's curve across a 12m span cannot sag the sill plane. */
const WINDOW_PROFILE: Profile = (() => {
  const spring = W.lintel - 2.8, points: [number, number][] = [[-W.halfWidth, W.sill]];
  for (let k = 0; k <= 10; k++) {
    const angle = Math.PI - k / 10 * Math.PI;
    points.push([Math.cos(angle) * W.halfWidth, spring + Math.sin(angle) * (W.lintel - spring)]);
  }
  points.push([W.halfWidth, W.sill]);
  return points;
})();
function profileStrip(profile: Profile, from: number, to: number): Profile {
  // Clip a convex profile to lateral ∈ [from, to].
  let polygon = profile.map(p => [p[0], p[1]] as [number, number]);
  for (const [limit, sign] of [[from, 1], [to, -1]] as const) {
    const out: [number, number][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const dp = (p[0] - limit) * sign, dq = (q[0] - limit) * sign;
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    polygon = out;
  }
  return polygon;
}
const WINDOW_STRIPS = 4;
/** Along the window's outward axis: from inside the reveal to beyond the cliff toe. */
const WINDOW_DEPTH = [-2.2, 3.2] as const;

export const SEA_CAVE_CUTS: { mouth: TerrainCut[]; window: TerrainCut[] } = {
  mouth: MOUTH_STATIONS.slice(1).map((a1, i) => prism(`mouth:${i}`, MOUTH_PROFILE, SEA_CAVE_MOUTH.center, MOUTH_AXIS, MOUTH_STATIONS[i], a1)),
  window: Array.from({ length: WINDOW_STRIPS }, (_, i) => {
    const from = -W.halfWidth + 2 * W.halfWidth * i / WINDOW_STRIPS, to = -W.halfWidth + 2 * W.halfWidth * (i + 1) / WINDOW_STRIPS;
    // The window profile is across the outward axis: lateral runs along the cliff face.
    return prism(`window:${i}`, profileStrip(WINDOW_PROFILE, from, to), W.center, WINDOW_AXIS, WINDOW_DEPTH[0], WINDOW_DEPTH[1]);
  }),
};
const ALL_CUTS = [...SEA_CAVE_CUTS.mouth, ...SEA_CAVE_CUTS.window];
/** World-space box round every cut, for a cheap test before any terrain triangle is clipped. */
export const SEA_CAVE_CUT_BOUNDS = ALL_CUTS.reduce((box, cut) => box.union(cut.bounds), new Box3());
/** Padded world chart boxes round each opening: terrain cells outside them never need clipping. */
export const SEA_CAVE_CUT_CHART = [SEA_CAVE_CUTS.mouth, SEA_CAVE_CUTS.window].map(cuts => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const { min, max } = cuts.reduce((box, cut) => box.union(cut.bounds), new Box3());
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    const chart = mapCoordinates({ x, y, z });
    minX = Math.min(minX, chart.x); maxX = Math.max(maxX, chart.x); minZ = Math.min(minZ, chart.z); maxZ = Math.max(maxZ, chart.z);
  }
  return { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1 };
});
export const nearSeaCaveCut = (x: number, z: number) => SEA_CAVE_CUT_CHART.some(box => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ);

const inside = (cut: TerrainCut, point: Vector3, epsilon = 1e-6) => cut.bounds.containsPoint(point) && cut.planes.every(plane => plane.distanceToPoint(point) <= epsilon);
/** Is a world point inside an opening's cut? (terrain skirts must not hang across one) */
export const insideSeaCaveCut = (point: Vector3) => SEA_CAVE_CUT_BOUNDS.containsPoint(point) && [...SEA_CAVE_CUTS.mouth, ...SEA_CAVE_CUTS.window].some(cut => inside(cut, point));

/** Outside fragments of a terrain triangle, or undefined when no cut touches it.
 * `windowOnly` is for the coarse terrain, which only needs the big opening. */
export function clipTerrainOutsideSeaCave(a: Vector3, b: Vector3, c: Vector3, windowOnly = false): Vector3[][] | undefined {
  const bounds = new Box3().setFromPoints([a, b, c]);
  if (!SEA_CAVE_CUT_BOUNDS.intersectsBox(bounds)) return undefined;
  const cuts = (windowOnly ? SEA_CAVE_CUTS.window : ALL_CUTS).filter(cut => cut.bounds.intersectsBox(bounds));
  if (!cuts.length) return undefined;
  let fragments: Vector3[][] = [[a, b, c]], changed = false;
  for (const cut of cuts) {
    const next: Vector3[][] = [];
    for (const polygon of fragments) {
      if (cut.planes.some(plane => polygon.every(point => plane.distanceToPoint(point) > 1e-7))) { next.push(polygon); continue; }
      let remaining = polygon;
      for (const plane of cut.planes) {
        const kept: Vector3[] = [], outside: Vector3[] = [];
        for (let i = 0; i < remaining.length; i++) {
          const p = remaining[i], q = remaining[(i + 1) % remaining.length];
          const dp = plane.distanceToPoint(p), dq = plane.distanceToPoint(q);
          (dp <= 0 ? kept : outside).push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
            const crossing = p.clone().lerp(q, dp / (dp - dq));
            kept.push(crossing); outside.push(crossing);
          }
        }
        if (outside.length >= 3) next.push(outside);
        remaining = kept;
        if (remaining.length < 3) break;
      }
      changed = true;
    }
    fragments = next;
  }
  return changed ? fragments : undefined;
}

/** Nearest point of the analytic cave rock (wall, roof or floor) to a point near an opening. */
export function seaCaveLiningPoint(point: Vector3) {
  const { u, v } = SEA_CAVE_FRAME.local(point), elevation = point.length() - MAP_RADIUS;
  const here = seaCaveLocal(u, v);
  if (here.sdf <= SEA_CAVE_WALL_OFFSET) {
    // Inside the drawn rock face: straight up or down onto the roof or floor.
    const target = elevation > (here.floor + here.ceiling) / 2 ? here.ceiling : here.floor;
    return SEA_CAVE_FRAME.point(u, v, target);
  }
  // Outside it: across onto the wall face, at a height the wall actually spans.
  const gradient = seaCaveGradient(u, v), push = here.sdf - SEA_CAVE_WALL_OFFSET;
  const wu = u - gradient.u * push, wv = v - gradient.v * push, wall = seaCaveLocal(wu, wv);
  return SEA_CAVE_FRAME.point(wu, wv, Math.min(wall.ceiling, Math.max(wall.floor, elevation)));
}

/** Seal panels from every exposed cut edge of the clipped terrain to the cave rock. */
export function seaCaveOpeningSeals(polygons: Vector3[][]): Vector3[][] {
  const panels: Vector3[][] = [];
  const contained = (point: Vector3) => ALL_CUTS.some(cut => inside(cut, point));
  for (const polygon of polygons) for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const midpoint = a.clone().add(b).multiplyScalar(.5);
    const plane = ALL_CUTS.flatMap(cut => cut.planes).find(candidate =>
      Math.abs(candidate.distanceToPoint(a)) < 1e-5 && Math.abs(candidate.distanceToPoint(b)) < 1e-5
      && contained(midpoint.clone().addScaledVector(candidate.normal, -.008))
      && !contained(midpoint.clone().addScaledVector(candidate.normal, .008)));
    if (!plane) continue;
    const innerA = seaCaveLiningPoint(a), innerB = seaCaveLiningPoint(b);
    if (Math.max(a.distanceToSquared(innerA), b.distanceToSquared(innerB)) < 1e-6) continue;
    for (const triangle of [[a, b, innerB], [a, innerB, innerA]]) {
      const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
      if (normal.lengthSq() < 1e-12) continue;
      // Face into the opening (against the cut plane's outward normal).
      panels.push(normal.dot(plane.normal) < 0 ? triangle : [triangle[0], triangle[2], triangle[1]]);
    }
  }
  return panels;
}

/** Is a terrain triangle near enough an opening to need clipping? (world-space test) */
export const nearSeaCaveOpening = (a: Vector3, b: Vector3, c: Vector3) => SEA_CAVE_CUT_BOUNDS.intersectsBox(new Box3().setFromPoints([a, b, c]));

/** Terrain height check used when the cave mesh is clipped to what is buried in rock. */
export function seaCaveBuried(point: Vector3, terrainAt: (u: number, v: number) => number, epsilon = .02) {
  const { u, v } = SEA_CAVE_FRAME.local(point);
  return point.length() - MAP_RADIUS <= seaCaveTerrainLocal(u, v, terrainAt(u, v)) + epsilon;
}

// ---------------------------------------------------------------------------
// Camera: the seal panels that are actually drawn, as thin prisms.

type CameraFace = { bounds: Box3; planes: Plane[] };
let registry: { owner: object; bounds: Box3; faces: CameraFace[] } | undefined;

/** Install the drawn seal triangles; the owner-scoped release survives StrictMode remounts. */
export function registerSeaCaveOpeningTriangles(owner: object, triangles: readonly (readonly Vector3[])[]) {
  const margin = .22, bounds = new Box3(), faces: CameraFace[] = [];
  for (const source of triangles) {
    if (source.length !== 3) continue;
    const [a, b, c] = source.map(vertex => vertex.clone());
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const faceBounds = new Box3().setFromPoints([a, b, c]).expandByScalar(margin);
    bounds.union(faceBounds);
    const planes = [new Plane(normal.clone(), -normal.dot(a) - margin), new Plane(normal.clone().negate(), normal.dot(a) - margin)];
    const vertices = [a, b, c];
    for (let index = 0; index < 3; index++) {
      const vertex = vertices[index], edge = vertices[(index + 1) % 3].clone().sub(vertex), outside = edge.cross(normal).normalize();
      planes.push(new Plane(outside, -outside.dot(vertex) - margin));
    }
    faces.push({ bounds: faceBounds, planes });
  }
  registry = { owner, bounds, faces };
  return () => { if (registry?.owner === owner) registry = undefined; };
}
export function seaCaveOpeningCollisionStats() { return { registered: !!registry, triangles: registry?.faces.length ?? 0 }; }

/** Camera-only sweep against the registered opening seals. */
export function seaCaveOpeningCameraClearDistance(origin: Vector3, direction: Vector3, maximum: number) {
  const current = registry;
  if (!current) return maximum;
  if (!new Ray(origin, direction).intersectsBox(current.bounds)) return maximum;
  let nearest = maximum;
  for (const face of current.faces) {
    let enter = 0, leave = nearest;
    for (const axis of ['x', 'y', 'z'] as const) {
      const slope = direction[axis];
      if (Math.abs(slope) < 1e-10) {
        if (origin[axis] < face.bounds.min[axis] || origin[axis] > face.bounds.max[axis]) { leave = -1; break; }
      } else {
        const first = (face.bounds.min[axis] - origin[axis]) / slope, second = (face.bounds.max[axis] - origin[axis]) / slope;
        enter = Math.max(enter, Math.min(first, second)); leave = Math.min(leave, Math.max(first, second));
      }
    }
    if (enter > leave || leave < 0) continue;
    for (const plane of face.planes) {
      const distance = plane.distanceToPoint(origin), slope = plane.normal.dot(direction);
      if (Math.abs(slope) < 1e-10) { if (distance > 0) { leave = -1; break; } }
      else if (slope < 0) enter = Math.max(enter, -distance / slope);
      else leave = Math.min(leave, -distance / slope);
    }
    if (enter <= leave && leave >= 0) nearest = Math.min(nearest, Math.max(.7, enter - .15));
  }
  return nearest;
}
