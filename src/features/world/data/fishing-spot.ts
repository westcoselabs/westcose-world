/** Where Pier Pressure is played: a mid-segment gap in the seaward rail on the west side of the
 * pier head, with open deck behind it (the bait shack stands on the east side). Shared by the
 * world places, the fishing controller and the checks. Chart coordinates throughout. */
import { PIER_LAYOUT, pierChartAt } from './pier-layout';
import { MAP_SEA_LEVEL } from './world-map';

/** The seaward rail line and the deck height. */
export const RAIL_Z = PIER_LAYOUT.head.center[1] - PIER_LAYOUT.head.depth / 2;
export const DECK = PIER_LAYOUT.elevation;
/** Metres across the deck: the angler stands between the rail posts at -2.571 and -0.857. */
export const SPOT_ACROSS = -1.7;
/** The angler, just inside the rail, and the prompt a little further in. */
export const ANGLER = { ...pierChartAt(SPOT_ACROSS, RAIL_Z + .55), across: SPOT_ACROSS };
export const PROMPT = pierChartAt(SPOT_ACROSS, RAIL_Z + 1.3);
/** Gary's rail post, beside the angler toward the life ring. */
export const GULL_ACROSS = -.857;
export const GULL_POST = pierChartAt(GULL_ACROSS, RAIL_Z);
export const RAIL_TOP = DECK + PIER_LAYOUT.railHeight;
/** Dressing by the spot, metres across the deck: a cooler toward Gary, a bait bucket and an
 * A-frame toward the coin-op viewer (at -2.6). None of it collides. */
export const COOLER_ACROSS = -1.05, BUCKET_ACROSS = -2.2, AFRAME_ACROSS = -3.4;
export const WATER = MAP_SEA_LEVEL;

/** The chart point `distance` metres beyond the rail at an aim angle (radians, + is east). */
export function castChart(aim: number, distance: number) {
  const origin = pierChartAt(SPOT_ACROSS, RAIL_Z);
  return { x: origin.x + Math.sin(aim) * distance, z: RAIL_Z - Math.cos(aim) * distance };
}
