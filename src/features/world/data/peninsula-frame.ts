/** Where the approved peninsula stands on the globe.
 *
 * The lighthouse cape, the cave beneath it, the hidden-beach cove and its cliffs stay authored
 * in their approved chart coordinates (peninsula-layout.ts). One rigid rotation of the globe
 * carries that whole system east, clear of the Main Street and Palm Avenue cul-de-sacs, so
 * every physical size, height, slope and tunnel section is exactly as approved. Queries in
 * world chart coordinates map back into the authored frame; authored geometry maps forward.
 */
import { Quaternion, Vector3 } from 'three';
import { mapCoordinates, mapDirection, mapFrame } from './world-map';

/** The authored chart point that is carried east, on the public beach by the cave mouth. */
export const PENINSULA_PIVOT = { x: 30, z: -29 } as const;
/** Metres the pivot moves east along its chart row. */
export const PENINSULA_SHIFT = 17;
export const PENINSULA_SITE = { x: PENINSULA_PIVOT.x + PENINSULA_SHIFT, z: PENINSULA_PIVOT.z } as const;

/** Authored frame → world frame: the pivot's east, up and south land on the site's. */
export const PENINSULA_ROTATION = mapFrame(PENINSULA_SITE.x, PENINSULA_SITE.z).quaternion.clone()
  .multiply(mapFrame(PENINSULA_PIVOT.x, PENINSULA_PIVOT.z).quaternion.clone().invert());
export const PENINSULA_INVERSE_ROTATION = PENINSULA_ROTATION.clone().invert();

const scratch = new Vector3();
/** World chart point of an authored chart point. */
export function peninsulaWorldPoint(x: number, z: number) {
  return mapCoordinates(scratch.copy(mapDirection(x, z)).applyQuaternion(PENINSULA_ROTATION));
}
/** Authored chart point of a world chart point. */
export function peninsulaAuthoredPoint(x: number, z: number) {
  return mapCoordinates(scratch.copy(mapDirection(x, z)).applyQuaternion(PENINSULA_INVERSE_ROTATION));
}
export const placedPoint = ([x, z]: readonly [number, number]): [number, number] => {
  const p = peninsulaWorldPoint(x, z);
  return [p.x, p.z];
};
/** Rotate an authored world-space vector (a position or direction) onto the placed peninsula. */
export const placeVector = (v: Vector3) => v.applyQuaternion(PENINSULA_ROTATION);
export const placeQuaternion = (q: Quaternion) => q.premultiply(PENINSULA_ROTATION);

/** Cheap world-chart bounds that contain the placed peninsula and its blend margin. */
export const nearPeninsula = (x: number, z: number) => x > 22 && z > -62 && z < 50;
