import { heightAt, PLANET_PLACES } from './planet';
import { MAP_SEA_LEVEL, mapDirection, mapPoint } from './world-map';
export const HOTSPOTS = PLANET_PLACES.map(place => ({
  ...place,
  position: mapPoint(place.x, place.z, Math.max(MAP_SEA_LEVEL, heightAt(mapDirection(place.x, place.z)))).toArray() as [number, number, number],
}));
export type HotspotId = typeof HOTSPOTS[number]['id'];
