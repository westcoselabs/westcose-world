import { directionAt, frameAt, heightAt } from "../data/planet";
import { TOWN_SPAWN } from "../data/town-layout";
import type { InteriorId } from "../data/town-types";
import { MAP_SEA_LEVEL, mapCoordinates, mapDirection, mapFrame } from "../data/world-map";
import { createSnowboardSession, type SnowboardSession } from "./snowboard-session";
import { createSkateSession, type SkateSession } from "./skate-session";
import { createFishingSession, type FishingSession } from "./fishing-session";

/** `tickets` is the lift-ticket booth menu; `snowboard` is a live run of the mini-game;
 * `skating` is riding the skateboard (free skate or a game of S.K.A.T.E.); `tackle` is the
 * Pier Pressure menu at the end of the pier and `fishing` a live tide. */
export type WorldMode = "loading" | "intro" | "exploring" | "reading" | "menu" | "paused" | "overview" | "error" | "tickets" | "snowboard" | "skating" | "tackle" | "fishing";
export type WorldPosition = { x: number; y: number; z: number };
/**
 * A map direction can have the normal outdoor support and a lower cave floor.
 * This state selects the radial layer without changing the globe coordinate.
 */
export type SupportLayer = "upper" | "tunnel";

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
  /** The selected radial support at the current map direction. */
  supportLayer: SupportLayer;
  interior: InteriorId | null;
  travelDistance: number;
  lapCount: number;
  reducedMotion: boolean;
  overviewTransition: number;
  resetRequested: boolean;
  teleportRequested?: WorldPosition;
  forwardRequested?: WorldPosition;
  /** Development fixtures can deliberately enter the cave; ordinary teleports stay above it. */
  teleportSupportLayer?: SupportLayer;
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
  /** The snowboard mini-game; the walker keeps its own position while a run is active. */
  snowboard: SnowboardSession;
  /** The skateboard; while riding, the walker's position follows the rider. */
  skate: SkateSession;
  /** Pier Pressure; the walker waits at the fishing spot while a tide is on. */
  fishing: FishingSession;
  /** Development-only review camera: when set, the follow camera is replaced by this fixed view. */
  debugCamera?: { position: WorldPosition; target: WorldPosition; up: WorldPosition } | null;
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
    grounded: false, swimming: false, supportKind:"ground", supportLayer:"upper", interior:null, travelDistance: 0, lapCount: 0, reducedMotion: false,
    overviewTransition: 1, resetRequested: false, keys: new Set(),
    touch: { x: 0, y: 0, active: false }, pointer: { x: 0, y: 0, originX: 0, originY: 0, active: false },
    landmarkFraming: { summitNdc: { x: 0, y: 0, z: 0 }, summitFraming: 0, summitVisible: false },
    counters: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
    snowboard: createSnowboardSession(),
    skate: createSkateSession(),
    fishing: createFishingSession(),
  };
}
