import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { PENINSULA_INNER_CLIFF } from './peninsula-layout';
import { MAP_RADIUS, mapDirection, mapPoint } from './world-map';

type CliffAnchor = readonly [x: number, z: number, top: number, backWidth: number, frontWidth: number];
type CliffRing = { up: Vector3; tangent: Vector3; lower: Vector3[]; upper: Vector3[] };

export type PeninsulaCliffCollider = {
  id: string; buildingId: 'peninsula-cliff'; center: Vector3; quaternion: Quaternion;
  inverse: Quaternion; half: Vector3; camera: true;
};
export type PeninsulaCliffWedge = {
  id: string; color: string; vertices: readonly Vector3[];
  triangles: readonly (readonly [number, number, number])[];
  collider: PeninsulaCliffCollider;
};

/**
 * The approved continuous landward cove edge. There is no middle eastward arm.
 * The final southern drawing segment crosses the true tunnel exit and is
 * supplied by the clipped cape terrain instead of a solid collision prism.
 * Heights are absolute elevations above the globe.
 */
const rimHeights = [4.25, 3.35, 2.55, 2.2, 2.5, 2.7, 2.6, 1.6];
export const PENINSULA_CLIFF_RIM: readonly CliffAnchor[] = PENINSULA_INNER_CLIFF
  .slice(0, -1).reverse().map(([x, z], index) => [x, z, rimHeights[index], .9, .28] as const);

// Short radial slices follow the globe and keep the collision bounds local.
const anchors: CliffAnchor[] = [PENINSULA_CLIFF_RIM[0]];
for (let index = 1; index < PENINSULA_CLIFF_RIM.length; index++) {
  const a = PENINSULA_CLIFF_RIM[index - 1], b = PENINSULA_CLIFF_RIM[index];
  const count = Math.ceil(mapDirection(a[0], a[1]).angleTo(mapDirection(b[0], b[1])) * MAP_RADIUS / 1.15);
  for (let step = 1; step <= count; step++) {
    const t = step / count;
    anchors.push([MathUtils.lerp(a[0], b[0], t), MathUtils.lerp(a[1], b[1], t),
      MathUtils.lerp(a[2], b[2], t), MathUtils.lerp(a[3], b[3], t), MathUtils.lerp(a[4], b[4], t)]);
  }
}

const rings: CliffRing[] = anchors.map(([x, z, authoredTop, backWidth, frontWidth], index) => {
  const before = anchors[Math.max(0, index - 1)], after = anchors[Math.min(anchors.length - 1, index + 1)];
  const up = mapDirection(x, z);
  const tangent = mapDirection(after[0], after[1]).sub(mapDirection(before[0], before[1])).projectOnPlane(up).normalize();
  const right = tangent.clone().cross(up).normalize();
  const origin = mapPoint(x, z);
  const variation = Math.sin(index * 1.83), alternate = Math.cos(index * 1.37);
  const top = authoredTop + .095 * variation;
  const shelf = Math.max(.15, top * .48 + .065 * alternate);
  const project = (side: number, height: number) => origin.clone().addScaledVector(right, side).addScaledVector(up, height);
  // Two real closed strata: a broad buried foot, then an inset faceted face.
  // Their shared shelf gives the low headland a broken geological silhouette.
  const backFoot = project(-backWidth, -.72);
  const frontFoot = project(frontWidth, -.72);
  const frontShelf = project(frontWidth * .94 + .035 * variation, shelf);
  const backShelf = project(-backWidth * .83, shelf + .045 * alternate);
  const frontTop = project(frontWidth * .36 + .035 * alternate, top - .045);
  const backTop = project(-backWidth * .7, top + .045 * alternate);
  return { up, tangent, lower: [backFoot, frontFoot, frontShelf, backShelf], upper: [backShelf, frontShelf, frontTop, backTop] };
});

const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]] as const;

function colliderFor(id: string, vertices: readonly Vector3[], a: CliffRing, b: CliffRing): PeninsulaCliffCollider {
  const up = a.up.clone().add(b.up).normalize();
  const tangent = a.tangent.clone().add(b.tangent).projectOnPlane(up).normalize();
  const right = tangent.clone().cross(up).normalize();
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, tangent.clone().negate()));
  const inverse = quaternion.clone().invert();
  const origin = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / vertices.length);
  const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const vertex of vertices) {
    const local = vertex.clone().sub(origin).applyQuaternion(inverse);
    minimum.min(local); maximum.max(local);
  }
  const half = maximum.clone().sub(minimum).multiplyScalar(.5).addScalar(.012);
  const center = minimum.add(maximum).multiplyScalar(.5).applyQuaternion(quaternion).add(origin);
  return { id, buildingId: 'peninsula-cliff', center, quaternion, inverse, half, camera: true };
}

export const peninsulaCliffWedges: PeninsulaCliffWedge[] = rings.slice(1).flatMap((b, index) => {
  const a = rings[index];
  return (['lower', 'upper'] as const).map(stratum => {
    const id = `peninsula-cliff:${index}:${stratum}`;
    const vertices = [...a[stratum], ...b[stratum]];
    const center = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(1 / vertices.length);
    const triangles: [number, number, number][] = [];
    for (const quad of quads) {
      for (const triangle of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] as [number, number, number][]) {
        const [ia, ib, ic] = triangle;
        const normal = vertices[ib].clone().sub(vertices[ia]).cross(vertices[ic].clone().sub(vertices[ia]));
        const outside = vertices[ia].clone().add(vertices[ib]).add(vertices[ic]).multiplyScalar(1 / 3).sub(center);
        triangles.push(normal.dot(outside) >= 0 ? triangle : [ia, ic, ib]);
      }
    }
    const color = stratum === 'lower' ? '#778279' : index % 3 === 0 ? '#96998B' : '#899185';
    return { id, color, vertices, triangles, collider: colliderFor(id, vertices, a, b) };
  });
});

/** Every bound encloses its own rendered closed rock wedge, never the whole cove. */
export const peninsulaCliffColliders = peninsulaCliffWedges.map(wedge => wedge.collider);
