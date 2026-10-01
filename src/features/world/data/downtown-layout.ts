/** Downtown WestCose: real streets with asphalt carriageways, raised sidewalks and curbs.
 * Axis-aligned chart rectangles; a carriageway wins over any sidewalk it crosses. The same
 * classification drives walking support, the street mesh and the grindable curb lines.
 */
import { SKATEPARK } from './skatepark-layout';

export const STREET_LEVEL = .22;
export const WALK_LEVEL = SKATEPARK.street;
export const CURB_HEIGHT = WALK_LEVEL - STREET_LEVEL;

/** [x0, x1, z0, z1] in chart metres. */
export type ChartRect = readonly [number, number, number, number];
export type DowntownStreet = { id: string; name: string; rect: ChartRect; axis: 'x' | 'z' };
export type DowntownWalk = { id: string; rect: ChartRect };

/** Main St runs east–west through town; Pier St leaves it south to the boardwalk and pier;
 * Palm Ave is the quieter back street. The plaza carries the resort trail north. */
export const DOWNTOWN_STREETS: readonly DowntownStreet[] = [
  { id: 'main-st', name: 'Main Street', rect: [-22, 25, -3.5, 3.5], axis: 'x' },
  { id: 'pier-st', name: 'Pier Street', rect: [-3.5, 3.5, -14, -3.5], axis: 'z' },
  { id: 'palm-ave', name: 'Palm Avenue', rect: [-22, 20, 19.5, 25.5], axis: 'x' },
];
export const DOWNTOWN_WALKS: readonly DowntownWalk[] = [
  { id: 'main-north', rect: [-26.5, 25, 3.5, 6] },
  { id: 'main-south', rect: [-26.5, 25, -6, -3.5] },
  { id: 'stair-plaza', rect: [-26.5, -22, -3.5, 3.5] },
  { id: 'west-promenade', rect: [-32, -26.5, -14, 27.5] },
  { id: 'pier-west', rect: [-6, -3.5, -14, -6] },
  { id: 'pier-east', rect: [3.5, 6, -14, -6] },
  { id: 'courtyard', rect: [-7, 7, 6, 17.5] },
  { id: 'palm-south', rect: [-26.5, 20, 17.5, 19.5] },
  { id: 'palm-north', rect: [-26.5, 20, 25.5, 27.5] },
  { id: 'alley', rect: [16.8, 19.2, -14, -6] },
];
/** The bluff's retaining wall faces the promenade; the grand stairs cut through it. */
export const BLUFF_WALL = { x: SKATEPARK.bluffX, thickness: .5, z0: -24, z1: 27.5 } as const;
/** The plaza sculpture and the fresh-load spawn north of it, looking down Pier St to the pier. */
export const COURTYARD = { sculpture: [0, 10.5] as const, spawn: [0, 15] as const };

const inside = (r: ChartRect, x: number, z: number) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
const BOUNDS: ChartRect = [-32, 25, -14, 27.5];

export type DowntownKind = 'road' | 'walk';
/** Carriageway or sidewalk at a chart point, or null off the paved network. */
export function downtownKindAt(x: number, z: number): DowntownKind | null {
  if (!inside(BOUNDS, x, z)) return null;
  for (const street of DOWNTOWN_STREETS) if (inside(street.rect, x, z)) return 'road';
  for (const walk of DOWNTOWN_WALKS) if (inside(walk.rect, x, z)) return 'walk';
  return null;
}
export function downtownSurfaceAt(x: number, z: number): { height: number; kind: DowntownKind; id: string } | null {
  if (!inside(BOUNDS, x, z)) return null;
  for (const street of DOWNTOWN_STREETS) if (inside(street.rect, x, z)) return { height: STREET_LEVEL, kind: 'road', id: street.id };
  for (const walk of DOWNTOWN_WALKS) if (inside(walk.rect, x, z)) return { height: WALK_LEVEL, kind: 'walk', id: walk.id };
  return null;
}
export const nearDowntown = (x: number, z: number, margin = 0) => x >= BOUNDS[0] - margin && x <= BOUNDS[1] + margin && z >= BOUNDS[2] - margin && z <= BOUNDS[3] + margin;

/** Cell decomposition of the network: every distinct rectangle edge splits the plane, and
 * each cell is wholly road, walk or open ground. Shared by the mesh and the curb lines. */
export function downtownCells() {
  const xs = new Set<number>(), zs = new Set<number>();
  for (const r of [...DOWNTOWN_STREETS.map(s => s.rect), ...DOWNTOWN_WALKS.map(w => w.rect)]) { xs.add(r[0]); xs.add(r[1]); zs.add(r[2]); zs.add(r[3]); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const kind: (DowntownKind | null)[][] = X.slice(1).map((x1, i) => Z.slice(1).map((z1, j) => downtownKindAt((X[i] + x1) / 2, (Z[j] + z1) / 2)));
  return { X, Z, kind };
}

/** Road markings: dashed centre lines and zebra crossings (visual only). */
export type Marking = { rect: ChartRect; color: 'yellow' | 'white' };
export function downtownMarkings(): Marking[] {
  const out: Marking[] = [];
  const dashes = (x0: number, x1: number, z: number, skip: readonly (readonly [number, number])[]) => {
    for (let x = x0 + .6; x + 2 <= x1; x += 4) if (!skip.some(([a, b]) => x + 2 > a && x < b)) out.push({ rect: [x, x + 2, z - .07, z + .07], color: 'yellow' });
  };
  dashes(-22, 25, 0, [[-7.5, 7.5]]);
  dashes(-22, 20, 22.5, [[-5, 5]]);
  for (let z = -13.4; z + 2 <= -9; z += 4) out.push({ rect: [-.07, .07, z, z + 2], color: 'yellow' });
  // Zebra crossings: across Main St at the plaza and at each end, and across Pier St.
  const zebraAcrossX = (x0: number, x1: number, z0: number, z1: number) => { for (let z = z0 + .25; z + .5 <= z1; z += 1) out.push({ rect: [x0, x1, z, z + .5], color: 'white' }); };
  const zebraAcrossZ = (x0: number, x1: number, z0: number, z1: number) => { for (let x = x0 + .25; x + .5 <= x1; x += 1) out.push({ rect: [x, x + .5, z0, z1], color: 'white' }); };
  zebraAcrossX(-6.5, -4, -3.5, 3.5); zebraAcrossX(4, 6.5, -3.5, 3.5);
  zebraAcrossX(-21.5, -19.3, -3.5, 3.5);
  zebraAcrossZ(-3.5, 3.5, -8, -5.8);
  zebraAcrossX(-4.5, -2.3, 19.5, 25.5); zebraAcrossX(2.3, 4.5, 19.5, 25.5);
  // Stop bars before the crossings.
  for (const x of [-7, 7]) out.push({ rect: [x - .15, x + .15, x < 0 ? -3.5 : -3.5, 3.5], color: 'white' });
  return out;
}

/** Street furniture along the sidewalks (chart x, z, kind). Palms and lamps are solid. */
export type Furniture = { kind: 'palm' | 'lamp' | 'bench'; x: number; z: number; yaw?: number };
export const DOWNTOWN_FURNITURE: readonly Furniture[] = [
  // Main St palms stand clear of every shop door.
  ...[-21, -8, 8, 21].flatMap(x => [{ kind: 'palm' as const, x, z: 4.25 }, { kind: 'palm' as const, x, z: -4.25 }]),
  ...[-14.5, -5.5, 5.5, 14.5, 23.5].flatMap(x => [{ kind: 'lamp' as const, x, z: 4.1 }, { kind: 'lamp' as const, x, z: -4.1 }]),
  ...[-15, -5, 7, 15].map(x => ({ kind: 'palm' as const, x, z: 18.25 })),
  ...[-10, 1.5, 12].map(x => ({ kind: 'lamp' as const, x, z: 26.8 })),
  { kind: 'palm', x: -5.3, z: -12 }, { kind: 'palm', x: 5.3, z: -12 },
  { kind: 'lamp', x: -5.2, z: -8.5 }, { kind: 'lamp', x: 5.2, z: -8.5 },
  { kind: 'palm', x: -29.2, z: -9 }, { kind: 'palm', x: -29.2, z: 9 }, { kind: 'palm', x: -29.2, z: 20 },
  { kind: 'lamp', x: -27.2, z: -5.2 }, { kind: 'lamp', x: -27.2, z: 5.2 },
  { kind: 'palm', x: -5.5, z: 8 }, { kind: 'palm', x: 5.5, z: 8 }, { kind: 'palm', x: -5.5, z: 16 }, { kind: 'palm', x: 5.5, z: 16 },
  { kind: 'bench', x: -3.4, z: 12.8, yaw: Math.PI / 2 }, { kind: 'bench', x: 3.4, z: 12.8, yaw: -Math.PI / 2 },
  { kind: 'bench', x: -24.5, z: 5.1 }, { kind: 'bench', x: -12, z: 26.6, yaw: Math.PI },
];
