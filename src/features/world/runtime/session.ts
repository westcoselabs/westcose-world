import { Vector3 } from "three";
import { frameAt, PLANET_VERSION, RADIUS } from "../data/planet";
import { buildingContact, supportRadius } from "./planet-collision";
import { DEFAULT_FORWARD, DEFAULT_HEADING, DEFAULT_SPAWN, PLAYER_CENTER_HEIGHT, type WorldPosition, type WorldRuntimeState } from "./types";
import { MAP_MAX_HEIGHT, MAP_SEA_LEVEL } from "../data/world-map";

export const SESSION_KEY = "westcose-world:session:v2";
const PLANET_LAYOUT_VERSION = PLANET_VERSION;

export interface WorldSession {
  version: 2;
  layoutVersion: number;
  district: "westcose-planet";
  position: WorldPosition;
  forward: WorldPosition;
  heading: number;
  longitude: number;
  latitude: number;
}

function isPosition(value: unknown): value is WorldPosition {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<WorldPosition>;
  return typeof point.x === "number" && Number.isFinite(point.x)
    && typeof point.y === "number" && Number.isFinite(point.y)
    && typeof point.z === "number" && Number.isFinite(point.z);
}

function radialPositionIsValid(position: WorldPosition): boolean {
  const radius = Math.hypot(position.x, position.y, position.z);
  return radius > RADIUS + MAP_SEA_LEVEL - 3 && radius < RADIUS + MAP_MAX_HEIGHT + PLAYER_CENTER_HEIGHT + 2;
}

/** Return to the same terrain, room floor or pier unless the saved footprint is now obstructed. */
export function getSafePosition(position: WorldPosition): WorldPosition {
  if (!isPosition(position) || !radialPositionIsValid(position)) return { ...DEFAULT_SPAWN };
  const normal = new Vector3(position.x, position.y, position.z).normalize();
  const surface = normal.multiplyScalar(supportRadius(normal) + PLAYER_CENTER_HEIGHT);
  if (buildingContact(surface, 0.38)) return { ...DEFAULT_SPAWN };
  return { x: surface.x, y: surface.y, z: surface.z };
}

function safeForward(position: WorldPosition, forward?: WorldPosition): WorldPosition {
  const up = new Vector3(position.x, position.y, position.z).normalize();
  const tangent = isPosition(forward) ? new Vector3(forward.x, forward.y, forward.z) : new Vector3();
  tangent.addScaledVector(up, -tangent.dot(up));
  if (!Number.isFinite(tangent.lengthSq()) || tangent.lengthSq() < 0.01) tangent.copy(frameAt(Math.atan2(up.x, up.z), Math.asin(up.y)).east);
  tangent.normalize();
  return { x: tangent.x, y: tangent.y, z: tangent.z };
}

/** Storage is optional; old flat-map snapshots never become planet coordinates. */
export function readSession(): WorldSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<WorldSession>;
    if (record.version !== 2 || record.layoutVersion !== PLANET_LAYOUT_VERSION || record.district !== "westcose-planet"
      || !isPosition(record.position) || !radialPositionIsValid(record.position) || !isPosition(record.forward)
      || typeof record.heading !== "number" || !Number.isFinite(record.heading)
      || typeof record.longitude !== "number" || Math.abs(record.longitude) > Math.PI || !Number.isFinite(record.longitude)
      || typeof record.latitude !== "number" || Math.abs(record.latitude) > Math.PI / 2 || !Number.isFinite(record.latitude)) return null;
    const up = new Vector3(record.position.x, record.position.y, record.position.z).normalize();
    const facing = new Vector3(record.forward.x, record.forward.y, record.forward.z);
    if (Math.abs(facing.length() - 1) > 0.05 || Math.abs(facing.dot(up)) > 0.05) return null;
    if (Math.abs(Math.asin(up.y) - record.latitude) > 0.01
      || Math.abs(Math.atan2(Math.sin(Math.atan2(up.x, up.z) - record.longitude), Math.cos(Math.atan2(up.x, up.z) - record.longitude))) > 0.01) return null;
    const position = getSafePosition(record.position);
    const nextUp = new Vector3(position.x, position.y, position.z).normalize();
    return {
      version: 2, layoutVersion: PLANET_LAYOUT_VERSION, district: "westcose-planet", position,
      forward: safeForward(position, record.forward), heading: Math.atan2(Math.sin(record.heading), Math.cos(record.heading)),
      longitude: Math.atan2(nextUp.x, nextUp.z), latitude: Math.asin(nextUp.y),
    };
  } catch {
    return null;
  }
}

/** Explicit navigation/lifecycle checkpoints only; no storage writes in the animation loop. */
export function saveSession(runtime: Pick<WorldRuntimeState, "position" | "heading"> & Partial<Pick<WorldRuntimeState, "forward">>): boolean {
  if (typeof window === "undefined") return false;
  const position = getSafePosition(runtime.position);
  const up = new Vector3(position.x, position.y, position.z).normalize();
  const heading = Number.isFinite(runtime.heading) ? runtime.heading : DEFAULT_HEADING;
  const session: WorldSession = {
    version: 2, layoutVersion: PLANET_LAYOUT_VERSION, district: "westcose-planet", position,
    forward: safeForward(position, runtime.forward ?? DEFAULT_FORWARD),
    heading: Math.atan2(Math.sin(heading), Math.cos(heading)), longitude: Math.atan2(up.x, up.z), latitude: Math.asin(up.y),
  };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Blocked storage cannot block exploration or reset.
  }
}
