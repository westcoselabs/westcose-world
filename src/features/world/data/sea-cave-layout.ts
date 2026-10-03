/** The Sea Caves: layout data only (sea-cave.ts turns it into the walkable volume).
 *
 * Everything is in local physical metres in the sea-cave frame: origin on the lighthouse
 * axis, u east and v north (sea-cave.ts builds the frame from the placed lighthouse, so the
 * caves move rigidly with the peninsula). Widths are rock to rock. Floors, ceilings and
 * terrain are elevations above the base sphere, like every other height in the world;
 * passage `height` alone is a clear height above its own floor.
 *
 * The approval drawing (docs/design/sea-cave-approval) is rendered from this file.
 */

export type CavePoint = readonly [u: number, v: number];
export type PassageKind = 'tunnel' | 'crawl' | 'slot' | 'arch';

export type CavePassage = {
  id: string; name: string; kind: PassageKind;
  /** Centreline; width/floor/height have one entry per point and interpolate between. */
  points: readonly CavePoint[];
  width: readonly number[]; floor: readonly number[]; height: readonly number[];
};

export type CaveChamber = {
  id: string; name: string;
  center: CavePoint; radii: readonly [number, number];
  /** Degrees anticlockwise from east, for the first radius. */
  rotation: number;
  floor: number;
  /** Optional floor ramp between two local points (e.g. up onto the window ledge). */
  ramp?: { from: CavePoint; to: CavePoint; floors: readonly [number, number] };
  /** Ceiling elevation at the rim and at the centre; `tilt` raises the +first-axis rim
   * and lowers the opposite one, so a dome can open up toward the sea. */
  wall: number; crown: number; tilt?: number;
  /** Optional straight rock edge: the chamber stops `inset` metres inside this line. */
  face?: { point: CavePoint; outward: CavePoint; inset: number };
};

export type CavePillar = { id: string; center: CavePoint; radii: readonly [number, number]; rotation: number };

/** The walkable centre region stops this far inside the drawn rock, so the 0.31m visitor
 * capsule never visibly enters a wall. */
export const SEA_CAVE_WALL_OFFSET = .35;
/** Minimum rock between any ceiling and the terrain above it, away from the two openings. */
export const SEA_CAVE_COVER = 1.2;

/** The single public entrance, at the cape's west foot on the public beach. */
export const SEA_CAVE_MOUTH = {
  center: [-7.9, 2.9] as CavePoint,
  /** Unit-ish direction into the cave (normalised in sea-cave.ts). */
  inward: [2.9, -1.5] as CavePoint,
  /** Open-air apron outside the mouth where walkers step between beach and cave floor. */
  apron: 3,
  /** Floor at the mouth; the beach route meets it exactly. */
  floor: -.1,
} as const;

export const SEA_CAVE_PASSAGES: readonly CavePassage[] = [
  {
    id: 'tunnel', name: 'Sea Cave Tunnel', kind: 'tunnel',
    // Beach mouth → directly beneath the lighthouse foundation → the Undercroft.
    points: [[-10.9, 4.45], [-7.9, 2.9], [-5, 1.4], [-2, .4], [1, .9], [3.4, 3.4], [5, 5.6]],
    width: [3.6, 3.6, 3.6, 3.8, 3.8, 3.8, 4.2],
    floor: [-.1, -.1, -.05, .05, .15, .25, .3],
    height: [4, 4, 4, 4, 4, 4, 4.1],
  },
  {
    id: 'crawl', name: 'The Crawl', kind: 'crawl',
    // Wide and low: duck-height drama under a flat ceiling, never below camera headroom.
    points: [[4.6, 8.2], [4.1, 11.5], [4.6, 14.6], [6.2, 17.4], [8.4, 19.6]],
    width: [5, 6.5, 6.2, 5.6, 5.4],
    floor: [.3, .35, .4, .5, .6],
    height: [3.3, 3.1, 3.1, 3.1, 3.3],
  },
  {
    id: 'slot', name: 'The Slot', kind: 'slot',
    // Narrow and tall, an S through the seaward rock.
    points: [[7.8, 7.4], [10.2, 9.6], [10, 12.6], [12.2, 15.4], [13.6, 18.4]],
    width: [2.2, 1.8, 1.7, 1.9, 2.4],
    floor: [.3, .35, .4, .5, .6],
    height: [5.5, 7.2, 8, 7.6, 6.4],
  },
  {
    id: 'arch-west', name: 'Twin Arches', kind: 'arch',
    points: [[10.6, 31.2], [9.6, 34.6], [10.6, 38], [12, 40.2]],
    width: [3, 2.8, 2.8, 3],
    floor: [.6, .55, .5, .5],
    height: [4.2, 4.4, 4.4, 4.2],
  },
  {
    id: 'arch-east', name: 'Twin Arches', kind: 'arch',
    points: [[17.4, 31.4], [17.8, 34.8], [16.6, 38.2], [15, 40.2]],
    width: [3, 2.8, 2.8, 3],
    floor: [.6, .55, .5, .5],
    height: [4.2, 4.4, 4.4, 4.2],
  },
];

export const SEA_CAVE_CHAMBERS: readonly CaveChamber[] = [
  { id: 'undercroft', name: 'Undercroft', center: [5.6, 6.6], radii: [3.6, 3], rotation: 30, floor: .3, wall: 3.9, crown: 4.9 },
  {
    id: 'grotto', name: 'The Grotto', center: [14, 25], radii: [9, 7], rotation: 15, floor: .6,
    // The dome rises toward the ocean window: low over the town side, highest seaward.
    wall: 5.6, crown: 9.6, tilt: 1.6,
  },
  {
    // A ledge the full width of the window: an ellipse centred on the cliff face, cut
    // straight along it. Its floor rises with the window's ramp (SEA_CAVE_WINDOW.ramp).
    id: 'window', name: 'Ocean Window', center: [24, 27.4], radii: [4.6, 6.6], rotation: 4.6, floor: .6,
    wall: 8.4, crown: 9.4,
    face: { point: [25.1, 27.4], outward: [1, .08], inset: .3 },
  },
  { id: 'tidepool', name: 'Tide Pool', center: [13.5, 42.2], radii: [4.6, 3.4], rotation: 0, floor: .5, wall: 3.8, crown: 5.2 },
];

/** Rock left standing inside the plan: stalagmite columns round the Grotto rim (keeping
 * the arena disc clear) and the great pillar between the Twin Arches. */
export const SEA_CAVE_PILLARS: readonly CavePillar[] = [
  { id: 'grotto-w', center: [7.2, 23.4], radii: [1.1, .9], rotation: 20 },
  { id: 'grotto-nw', center: [9.3, 29.7], radii: [1, .85], rotation: -15 },
  // A pair framing the ocean window.
  { id: 'grotto-se', center: [18.4, 19.6], radii: [1, .85], rotation: 40 },
  { id: 'grotto-ne', center: [19.6, 30.6], radii: [1.05, .9], rotation: 10 },
  { id: 'arches', center: [13.7, 35.6], radii: [2.3, 2.6], rotation: 0 },
];

/** The ocean window: an opening in the sea cliff on the Grotto's east side. The walkable
 * ledge stops at a boulder lip; the cliff face carries on down to the sea. */
export const SEA_CAVE_WINDOW = {
  /** Centre of the opening on the cliff face, its facing direction and half width. */
  center: [25.1, 27.4] as CavePoint,
  outward: [1, .08] as CavePoint,
  halfWidth: 6.2,
  /** Elevation of the ledge lip and of the arch top above it. */
  sill: 2.5, lintel: 9,
  /** The floor rises from the Grotto (0.6) to the sill between these distances behind the
   * cliff face, across the window's width: a gentle ramp clear of the arena disc. */
  ramp: { from: -6.8, to: -1, rise: 1.9 },
} as const;

/** The rock mass that replaces the old hidden-beach cove: low beside the town, rising
 * seaward to a sea cliff. Footprint vertices carry the blend width of the edge that starts
 * at them: wide on the town side (a slope), narrow on the sea side (a cliff). */
export const SEA_CAVE_MASSIF = {
  footprint: [
    [-2.2, 6, 4.5], [-2.2, 20, 4.5], [-1.4, 28, 4.5], [-1.2, 38, 4.5], [1.6, 45.5, 3],
    [8, 48.4, 1.8], [16, 48, 1.8], [20.8, 44.4, 1.8], [22, 38.4, 1.8], [26.2, 34.4, 1],
    [26.6, 26.4, 1], [24.6, 20.2, 1.2], [20.4, 15.2, 1.8], [18, 9, 1.8], [14.4, 3.6, 2.4],
    [8, 2.4, 2.4], [2, 3, 3],
  ] as readonly (readonly [u: number, v: number, edge: number])[],
  /** Rock top rises from `west` at u = -2 by `slope` per metre east, up to `max`. */
  base: { west: 2.6, slope: .32, max: 11.2 },
  /** Rounded crests on top: [u, v, extra height, radius]. */
  knolls: [[12.5, 13, 1.6, 5], [19, 23, 1.2, 5.5], [15.5, 40.5, 1.4, 5], [6, 36, -1, 6]] as readonly (readonly [number, number, number, number])[],
} as const;

/** The flat disc in the Grotto reserved for a future arena game. Nothing stands in it. */
export const SEA_CAVE_ARENA = { center: [14, 25] as CavePoint, radius: 5 } as const;

/** Named walks for the checks: shape ids in order, the first starting at the mouth apron. */
export const SEA_CAVE_ROUTES = {
  main: ['tunnel', 'undercroft', 'crawl', 'grotto', 'window'],
  slot: ['grotto', 'slot', 'undercroft'],
  arches: ['grotto', 'arch-west', 'tidepool', 'arch-east', 'grotto'],
} as const;
