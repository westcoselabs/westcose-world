import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { PENINSULA_CAVE } from './peninsula-layout';
import { MAP_RADIUS, mapDirection, mapPoint } from './world-map';

type Point = readonly [number, number];
type Ring = {
  x: number; z: number; up: Vector3; tangent: Vector3; right: Vector3;
  inner: Vector3[]; outer: Vector3[];
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
 * A short pentagonal passage through a low rocky point. Collinear wall vertices
 * split each side into two irregular strata, instead of a long rectangular wall.
 */
const rings: Ring[] = authoredPoints.map(([x, z], index) => {
  const before = authoredPoints[Math.max(0, index - 1)], after = authoredPoints[Math.min(authoredPoints.length - 1, index + 1)];
  const up = mapDirection(x, z);
  const tangent = mapDirection(after[0], after[1]).sub(mapDirection(before[0], before[1])).projectOnPlane(up).normalize();
  const right = tangent.clone().cross(up).normalize(), origin = mapPoint(x, z, PENINSULA_CAVE.floor);
  const variation = Math.sin(index * 1.71), alternate = Math.cos(index * 1.23);
  // The analytic clear floor is3.4m wide; a little extra space protects the
  // visitor capsule at ring joints and conservative collision-box corners.
  const half = PENINSULA_CAVE.width / 2 + .21 + variation * .025;
  const ceiling = PENINSULA_CAVE.clearance;
  const innerProfile: Point[] = [
    [-half, -.2], [-half, 1.62], [-half, ceiling],
    [.055 * alternate, ceiling + .3 + .025 * variation],
    [half, ceiling + .02], [half, 1.62], [half, -.2],
  ];
  // A shallow outward shelf, sloping upper face, and irregular4.5–4.65m ridge.
  // There are no crowns or tall solid masses above the tunnel.
  const outerProfile: Point[] = [
    [-4.04 - .15 * alternate, -.38],
    [-3.32 - .12 * variation, 1.4 + .09 * alternate],
    [-2.32 - .085 * alternate, 3.98 + .075 * variation],
    [-.1 + .11 * variation, 4.55 + .085 * alternate],
    [2.37 + .085 * variation, 4.01 + .065 * alternate],
    [3.37 + .11 * alternate, 1.54 + .085 * variation],
    [4.08 + .13 * variation, -.38],
  ];
  const project = ([lateral, height]: Point) => origin.clone().addScaledVector(right, lateral).addScaledVector(up, height);
  return { x, z, up, tangent, right, inner: innerProfile.map(project), outer: outerProfile.map(project) };
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

export function caveBlendAt(x: number, z: number) {
  // Carry the flat carve beneath the side wedges, so the coarser globe mesh
  // cannot interpolate neighbouring cliff vertices into the visible tunnel.
  return 1 - MathUtils.smoothstep(caveDistanceAt(x, z), PENINSULA_CAVE.width / 2 + .4, PENINSULA_CAVE.width / 2 + .95);
}

export function caveHeightAt(x: number, z: number): number | undefined {
  return caveBlendAt(x, z) > 0 ? PENINSULA_CAVE.floor : undefined;
}

/** Fit every actual prism vertex. Roof boxes follow the angled inner roof plane. */
function fitCollider(id: string, vertices: readonly Vector3[], a: Ring, b: Ring, kind: 'wall' | 'roof'): PeninsulaCaveCollider {
  const up = a.up.clone().add(b.up).normalize();
  const tangent = a.tangent.clone().add(b.tangent).projectOnPlane(up).normalize();
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
    return { id, kind, color, vertices, triangles, collider: fitCollider(id, vertices, a, b, kind) };
  });
});

/** These bounds enclose the actual wedge mesh; no peninsula-wide collision object exists. */
export const peninsulaCaveColliders = peninsulaCaveWedges.map(wedge => wedge.collider);
