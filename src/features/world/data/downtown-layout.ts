/** Downtown WestCose: real streets with asphalt carriageways, raised sidewalks and curbs.
 * Axis-aligned chart rectangles, closed at the east by cul-de-sac turning circles; a
 * carriageway wins over any sidewalk it crosses. The same classification drives walking
 * support, the street mesh and the grindable curb lines.
 */
import { SKATEPARK } from './skatepark-layout';

export const STREET_LEVEL = .22;
export const WALK_LEVEL = SKATEPARK.street;
export const CURB_HEIGHT = WALK_LEVEL - STREET_LEVEL;

/** [x0, x1, z0, z1] in chart metres. */
export type ChartRect = readonly [number, number, number, number];
export type DowntownStreet = { id: string; name: string; rect: ChartRect; axis: 'x' | 'z' };
export type DowntownWalk = { id: string; rect: ChartRect };

/** A cul-de-sac closing a street: a turning circle around a raised planted island, inside a
 * sidewalk ring that carries on from the street's own sidewalks. From `cut` east the circle
 * owns the ground; the street's rectangles stop exactly there. Radii are chart metres. */
export type CulDeSac = {
  id: string; street: string; name: string; center: readonly [number, number];
  island: number; road: number; walk: number; halfWidth: number; walkOut: number; cut: number;
};
function culDeSac(id: string, street: string, name: string, center: readonly [number, number], island: number, road: number, walk: number, halfWidth: number, walkOut: number): CulDeSac {
  return { id, street, name, center, island, road, walk, halfWidth, walkOut, cut: center[0] - Math.sqrt(walk * walk - walkOut * walkOut) };
}
/** Main St ends at the cliff top above the hidden beach; Palm Ave ends below the north arm. */
export const CUL_DE_SACS: readonly CulDeSac[] = [
  culDeSac('main-cul', 'main-st', 'Cliff Cul-de-sac', [34.5, 0], 2.2, 6, 8.5, 3.5, 6),
  culDeSac('palm-cul', 'palm-ave', 'Palm Cul-de-sac', [30.6, 22.5], 1.8, 4.8, 7, 3, 5),
];
const MAIN_CUL = CUL_DE_SACS[0], PALM_CUL = CUL_DE_SACS[1];

/** Main St runs east–west through town to its cul-de-sac; Pier St leaves it south to the
 * boardwalk and pier; Palm Ave is the quieter back street. The courtyard plaza opens north. */
export const DOWNTOWN_STREETS: readonly DowntownStreet[] = [
  { id: 'main-st', name: 'Main Street', rect: [-22, MAIN_CUL.cut, -3.5, 3.5], axis: 'x' },
  { id: 'pier-st', name: 'Pier Street', rect: [-3.5, 3.5, -14, -3.5], axis: 'z' },
  { id: 'palm-ave', name: 'Palm Avenue', rect: [-22, PALM_CUL.cut, 19.5, 25.5], axis: 'x' },
];
export const DOWNTOWN_WALKS: readonly DowntownWalk[] = [
  { id: 'main-north', rect: [-26.5, MAIN_CUL.cut, 3.5, 6] },
  { id: 'main-south', rect: [-26.5, MAIN_CUL.cut, -6, -3.5] },
  { id: 'stair-plaza', rect: [-26.5, -22, -3.5, 3.5] },
  { id: 'west-promenade', rect: [-32, -26.5, -14, 27.5] },
  { id: 'pier-west', rect: [-6, -3.5, -14, -6] },
  { id: 'pier-east', rect: [3.5, 6, -14, -6] },
  { id: 'courtyard', rect: [-9.2, 9.2, 6, 17.5] },
  { id: 'palm-south', rect: [-26.5, PALM_CUL.cut, 17.5, 19.5] },
  { id: 'palm-north', rect: [-26.5, PALM_CUL.cut, 25.5, 27.5] },
  // The motel's ground-floor walkway under its upper balcony, level with the sidewalk.
  { id: 'motel-walk', rect: [13.4, 23.4, -7.5, -6] },
  { id: 'alley', rect: [24.9, 27.5, -14, -6] },
];
/** The bluff's retaining wall faces the promenade; the grand stairs cut through it. */
export const BLUFF_WALL = { x: SKATEPARK.bluffX, thickness: .5, z0: -24, z1: 27.5 } as const;
/** The plaza fountain and the fresh-load spawn north of it, looking down Pier St to the pier. */
export const COURTYARD = { fountain: [0, 11.6] as const, basin: 2.6, rose: 6.4, spawn: [0, 16.3] as const };

const inside = (r: ChartRect, x: number, z: number) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
const BOUNDS: ChartRect = [-32, Math.max(...CUL_DE_SACS.map(c => c.center[0] + c.walk)), -14, 30.5];

export type DowntownKind = 'road' | 'walk';
export type CulDeSacPart = 'island' | 'road' | 'walk';
/** Which part of a cul-de-sac owns a chart point, or null outside every turning circle. */
export function culDeSacAt(x: number, z: number): { culDeSac: CulDeSac; part: CulDeSacPart; radius: number; angle: number } | null {
  for (const c of CUL_DE_SACS) {
    if (x < c.cut) continue;
    const dx = x - c.center[0], dz = z - c.center[1], radius = Math.hypot(dx, dz);
    if (radius > c.walk) continue;
    const part: CulDeSacPart = radius <= c.island ? 'island' : radius <= c.road || (dx < 0 && Math.abs(dz) <= c.halfWidth) ? 'road' : 'walk';
    return { culDeSac: c, part, radius, angle: Math.atan2(dz, dx) };
  }
  return null;
}
/** Carriageway or sidewalk at a chart point, or null off the paved network. Cul-de-sac
 * islands are raised planting beds at sidewalk level. */
export function downtownKindAt(x: number, z: number): DowntownKind | null {
  return downtownSurfaceAt(x, z)?.kind ?? null;
}
export function downtownSurfaceAt(x: number, z: number): { height: number; kind: DowntownKind; id: string } | null {
  if (!inside(BOUNDS, x, z)) return null;
  const bulb = culDeSacAt(x, z);
  if (bulb) return bulb.part === 'road'
    ? { height: STREET_LEVEL, kind: 'road', id: bulb.culDeSac.street }
    : { height: WALK_LEVEL, kind: 'walk', id: bulb.part === 'island' ? `${bulb.culDeSac.id}:island` : bulb.culDeSac.id };
  for (const street of DOWNTOWN_STREETS) if (inside(street.rect, x, z)) return { height: STREET_LEVEL, kind: 'road', id: street.id };
  for (const walk of DOWNTOWN_WALKS) if (inside(walk.rect, x, z)) return { height: WALK_LEVEL, kind: 'walk', id: walk.id };
  return null;
}
export const nearDowntown = (x: number, z: number, margin = 0) => x >= BOUNDS[0] - margin && x <= BOUNDS[1] + margin && z >= BOUNDS[2] - margin && z <= BOUNDS[3] + margin;

/** Cell decomposition of the rectangular network: every distinct rectangle edge splits the
 * plane, and each cell is wholly road, walk or open ground. Shared by the mesh and the curb
 * lines. Cul-de-sacs mesh themselves; no rectangle reaches past their cut. */
export function downtownCells() {
  const xs = new Set<number>(), zs = new Set<number>();
  for (const r of [...DOWNTOWN_STREETS.map(s => s.rect), ...DOWNTOWN_WALKS.map(w => w.rect)]) { xs.add(r[0]); xs.add(r[1]); zs.add(r[2]); zs.add(r[3]); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const kind: (DowntownKind | null)[][] = X.slice(1).map((x1, i) => Z.slice(1).map((z1, j) => {
    const x = (X[i] + x1) / 2, z = (Z[j] + z1) / 2;
    if (culDeSacAt(x, z)) return null;
    for (const street of DOWNTOWN_STREETS) if (inside(street.rect, x, z)) return 'road';
    for (const walk of DOWNTOWN_WALKS) if (inside(walk.rect, x, z)) return 'walk';
    return null;
  }));
  return { X, Z, kind };
}

/** The carriageway's outer edge (the curb face) at an angle around a cul-de-sac: the turning
 * circle, or the straight street edge where that reaches further toward the cut. */
export function culDeSacRoadRadius(c: CulDeSac, angle: number) {
  const s = Math.abs(Math.sin(angle)), cosine = Math.cos(angle);
  if (cosine >= 0 || s < 1e-9) return cosine >= 0 ? c.road : Math.min(c.walk, (c.center[0] - c.cut) / -cosine);
  return Math.max(c.road, Math.min(c.halfWidth / s, (c.center[0] - c.cut) / -cosine));
}
/** The sidewalk ring's outer edge: the circle, clipped by the cut line toward the street. */
export function culDeSacOuterRadius(c: CulDeSac, angle: number) {
  const cosine = Math.cos(angle);
  return cosine >= 0 ? c.walk : Math.min(c.walk, (c.center[0] - c.cut) / -cosine);
}

/** Road markings: dashed centre lines and zebra crossings (visual only). */
export type Marking = { rect: ChartRect; color: 'yellow' | 'white' };
export function downtownMarkings(): Marking[] {
  const out: Marking[] = [];
  const dashes = (x0: number, x1: number, z: number, skip: readonly (readonly [number, number])[]) => {
    for (let x = x0 + .6; x + 2 <= x1; x += 4) if (!skip.some(([a, b]) => x + 2 > a && x < b)) out.push({ rect: [x, x + 2, z - .07, z + .07], color: 'yellow' });
  };
  dashes(-22, MAIN_CUL.cut - 1, 0, [[-7.5, 7.5]]);
  dashes(-22, PALM_CUL.cut - 1, 22.5, [[-5, 5]]);
  for (let z = -13.4; z + 2 <= -9; z += 4) out.push({ rect: [-.07, .07, z, z + 2], color: 'yellow' });
  // Zebra crossings: across Main St at the plaza and at each end, and across Pier St.
  const zebraAcrossX = (x0: number, x1: number, z0: number, z1: number) => { for (let z = z0 + .25; z + .5 <= z1; z += 1) out.push({ rect: [x0, x1, z, z + .5], color: 'white' }); };
  const zebraAcrossZ = (x0: number, x1: number, z0: number, z1: number) => { for (let x = x0 + .25; x + .5 <= x1; x += 1) out.push({ rect: [x, x + .5, z0, z1], color: 'white' }); };
  zebraAcrossX(-6.5, -4, -3.5, 3.5); zebraAcrossX(4, 6.5, -3.5, 3.5);
  zebraAcrossX(-21.5, -19.3, -3.5, 3.5);
  zebraAcrossX(24.6, 26.8, -3.5, 3.5);
  zebraAcrossZ(-3.5, 3.5, -8, -5.8);
  zebraAcrossX(-4.5, -2.3, 19.5, 25.5); zebraAcrossX(2.3, 4.5, 19.5, 25.5);
  // Stop bars before the crossings.
  for (const x of [-7, 7]) out.push({ rect: [x - .15, x + .15, -3.5, 3.5], color: 'white' });
  return out;
}

/** Street furniture along the sidewalks (chart x, z, kind). Palms, lamps and benches are solid. A
 * lamp's yaw turns its arm from the default (toward the nearer street centre line). A palm's look
 * is seeded by its list index unless `seed` pins it. */
export type Furniture = { kind: 'palm' | 'lamp' | 'bench'; x: number; z: number; yaw?: number; seed?: number };
/** A point on a cul-de-sac ring; `yaw` turns a lamp's arm (local +Z) toward the centre. */
const ringPoint = (c: CulDeSac, radius: number, degrees: number) => {
  const a = degrees * Math.PI / 180;
  return { x: c.center[0] + Math.cos(a) * radius, z: c.center[1] + Math.sin(a) * radius, yaw: Math.atan2(-Math.cos(a), Math.sin(a)) };
};
const ringLamp = (c: CulDeSac, degrees: number): Furniture => ({ kind: 'lamp', ...ringPoint(c, c.walk - .75, degrees) });
export const DOWNTOWN_FURNITURE: readonly Furniture[] = [
  // Main St palms and lamps stand clear of every shop door and the motel walkway.
  ...[-24, -14, 14, 26.3].map(x => ({ kind: 'palm' as const, x, z: 4.25 })),
  ...[-24, -16].map(x => ({ kind: 'palm' as const, x, z: -4.25 })),
  ...[-17.5, -10.8, 10.8, 18].map(x => ({ kind: 'lamp' as const, x, z: 4.1 })),
  ...[-13, 10.4, 18.4].map(x => ({ kind: 'lamp' as const, x, z: -4.1 })),
  ...[-20, -12, 12, 21.5].map(x => ({ kind: 'palm' as const, x, z: 18.25 })),
  ...[-10, 1.5, 12].map(x => ({ kind: 'lamp' as const, x, z: 26.8 })),
  { kind: 'palm', x: -5.3, z: -12 }, { kind: 'palm', x: 5.3, z: -12 },
  { kind: 'lamp', x: -5.2, z: -8.5 }, { kind: 'lamp', x: 5.2, z: -10.6 },
  { kind: 'palm', x: -29.2, z: -9 }, { kind: 'palm', x: -29.2, z: 9 }, { kind: 'palm', x: -29.2, z: 20 },
  { kind: 'lamp', x: -27.2, z: -5.2 }, { kind: 'lamp', x: -27.2, z: 5.2 },
  // The courtyard: palms in the four corner planters; the plaza stays open round the fountain.
  { kind: 'palm', x: -6.4, z: 8.3 }, { kind: 'palm', x: 6.4, z: 8.3 }, { kind: 'palm', x: -6.4, z: 15.3 }, { kind: 'palm', x: 6.4, z: 15.3 },
  { kind: 'bench', x: -24.5, z: 5.1 }, { kind: 'bench', x: -12, z: 26.6, yaw: Math.PI },
  // Each cul-de-sac island carries a palm; lamps stand round the turning circles. The seeds keep
  // both palms as they grew before the courtyard benches were taken out of this list.
  { kind: 'palm', x: MAIN_CUL.center[0], z: MAIN_CUL.center[1], seed: 39 },
  { kind: 'palm', x: PALM_CUL.center[0], z: PALM_CUL.center[1], seed: 40 },
  ringLamp(MAIN_CUL, 52), ringLamp(MAIN_CUL, -52), ringLamp(MAIN_CUL, 125),
  ringLamp(PALM_CUL, 60), ringLamp(PALM_CUL, -70),
];

/** Courtyard plaza dressing, drawn by the downtown kit and collided as landmark solids. */
export const PLAZA = {
  /** Square stone planters under the corner palms. */
  planters: [[-6.4, 8.3], [6.4, 8.3], [-6.4, 15.3], [6.4, 15.3]] as const,
  planterSize: 1.5,
  /** Poles carrying the string lights strung across the plaza (chart x, z). */
  lightPoles: [[-8.95, 6.5], [8.95, 6.5], [-8.95, 17.1], [8.95, 17.1]] as const,
  lightPoleHeight: 5.8,
  /** Lit bollards along the Main St edge, leaving the middle open. */
  bollards: [[-7.6, 6.45], [-5.2, 6.45], [5.2, 6.45], [7.6, 6.45]] as const,
} as const;
