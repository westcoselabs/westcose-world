import { Box3, MathUtils, Matrix4, Plane, Quaternion, Ray, Triangle, Vector3 } from 'three';
import { PENINSULA_CAVE } from './peninsula-layout';
import { MAP_RADIUS, mapCoordinates, mapDirection, mapPoint } from './world-map';

type Point = readonly [number, number];
type Ring = {
  x: number; z: number; up: Vector3; tangent: Vector3; right: Vector3;
  inner: Vector3[]; outer: Vector3[]; miter: number;
};

export type PeninsulaCaveCollider = {
  id: string; buildingId: 'cave-rock'; center: Vector3; quaternion: Quaternion;
  inverse: Quaternion; half: Vector3; camera: true;
};

export type PeninsulaCaveWedge = {
  id: string; kind: 'wall' | 'roof'; color: string;
  /** Actual closed prism vertices; the renderer never draws the fitted collision box. */
  vertices: readonly Vector3[];
  triangles: readonly (readonly [number, number, number])[];
  /** Only the inward rock face is exposed; the cape owns every exterior face. */
  liningTriangles: readonly (readonly [number, number, number])[];
  collider: PeninsulaCaveCollider;
};

const floorRadius = MAP_RADIUS + PENINSULA_CAVE.floor;
const authoredPoints: Point[] = [PENINSULA_CAVE.points[0]];
for (let index = 1; index < PENINSULA_CAVE.points.length; index++) {
  const a = PENINSULA_CAVE.points[index - 1], b = PENINSULA_CAVE.points[index];
  const length = mapDirection(a[0], a[1]).angleTo(mapDirection(b[0], b[1])) * floorRadius;
  const count = Math.max(1, Math.ceil(length / .85));
  for (let step = 1; step <= count; step++) {
    authoredPoints.push([MathUtils.lerp(a[0], b[0], step / count), MathUtils.lerp(a[1], b[1], step / count)]);
  }
}

/**
 * Interior faces of a real underpass. The upper terrain remains continuous above
 * this void; these thin buried rock strata never form a freestanding outer pipe.
 */
const rings: Ring[] = authoredPoints.map(([x, z], index) => {
  const before = authoredPoints[Math.max(0, index - 1)], after = authoredPoints[Math.min(authoredPoints.length - 1, index + 1)];
  const up = mapDirection(x, z);
  const incoming = up.clone().sub(mapDirection(before[0], before[1])).projectOnPlane(up).normalize();
  const outgoing = mapDirection(after[0], after[1]).sub(up).projectOnPlane(up).normalize();
  if (index === 0) incoming.copy(outgoing);
  if (index === authoredPoints.length - 1) outgoing.copy(incoming);
  const tangent = incoming.clone().add(outgoing).normalize();
  // Miter the offset corridor at bends: a plain bisector ring narrows a3.4m
  // passage at every turn, even though each straight cross-section is wide.
  const miter = 1 / Math.max(.6, Math.sqrt((1 + incoming.dot(outgoing)) / 2));
  const right = tangent.clone().cross(up).normalize(), origin = mapPoint(x, z, PENINSULA_CAVE.floor);
  const variation = Math.sin(index * 1.71), alternate = Math.cos(index * 1.23);
  // The analytic clear floor is3.4m wide; a little extra space protects the
  // visitor capsule at ring joints and conservative collision-box corners.
  const bendDistance = up.angleTo(mapDirection(35.7, -31)) * floorRadius;
  // A broad buried turning chamber prevents the two inner offset walls from
  // meeting inside the visitor lanes beneath the lighthouse's angled junction.
  const chamber = .95 * (1 - MathUtils.smoothstep(bendDistance, .5, 4.4));
  const half = PENINSULA_CAVE.width / 2 + .21 + variation * .025 + chamber;
  const ceiling = PENINSULA_CAVE.clearance;
  const innerProfile: Point[] = [
    [-half, -.2], [-half, 1.62], [-half, ceiling],
    [.055 * alternate, ceiling + .3 + .025 * variation],
    [half, ceiling + .02], [half, 1.62], [half, -.2],
  ];
  // Small buried collision strata around the lining, not an authored outer arch.
  // The independently sampled cape surface supplies all visible exterior rock.
  const outerProfile: Point[] = [
    [-half - .55, -.3], [-half - .55, 1.62],
    [-half - .45, ceiling + .4],
    [.055 * alternate, ceiling + .75 + .025 * variation],
    [half + .45, ceiling + .42], [half + .55, 1.62], [half + .55, -.3],
  ];
  const project = ([lateral, height]: Point) => origin.clone().addScaledVector(right, lateral * miter).addScaledVector(up, height);
  return { x, z, up, tangent, right, miter, inner: innerProfile.map(project), outer: outerProfile.map(project) };
});

const curveSegments = rings.slice(1).map((end, index) => {
  const start = rings[index], normal = start.up.clone().cross(end.up).normalize();
  return { start: start.up, end: end.up, normal, angle: start.up.angleTo(end.up) };
});
export const PENINSULA_CAVE_LENGTH = curveSegments.reduce((length, segment) => length + segment.angle * floorRadius, 0);
const caveBounds = {
  minX: Math.min(...PENINSULA_CAVE.points.map(point => point[0])) - 4,
  maxX: Math.max(...PENINSULA_CAVE.points.map(point => point[0])) + 4,
  minZ: Math.min(...PENINSULA_CAVE.points.map(point => point[1])) - 8,
  maxZ: Math.max(...PENINSULA_CAVE.points.map(point => point[1])) + 8,
};

/** Physical spherical distance to the same short centerline used by the tunnel rings. */
export function caveDistanceAt(x: number, z: number) {
  if (x < caveBounds.minX || x > caveBounds.maxX || z < caveBounds.minZ || z > caveBounds.maxZ) return Infinity;
  const direction = mapDirection(x, z);
  let distance = Infinity;
  for (const segment of curveSegments) {
    const projected = direction.clone().addScaledVector(segment.normal, -direction.dot(segment.normal)).normalize();
    const angle = Math.atan2(segment.normal.dot(segment.start.clone().cross(projected)), segment.start.dot(projected));
    const closest = angle <= 0 ? segment.start : angle >= segment.angle ? segment.end : projected;
    distance = Math.min(distance, direction.angleTo(closest) * floorRadius);
  }
  return distance;
}

/** Finite lower corridor section, including the two straight portal aprons. */
export function caveSectionAt(x: number, z: number) {
  if (x < caveBounds.minX || x > caveBounds.maxX || z < caveBounds.minZ || z > caveBounds.maxZ) return undefined;
  const direction = mapDirection(x, z);
  let offset = 0, best: {
    distance: number; along: number; length: number; lateral: number;
    x: number; z: number; up: Vector3; tangent: Vector3; right: Vector3;
    floor: number; ceiling: number; halfWidth: number; portal: 'entry' | 'exit' | null;
  } | undefined;
  for (let index = 0; index < curveSegments.length; index++) {
    const segment = curveSegments[index];
    const projected = direction.clone().addScaledVector(segment.normal, -direction.dot(segment.normal)).normalize();
    const angle = Math.atan2(segment.normal.dot(segment.start.clone().cross(projected)), segment.start.dot(projected));
    const t = MathUtils.clamp(angle, index === 0 ? -2.4 / floorRadius : 0,
      segment.angle + (index === curveSegments.length - 1 ? 2.4 / floorRadius : 0));
    const up = segment.start.clone().applyAxisAngle(segment.normal, t);
    const distance = direction.angleTo(up) * floorRadius;
    if (!best || distance < best.distance) {
      const tangent = segment.normal.clone().cross(up).normalize(), right = tangent.clone().cross(up).normalize();
      const along = offset + t * floorRadius, lateral = Math.asin(MathUtils.clamp(direction.dot(right), -1, 1)) * floorRadius;
      const bendDistance = up.angleTo(mapDirection(35.7, -31)) * floorRadius;
      const halfWidth = PENINSULA_CAVE.width / 2 + .21 + .95 * (1 - MathUtils.smoothstep(bendDistance, .5, 4.4));
      best = { distance, along, length: PENINSULA_CAVE_LENGTH, lateral, ...mapCoordinates(up), up, tangent, right,
        floor: PENINSULA_CAVE.floor,
        ceiling: PENINSULA_CAVE.floor + PENINSULA_CAVE.clearance + .3 * Math.max(0, 1 - Math.abs(lateral) / halfWidth),
        halfWidth, portal: along < 0 ? 'entry' : along > PENINSULA_CAVE_LENGTH ? 'exit' : null };
    }
    offset += segment.angle * floorRadius;
  }
  return best;
}

export function caveBlendAt(x: number, z: number) {
  // Legacy corridor-width query only. It must never flatten the upper cape;
  // lower support now belongs to caveSectionAt and the explicit floor mesh.
  return 1 - MathUtils.smoothstep(caveDistanceAt(x, z), PENINSULA_CAVE.width / 2 + .4, PENINSULA_CAVE.width / 2 + .95);
}

export function caveHeightAt(x: number, z: number): number | undefined {
  return caveBlendAt(x, z) > 0 ? PENINSULA_CAVE.floor : undefined;
}

/** Fit every actual prism vertex. Roof boxes follow the angled inner roof plane. */
function fitCollider(id: string, vertices: readonly Vector3[], a: Ring, b: Ring, kind: 'wall' | 'roof'): PeninsulaCaveCollider {
  const up = a.up.clone().add(b.up).normalize();
  const tangent = kind === 'wall'
    ? vertices[4].clone().sub(vertices[0]).add(vertices[5].clone().sub(vertices[1])).projectOnPlane(up).normalize()
    : a.tangent.clone().add(b.tangent).projectOnPlane(up).normalize();
  const zAxis = tangent.clone().negate();
  const xAxis = kind === 'roof'
    ? vertices[1].clone().sub(vertices[0]).add(vertices[5].clone().sub(vertices[4])).projectOnPlane(tangent).normalize()
    : tangent.clone().cross(up).normalize();
  const yAxis = zAxis.clone().cross(xAxis).normalize();
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const inverse = quaternion.clone().invert();
  const origin = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / vertices.length);
  const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const vertex of vertices) {
    const local = vertex.clone().sub(origin).applyQuaternion(inverse);
    minimum.min(local); maximum.max(local);
  }
  const half = maximum.clone().sub(minimum).multiplyScalar(.5).addScalar(.012);
  const center = minimum.add(maximum).multiplyScalar(.5).applyQuaternion(quaternion).add(origin);
  return { id, buildingId: 'cave-rock', center, quaternion, inverse, half, camera: true };
}

const wedgeQuads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]] as const;

export const peninsulaCaveWedges: PeninsulaCaveWedge[] = rings.slice(1).flatMap((b, slice) => {
  const a = rings[slice];
  return Array.from({ length: a.inner.length - 1 }, (_, face) => {
    const kind = face === 2 || face === 3 ? 'roof' : 'wall';
    const id = `cave:short:${slice}:${kind}:${face}`;
    const vertices = [a.inner[face], a.inner[face + 1], a.outer[face + 1], a.outer[face], b.inner[face], b.inner[face + 1], b.outer[face + 1], b.outer[face]];
    const center = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / vertices.length);
    const triangles: [number, number, number][] = [];
    for (const quad of wedgeQuads) {
      for (const triangle of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] as [number, number, number][]) {
        const [ia, ib, ic] = triangle;
        const normal = vertices[ib].clone().sub(vertices[ia]).cross(vertices[ic].clone().sub(vertices[ia]));
        const outside = vertices[ia].clone().add(vertices[ib]).add(vertices[ic]).multiplyScalar(1 / 3).sub(center);
        triangles.push(normal.dot(outside) >= 0 ? triangle : [ia, ic, ib]);
      }
    }
    const color = kind === 'roof' ? '#96998B' : face === 0 || face === 5 ? '#737E76' : '#899185';
    const liningTriangles = triangles.filter(triangle => triangle.every(vertex => [0, 1, 4, 5].includes(vertex)));
    return { id, kind, color, vertices, triangles, liningTriangles, collider: fitCollider(id, vertices, a, b, kind) };
  });
});

/** These bounds enclose the actual wedge mesh; no peninsula-wide collision object exists. */
export const peninsulaCaveColliders = peninsulaCaveWedges.map(wedge => wedge.collider);

/** Separate lower floor, including low portal aprons beneath the upper coast. */
export const peninsulaCaveFloor: { vertices: Vector3[]; triangles: [number, number, number][] } = (() => {
  const first = rings[0], last = rings[rings.length - 1];
  const columns = 8;
  const floorRing = (ring: Ring, extension = 0) => {
    const up = ring.up.clone().multiplyScalar(Math.cos(extension / floorRadius))
      .addScaledVector(ring.tangent, Math.sin(extension / floorRadius)).normalize();
    const right = ring.right.clone().projectOnPlane(up).normalize();
    const half = Math.abs(ring.inner[0].clone().sub(mapPoint(ring.x, ring.z, PENINSULA_CAVE.floor)).dot(ring.right)) + .025;
    return Array.from({ length: columns + 1 }, (_, column) => up.clone().multiplyScalar(floorRadius)
      .addScaledVector(right, (column / columns * 2 - 1) * half).normalize().multiplyScalar(floorRadius));
  };
  // Width subdivisions include the exact centerline. A single broad triangle
  // across the curved chamber would sag below the analytical walking floor.
  const pairs = [-2.4, -1.6, -.8].map(distance => floorRing(first, distance))
    .concat(rings.map(ring => floorRing(ring)), [.8, 1.6, 2.4].map(distance => floorRing(last, distance)));
  const vertices = pairs.flat(), triangles: [number, number, number][] = [];
  for (let index = 0; index < pairs.length - 1; index++) for (let column = 0; column < columns; column++) {
    const a = index * (columns + 1) + column, b = a + columns + 1;
    for (const triangle of [[a, b, a + 1], [b, b + 1, a + 1]] as [number, number, number][]) {
      const [ia, ib, ic] = triangle;
      const normal = vertices[ib].clone().sub(vertices[ia]).cross(vertices[ic].clone().sub(vertices[ia]));
      triangles.push(normal.dot(vertices[ia]) > 0 ? triangle : [ia, ic, ib]);
    }
  }
  return { vertices, triangles };
})();

type TerrainCut = { planes: Plane[]; bounds: Box3 };
const shiftedRing = (ring: Ring, distance: number): Ring => ({ ...ring,
  inner: ring.inner.map(point => point.clone().addScaledVector(ring.tangent, distance)),
  outer: ring.outer.map(point => point.clone().addScaledVector(ring.tangent, distance)),
});

/**
 * Convex void sections cut only terrain that actually crosses the passage.
 * High cap triangles stay intact. The low beach and the explicit floor remain
 * below the cut's bottom plane; portal extensions remove steep approach ramps.
 */
const cutRings = [shiftedRing(rings[0], -2.4), ...rings, shiftedRing(rings[rings.length - 1], 2.4)];
export const caveTerrainCuts: TerrainCut[] = cutRings.slice(1).map((b, index) => {
  const a = cutRings[index];
  const profile = (ring: Ring) => ring.inner.map((point, i) => i === 0 || i === 6
    ? point.clone().addScaledVector(ring.up, .26) : point);
  const vertices = [...profile(a), ...profile(b)], center = vertices.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / 14);
  const faces: number[][] = [[0, 1, 2, 3, 4, 5, 6], [7, 13, 12, 11, 10, 9, 8]];
  for (let i = 0; i < 7; i++) faces.push([i, (i + 1) % 7, (i + 1) % 7 + 7, i + 7]);
  const planes: Plane[] = [];
  for (const face of faces) {
    // Collinear wall strata may begin a polygon; search for a proper triangle.
    let plane: Plane | undefined;
    for (let j = 1; j < face.length - 1 && !plane; j++) {
      const candidate = new Plane().setFromCoplanarPoints(vertices[face[0]], vertices[face[j]], vertices[face[j + 1]]);
      if (candidate.normal.lengthSq() > .5) plane = candidate;
    }
    if (!plane) continue;
    if (plane.distanceToPoint(center) > 0) plane.negate();
    // Roundoff at curved ring joints must not leave thin uncut terrain blades.
    plane.constant -= Math.max(0, ...vertices.map(vertex => plane!.distanceToPoint(vertex))) + .003;
    planes.push(plane);
  }
  return { planes, bounds: new Box3().setFromPoints(vertices).expandByScalar(.02) };
});

/** Outside fragments of a terrain triangle, with high cape triangles untouched. */
export function clipTerrainOutsideCave(a: Vector3, b: Vector3, c: Vector3): Vector3[][] | undefined {
  const bounds = new Box3().setFromPoints([a, b, c]);
  const cuts = caveTerrainCuts.filter(cut => cut.bounds.intersectsBox(bounds));
  if (!cuts.length) return undefined;
  let fragments: Vector3[][] = [[a, b, c]], changed = false;
  for (const cut of cuts) {
    const next: Vector3[][] = [];
    for (const polygon of fragments) {
      if (cut.planes.some(plane => polygon.every(point => plane.distanceToPoint(point) > 1e-7))) { next.push(polygon); continue; }
      let inside = polygon;
      for (const plane of cut.planes) {
        const kept: Vector3[] = [], outside: Vector3[] = [];
        for (let i = 0; i < inside.length; i++) {
          const p = inside[i], q = inside[(i + 1) % inside.length];
          const dp = plane.distanceToPoint(p), dq = plane.distanceToPoint(q);
          (dp <= 0 ? kept : outside).push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
            const intersection = p.clone().lerp(q, dp / (dp - dq));
            kept.push(intersection); outside.push(intersection);
          }
        }
        if (outside.length >= 3) next.push(outside);
        inside = kept;
        if (inside.length < 3) break;
      }
      changed = true;
    }
    fragments = next;
  }
  return changed ? fragments : undefined;
}

const liningTargets = [
  ...peninsulaCaveWedges.flatMap(wedge => wedge.liningTriangles.map(([a, b, c]) =>
    new Triangle(wedge.vertices[a], wedge.vertices[b], wedge.vertices[c]))),
  ...peninsulaCaveFloor.triangles.map(([a, b, c]) =>
    new Triangle(peninsulaCaveFloor.vertices[a], peninsulaCaveFloor.vertices[b], peninsulaCaveFloor.vertices[c])),
];

/** Exact shared terrain cut edges are stitched to the nearest lining/floor edge.
 * These are the actual coastal jamb/lintel surfaces, not another exterior arch.
 */
export function cavePortalSeals(polygons: Vector3[][]): Vector3[][] {
  const contains = (point: Vector3) => caveTerrainCuts.some(cut => cut.bounds.containsPoint(point)
    && cut.planes.every(plane => plane.distanceToPoint(point) <= 1e-6));
  const closest = (point: Vector3) => {
    let distance = Infinity, result = point.clone();
    const candidate = new Vector3();
    for (const triangle of liningTargets) {
      triangle.closestPointToPoint(point, candidate);
      const squared = point.distanceToSquared(candidate);
      if (squared < distance) { distance = squared; result = candidate.clone(); }
    }
    return result;
  };
  const panels: Vector3[][] = [];
  for (const polygon of polygons) for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const midpoint = a.clone().add(b).multiplyScalar(.5);
    const plane = caveTerrainCuts.flatMap(cut => cut.planes).find(candidate =>
      Math.abs(candidate.distanceToPoint(a)) < 1e-5 && Math.abs(candidate.distanceToPoint(b)) < 1e-5
      && contains(midpoint.clone().addScaledVector(candidate.normal, -.008))
      && !contains(midpoint.clone().addScaledVector(candidate.normal, .008)));
    if (!plane) continue;
    const innerA = closest(a), innerB = closest(b);
    if (Math.max(a.distanceToSquared(innerA), b.distanceToSquared(innerB)) < 1e-8) continue;
    // Keep the side that faces the passage. Shared cut vertices are reused exactly.
    for (const triangle of [[a, b, innerB], [a, innerB, innerA]]) {
      const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
      if (normal.lengthSq() < 1e-12) continue;
      panels.push(normal.dot(plane.normal) < 0 ? triangle : [triangle[0], triangle[2], triangle[1]]);
    }
  }
  return panels;
}

/** Extend the interior through the mouth cut, keeping only faces buried in land.
 * The beachward portion vanishes where the cape ends, rather than forming an arch.
 */
export function cavePortalLining(heightAt: (x: number, z: number) => number): Vector3[][] {
  const panels: Vector3[][] = [];
  const signed = (point: Vector3) => {
    const chart = mapCoordinates(point);
    return point.length() - MAP_RADIUS - heightAt(chart.x, chart.z);
  };
  const clip = (triangle: Vector3[], desiredNormal: Vector3) => {
    const polygon: Vector3[] = [];
    for (let i = 0; i < triangle.length; i++) {
      const a = triangle[i], b = triangle[(i + 1) % triangle.length], da = signed(a), db = signed(b);
      if (da <= .004) polygon.push(a);
      if ((da < .004 && db > .004) || (da > .004 && db < .004)) {
        let low = 0, high = 1;
        for (let j = 0; j < 16; j++) {
          const middle = (low + high) / 2, value = signed(a.clone().lerp(b, middle));
          if ((value <= .004) === (da <= .004)) low = middle; else high = middle;
        }
        polygon.push(a.clone().lerp(b, (low + high) / 2));
      }
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
      if (normal.lengthSq() > 1e-12) panels.push(normal.dot(desiredNormal) >= 0 ? triangle : [triangle[0], triangle[2], triangle[1]]);
    }
  };
  for (const [ring, sign] of [[rings[0], -1], [rings[rings.length - 1], 1]] as const) {
    for (let face = 0; face < ring.inner.length - 1; face++) {
      const from = ring.inner[face], to = ring.inner[face + 1];
      const acrossCount = Math.max(1, Math.ceil(from.distanceTo(to) / .22));
      const inward = mapPoint(ring.x, ring.z, PENINSULA_CAVE.floor + 1.8).sub(from.clone().lerp(to, .5)).projectOnPlane(ring.tangent).normalize();
      for (let along = 0; along < 12; along++) for (let across = 0; across < acrossCount; across++) {
        const point = (step: number, width: number) => from.clone().lerp(to, width / acrossCount).addScaledVector(ring.tangent, sign * step * .2);
        const a = point(along, across), b = point(along + 1, across), c = point(along + 1, across + 1), d = point(along, across + 1);
        clip([a, b, c], inward); clip([a, c, d], inward);
      }
    }
  }
  return panels;
}

type PortalCollisionFace = { bounds: Box3; planes: Plane[] };
type PortalCollisionRegistry = { owner: object; bounds: Box3; faces: PortalCollisionFace[] };
let portalCollision: PortalCollisionRegistry | undefined;

/**
 * Install copies of the exact detailed portal triangles. The owner-scoped
 * release is safe across React StrictMode setup/cleanup and overlapping mounts.
 * Low-detail/overview geometry never replaces this detailed collision source.
 */
export function registerCavePortalTriangles(owner: object, triangles: readonly (readonly Vector3[])[]) {
  const margin = .22, bounds = new Box3(), faces: PortalCollisionFace[] = [];
  for (const source of triangles) {
    if (source.length !== 3) continue;
    const [a, b, c] = source.map(vertex => vertex.clone());
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const faceBounds = new Box3().setFromPoints([a, b, c]).expandByScalar(margin);
    bounds.union(faceBounds);
    // A thin triangular prism, expanded by the camera near-plane radius.
    // Edge planes conservatively cover corners, without peninsula-wide boxes.
    const planes = [new Plane(normal.clone(), -normal.dot(a) - margin),
      new Plane(normal.clone().negate(), normal.dot(a) - margin)];
    const vertices = [a, b, c];
    for (let index = 0; index < 3; index++) {
      const vertex = vertices[index], edge = vertices[(index + 1) % 3].clone().sub(vertex);
      const outside = edge.cross(normal).normalize();
      planes.push(new Plane(outside, -outside.dot(vertex) - margin));
    }
    faces.push({ bounds: faceBounds, planes });
  }
  portalCollision = { owner, bounds, faces };
  return () => { if (portalCollision?.owner === owner) portalCollision = undefined; };
}

export function cavePortalCollisionStats() {
  return { registered: !!portalCollision, triangles: portalCollision?.faces.length ?? 0 };
}

/** Camera-only sweep against the same portal triangles that are actually drawn. */
export function cavePortalCameraClearDistance(origin: Vector3, direction: Vector3, maximum: number) {
  const registry = portalCollision;
  if (!registry) return maximum;
  const ray = new Ray(origin, direction);
  if (!ray.intersectsBox(registry.bounds)) return maximum;
  let nearest = maximum;
  for (const face of registry.faces) {
    let enter = 0, leave = nearest;
    // Clip to the expanded triangle AABB as well as the edge planes. Acute
    // triangle corners must not create distant artificial miter intersections.
    for (const axis of ['x', 'y', 'z'] as const) {
      const slope = direction[axis];
      if (Math.abs(slope) < 1e-10) {
        if (origin[axis] < face.bounds.min[axis] || origin[axis] > face.bounds.max[axis]) { leave = -1; break; }
      } else {
        const first = (face.bounds.min[axis] - origin[axis]) / slope, second = (face.bounds.max[axis] - origin[axis]) / slope;
        enter = Math.max(enter, Math.min(first, second));
        leave = Math.min(leave, Math.max(first, second));
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
