import { Vector3 } from 'three';
import { buildingFrame, buildingLocalPoint } from '../data/building-shapes';
import { TOWN_BUILDINGS } from '../data/town-layout';
import type { InteriorId } from '../data/town-types';

/** Shared by the directional sun and the water's reflected sunset. */
export const SUNSET_DIRECTION = [-0.48, 0.86, 0.19] as const;

export interface LanternAnchor {
  id: string;
  buildingId: string;
  interior: InteriorId | null;
  lens: Vector3;
  position: Vector3;
  outward: Vector3 | null;
  intensity: number;
  range: number;
}

// Match architecturalDetails.exteriorLamp and interiors.roomBase exactly.
// A small offset places the actual light outside each opaque lantern shade.
export const LANTERN_ANCHORS: LanternAnchor[] = TOWN_BUILDINGS.filter(building => !building.secondary).flatMap(building => {
  const anchors: LanternAnchor[] = [];
  const frame = buildingFrame(building);
  for (const side of [-1, 1]) {
    const x = side * (building.width / 2 - 0.37);
    const y = Math.min(2.8, building.height - 0.65) - 0.06;
    anchors.push({
      id: `${building.id}:entrance:${side}`, buildingId: building.id, interior: null,
      lens: buildingLocalPoint(building, [x, y, building.depth / 2 + 0.31]),
      position: buildingLocalPoint(building, [x, y, building.depth / 2 + 0.39]),
      outward: new Vector3(0, 0, 1).applyQuaternion(frame.quaternion),
      intensity: 11, range: 8.2,
    });
    if (building.interior) {
      const innerWidth = building.width - 0.44, innerDepth = building.depth - 0.44;
      anchors.push({
        id: `${building.id}:room:${side}`, buildingId: building.id, interior: building.interior,
        lens: buildingLocalPoint(building, [side * (innerWidth / 2 - 0.235), 2.355, -innerDepth * 0.16]),
        position: buildingLocalPoint(building, [side * (innerWidth / 2 - 0.335), 2.355, -innerDepth * 0.16]),
        outward: null, intensity: 14, range: 7.2,
      });
    }
  }
  return anchors;
});
