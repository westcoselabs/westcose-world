/** A local physical frame on the globe: an azimuthal-equidistant map about one point, with
 * u east and v north in metres. Within a few tens of metres of its centre a local metre is a
 * physical metre, so shapes authored here keep their true size and proportion. Chart
 * coordinates do not: a chart metre of z shrinks by cos(x / R), which is what stretched the
 * old chart-authored cape when the globe radius changed. Same construction as PARK_FRAME. */
import { Vector3 } from 'three';
import { MAP_RADIUS, mapCoordinates, mapDirection } from './world-map';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export type LocalFrame = ReturnType<typeof createLocalFrame>;

/** `radius` is the sphere the local metres are measured on (the base sphere by default). */
export function createLocalFrame(center: Vector3, east: Vector3, north: Vector3, radius = MAP_RADIUS) {
  const C = center.clone().normalize();
  const E = east.clone().addScaledVector(C, -east.dot(C)).normalize();
  const N = north.clone().addScaledVector(C, -north.dot(C)).addScaledVector(E, -north.dot(E)).normalize();
  /** Local coordinates of a planet direction (any length). */
  const local = (d: { x: number; y: number; z: number }) => {
    const length = Math.hypot(d.x, d.y, d.z) || 1;
    const cos = clamp((d.x * C.x + d.y * C.y + d.z * C.z) / length, -1, 1), angle = Math.acos(cos), sin = Math.sqrt(1 - cos * cos);
    const scale = radius * (sin > 1e-9 ? angle / sin : 1) / length;
    return { u: (d.x * E.x + d.y * E.y + d.z * E.z) * scale, v: (d.x * N.x + d.y * N.y + d.z * N.z) * scale };
  };
  /** Unit planet direction of a local point. */
  const direction = (u: number, v: number, target = new Vector3()) => {
    const r = Math.hypot(u, v), angle = r / radius, k = r > 1e-9 ? Math.sin(angle) / r : 1 / radius;
    return target.copy(C).multiplyScalar(Math.cos(angle)).addScaledVector(E, u * k).addScaledVector(N, v * k).normalize();
  };
  return {
    center: C, east: E, north: N, radius, local, direction,
    /** Local coordinates of a world chart point. */
    localAtChart: (x: number, z: number) => local(mapDirection(x, z)),
    /** World point at a local position and a height above the base sphere. */
    point: (u: number, v: number, height: number, target = new Vector3()) => direction(u, v, target).multiplyScalar(MAP_RADIUS + height),
    /** World chart coordinates of a local point. */
    chart: (u: number, v: number) => mapCoordinates(direction(u, v)),
    /** Local east/north tangents at a local point (the centre frame carried to it). */
    tangents: (u: number, v: number) => {
      const up = direction(u, v);
      return { up, east: E.clone().addScaledVector(up, -E.dot(up)).normalize(), north: N.clone().addScaledVector(up, -N.dot(up)).normalize() };
    },
  };
}
