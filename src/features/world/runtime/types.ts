import { directionAt, frameAt, heightAt } from "../data/planet";
import { TOWN_SPAWN } from "../data/town-layout";
import type { InteriorId } from "../data/town-types";
import { MAP_SEA_LEVEL, mapCoordinates, mapDirection, mapFrame } from "../data/world-map";

export type WorldMode = "loading" | "intro" | "exploring" | "reading" | "menu" | "paused" | "overview" | "error";
export type WorldPosition = { x: number; y: number; z: number };

/** Mutable simulation data. Coordinates are planet-centered, never a wrapped flat map. */
export interface WorldRuntimeState {
  mode: WorldMode;
  position: WorldPosition;
  /** Unit vectors that are parallel transported as the visitor moves around the sphere. */
  forward: WorldPosition;
  up: WorldPosition;
  /** Geographic compass bearing, only for UI and persisted-state compatibility. */
  heading: number;
  hotspot: string | null;
  cameraDistance: number;
  desiredCameraDistance: number;
  grounded: boolean;
  swimming: boolean;
  supportKind: "ground" | "floor" | "pier" | "water";
  interior: InteriorId | null;
  travelDistance: number;
  lapCount: number;
  reducedMotion: boolean;
  overviewTransition: number;
  resetRequested: boolean;
  teleportRequested?: WorldPosition;
  forwardRequested?: WorldPosition;
  keys: Set<string>;
  /** Screen right is +x; screen forward is +y. Shared with accessible touch controls. */
  touch: { x: number; y: number; active: boolean };
  pointer: { x: number; y: number; originX: number; originY: number; active: boolean };
  /** Runtime camera measurement retained for the development-only world debugger. */
  landmarkFraming: {
    summitNdc: WorldPosition;
    summitFraming: number;
    summitVisible: boolean;
  };
  counters: { drawCalls: number; triangles: number; geometries: number; textures: number };
}

export const PLAYER_CENTER_HEIGHT = 0.85;
const entryMap = mapCoordinates(directionAt(TOWN_SPAWN.lon, TOWN_SPAWN.lat));
const entryElevation = Math.max(MAP_SEA_LEVEL, heightAt(mapDirection(entryMap.x, entryMap.z)));
const entryFrame = mapFrame(entryMap.x, entryMap.z, entryElevation);
const entryPoint = entryFrame.position.clone().addScaledVector(entryFrame.up, PLAYER_CENTER_HEIGHT);
const entryDirections = { east:entryFrame.east, north:entryFrame.north, south:entryFrame.north.clone().negate(), west:entryFrame.east.clone().negate() };
const entryForward = entryDirections[TOWN_SPAWN.facing];
const entryGeographicFrame = frameAt(TOWN_SPAWN.lon, TOWN_SPAWN.lat);
export const DEFAULT_SPAWN: Readonly<WorldPosition> = { x: entryPoint.x, y: entryPoint.y, z: entryPoint.z };
export const DEFAULT_FORWARD: Readonly<WorldPosition> = { x: entryForward.x, y: entryForward.y, z: entryForward.z };
export const DEFAULT_HEADING = Math.atan2(entryForward.dot(entryGeographicFrame.east), entryForward.dot(entryGeographicFrame.north));
export const CAMERA_FOLLOW_DISTANCE = 4.8;

export function createRuntimeState(): WorldRuntimeState {
  return {
    mode: "loading", position: { ...DEFAULT_SPAWN }, forward: { ...DEFAULT_FORWARD },
    up: { x: entryFrame.up.x, y: entryFrame.up.y, z: entryFrame.up.z }, heading: DEFAULT_HEADING,
    hotspot: null, cameraDistance: CAMERA_FOLLOW_DISTANCE, desiredCameraDistance: CAMERA_FOLLOW_DISTANCE,
    grounded: false, swimming: false, supportKind:"ground", interior:null, travelDistance: 0, lapCount: 0, reducedMotion: false,
    overviewTransition: 1, resetRequested: false, keys: new Set(),
    touch: { x: 0, y: 0, active: false }, pointer: { x: 0, y: 0, originX: 0, originY: 0, active: false },
    landmarkFraming: { summitNdc: { x: 0, y: 0, z: 0 }, summitFraming: 0, summitVisible: false },
    counters: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
}
