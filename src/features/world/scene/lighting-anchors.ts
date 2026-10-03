import { Vector3 } from 'three';
import { buildingFrame, buildingLocalPoint } from '../data/building-shapes';
import { TOWN_BUILDINGS } from '../data/town-layout';
import type { InteriorId } from '../data/town-types';
import type { SupportLayer } from '../runtime/types';
import { SEA_CAVE_FRAME } from '../data/sea-cave';
import { SEA_CAVE_ARENA, SEA_CAVE_MOUTH, SEA_CAVE_WINDOW } from '../data/sea-cave-layout';
import { LIGHTHOUSE_TOWER, lighthousePoint } from '../data/lighthouse-tower';

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
  /** Only lights a visitor on this support layer (cave lights never reach the headland). */
  layer?: SupportLayer;
  /** Light colour; the warm lantern colour when absent. */
  color?: string;
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

/** A sea-cave light at local metres and an elevation. */
const caveAnchor = (id: string, u: number, v: number, h: number, intensity: number, range: number, color: string): LanternAnchor => {
  const position = SEA_CAVE_FRAME.point(u, v, h);
  return { id, buildingId: 'sea-cave', interior: null, lens: position.clone(), position, outward: null, intensity, range, layer: 'tunnel', color };
};
const windowInside = (() => {
  const w = SEA_CAVE_WINDOW, l = Math.hypot(w.outward[0], w.outward[1]);
  return [w.center[0] - w.outward[0] / l * 3.4, w.center[1] - w.outward[1] / l * 3.4] as const;
})();
const mouthInside = (() => {
  const m = SEA_CAVE_MOUTH, l = Math.hypot(m.inward[0], m.inward[1]);
  return [m.center[0] + m.inward[0] / l * 1.6, m.center[1] + m.inward[1] / l * 1.6] as const;
})();
/** The designed cave light reaches the visitor too: cool daylight off the sea at the window and
 * in the Grotto, and the beach's light at the mouth. Lit only for visitors down in the caves. */
export const SEA_CAVE_ANCHORS: LanternAnchor[] = [
  caveAnchor('seacave:window', windowInside[0], windowInside[1], 5.4, 13, 15, '#D6E8EE'),
  caveAnchor('seacave:grotto', SEA_CAVE_ARENA.center[0], SEA_CAVE_ARENA.center[1], 6.2, 10, 13, '#C9DCE2'),
  caveAnchor('seacave:mouth', mouthInside[0], mouthInside[1], 2.6, 9, 9, '#F1E3CC'),
];
/** The lighthouse lamp lights its balcony for a visitor up top. */
export const LIGHTHOUSE_ANCHOR: LanternAnchor = (() => {
  const position = lighthousePoint(0, (LIGHTHOUSE_TOWER.gallery + LIGHTHOUSE_TOWER.lantern.top) / 2, 0);
  return { id: 'lighthouse:lantern', buildingId: 'lighthouse', interior: null, lens: position.clone(), position, outward: null, intensity: 16, range: 11, layer: 'upper', color: '#FFD9A0' };
})();
LANTERN_ANCHORS.push(...SEA_CAVE_ANCHORS, LIGHTHOUSE_ANCHOR);
