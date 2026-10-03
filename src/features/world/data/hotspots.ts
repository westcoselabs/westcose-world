import { heightAt, PLANET_PLACES } from './planet';
import { MAP_SEA_LEVEL, mapDirection, mapPoint } from './world-map';
/** Each prompt sits on the ground, or at its place's own elevation (the lighthouse balcony). */
export const HOTSPOTS = PLANET_PLACES.map(place => ({
  ...place,
  position: mapPoint(place.x, place.z, 'elevation' in place ? place.elevation : Math.max(MAP_SEA_LEVEL, heightAt(mapDirection(place.x, place.z)))).toArray() as [number, number, number],
}));
export type HotspotId = typeof HOTSPOTS[number]['id'];
