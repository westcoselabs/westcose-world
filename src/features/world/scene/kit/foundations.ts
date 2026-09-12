import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { buildingFrame } from '../../data/building-shapes';
import { RADIUS } from '../../data/planet';
import { substrateAt, townCoordinates, townSurfaceAt } from '../../data/town-surfaces';
import type { TownBuilding } from '../../data/town-types';
import type { SceneryBatch } from '../sceneryGeometry';

const TOP = -0.08;
const BURIAL = 0.08;
const MAX_SEGMENT = 0.5;

/** A below-floor shell closes the gap between a tangent slab and curved terrain. */
export function buildingFoundationGeometry(building: TownBuilding): BufferGeometry {
  const frame = buildingFrame(building);
  // The existing slab projects 0.06 m beyond the walls; hide the skirt just inside it.
  const halfWidth = building.width / 2 + 0.055;
  const halfDepth = building.depth / 2 + 0.055;
  const perimeter = [
    [-halfWidth, -halfDepth], [-halfWidth, halfDepth],
    [halfWidth, halfDepth], [halfWidth, -halfDepth], [-halfWidth, -halfDepth],
  ];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], heights: number[] = [];

  const bottomAt = (top: Vector3) => {
    const normal = top.clone().applyQuaternion(frame.quaternion).add(frame.position).normalize();
    const chart = townCoordinates(normal);
    const visibleGround = Math.max(substrateAt(chart.x, chart.z), townSurfaceAt(chart.x, chart.z).height);
    // When the ground already hides the slab, keep the entire skirt below its top.
    const belowSlab = (RADIUS + building.floorHeight + TOP - 0.05) / frame.up.dot(normal);
    return normal.multiplyScalar(Math.min(RADIUS + visibleGround - BURIAL, belowSlab))
      .sub(frame.position).applyQuaternion(frame.inverse);
  };
  const triangle = (a: Vector3, b: Vector3, c: Vector3, au: number, bu: number, cu: number) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const [point, u] of [[a, au], [b, bu], [c, cu]] as const) {
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u, point.y);
      // Explicit building-local height: these foundation faces are all below the floor.
      heights.push(Math.max(0, point.y));
    }
  };

  let offset = 0;
  for (let edge = 1; edge < perimeter.length; edge++) {
    const a = perimeter[edge - 1], b = perimeter[edge];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / MAX_SEGMENT);
    for (let segment = 0; segment < count; segment++) {
      const at = (t: number) => new Vector3(a[0] + (b[0] - a[0]) * t, TOP, a[1] + (b[1] - a[1]) * t);
      const topA = at(segment / count), topB = at((segment + 1) / count);
      const bottomA = bottomAt(topA), bottomB = bottomAt(topB);
      const uA = offset + length * segment / count, uB = offset + length * (segment + 1) / count;
      // This perimeter order and downward-first winding point every face outward.
      triangle(topA, bottomA, topB, uA, uA, uB);
      triangle(topB, bottomA, bottomB, uB, uA, uB);
    }
    offset += length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('surfaceUv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('surfaceHeight', new Float32BufferAttribute(heights, 1));
  return geometry;
}

export function addBuildingFoundation(batch: SceneryBatch, building: TownBuilding, matrix: Matrix4, color: string) {
  const geometry = buildingFoundationGeometry(building);
  batch.add(geometry, matrix, color, { heightFrame: matrix });
  geometry.dispose();
}
