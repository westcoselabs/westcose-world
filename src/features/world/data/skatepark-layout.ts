/** WestCose Skate Park: a Venice-inspired concrete park on the west bluff above the sea,
 * with a big wooden halfpipe. Pure layout data and analytic surfaces. Everything is
 * authored in a local physical frame (u east, v north, metres on the deck sphere) centred
 * on the park, so the bowls keep their true shape instead of inheriting the chart's
 * cos(x / R) squeeze this far west.
 *
 * The walker, the terrain, the park mesh and the skateboard all read these functions.
 * Heights are above the base sphere, like every other surface in the world.
 */
import { Vector3 } from 'three';
import { MAP_RADIUS, mapDirection, mapFrame } from './world-map';

const DEG = Math.PI / 180;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export const SKATEPARK = {
  /** Chart centre of the park and its deck height. The east edge meets the grand stairs. */
  x: -53.25, z: 0, deck: 3.25,
  /** Rounded-rectangle footprint in local metres (44m by 54m). */
  halfU: 22, halfV: 27, corner: 6,
  /** Street level at the foot of the grand stairs (the Main St sidewalk). */
  street: .37,
  /** Chart x of the bluff's retaining wall above the promenade: the deck stops there. */
  bluffX: -32,
} as const;

// ---------------------------------------------------------------------------
// Local frame. The azimuthal-equidistant map about the park centre has <2% scale error
// across the whole deck, so a local metre is a physical metre.
const RHO = MAP_RADIUS + SKATEPARK.deck;
const CENTER = mapFrame(SKATEPARK.x, SKATEPARK.z);
const C = CENTER.up.clone(), E = CENTER.east.clone(), N = CENTER.north.clone();
export const PARK_FRAME = { center: C, east: E, north: N, radius: RHO };

/** Local park coordinates of a planet direction (any length). */
export function parkLocal(d: { x: number; y: number; z: number }) {
  const length = Math.hypot(d.x, d.y, d.z) || 1;
  const cos = clamp((d.x * C.x + d.y * C.y + d.z * C.z) / length, -1, 1), angle = Math.acos(cos), sin = Math.sqrt(1 - cos * cos);
  const scale = RHO * (sin > 1e-9 ? angle / sin : 1) / length;
  return { u: (d.x * E.x + d.y * E.y + d.z * E.z) * scale, v: (d.x * N.x + d.y * N.y + d.z * N.z) * scale };
}
/** Local coordinates of a chart point. */
export function parkLocalAtChart(x: number, z: number) { return parkLocal(mapDirection(x, z)); }
/** Unit planet direction of a local point. */
export function parkDirection(u: number, v: number, target = new Vector3()) {
  const r = Math.hypot(u, v), angle = r / RHO, k = r > 1e-9 ? Math.sin(angle) / r : 1 / RHO;
  return target.copy(C).multiplyScalar(Math.cos(angle)).addScaledVector(E, u * k).addScaledVector(N, v * k).normalize();
}
/** World point at a local position and a height above the base sphere. */
export function parkPoint(u: number, v: number, height: number, target = new Vector3()) {
  return parkDirection(u, v, target).multiplyScalar(MAP_RADIUS + height);
}
/** Local east/north tangents at a local point (the centre frame carried to it). */
export function parkTangents(u: number, v: number) {
  const up = parkDirection(u, v);
  const east = E.clone().addScaledVector(up, -E.dot(up)).normalize(), north = N.clone().addScaledVector(up, -N.dot(up)).normalize();
  return { up, east, north };
}

/** Local metres east of the bluff's retaining wall (negative on the park side). The wall
 * is a chart meridian, which bows across this local frame; chart x is an exact arc, so a
 * direction's x component measures it directly. */
function bluffEdgeDistance(u: number, v: number) {
  const r = Math.hypot(u, v), a = r / RHO, k = r > 1e-9 ? Math.sin(a) / r : 1 / RHO;
  const x = C.x * Math.cos(a) + (E.x * u + N.x * v) * k;
  return RHO * (Math.asin(clamp(x, -1, 1)) - SKATEPARK.bluffX / MAP_RADIUS);
}
/** Local u of the bluff edge at a local v, moved `inset` metres back into the park. */
export function parkEastEdge(v: number, inset = 0) {
  let u = SKATEPARK.halfU;
  for (let i = 0; i < 4; i++) {
    const over = bluffEdgeDistance(u, v) + inset;
    if (Math.abs(over) < 1e-6) break;
    u -= over / ((bluffEdgeDistance(u + .01, v) - bluffEdgeDistance(u - .01, v)) / .02);
  }
  return u;
}

/** Signed distance to the footprint (negative inside): a rounded rectangle whose east
 * side stops at the bluff edge. */
export function parkFootprintDistance(u: number, v: number) {
  const { halfU, halfV, corner } = SKATEPARK;
  const qx = Math.abs(u) - (halfU - corner), qz = Math.abs(v) - (halfV - corner);
  const box = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - corner;
  return u > 0 ? Math.max(box, bluffEdgeDistance(u, v)) : box;
}

/** The footprint outline, anticlockwise from the east midpoint, inset from the edge.
 * Points are spaced about `spacing` apart and the loop is not closed. */
export function parkFootprintOutline(inset = 0, spacing = .6): [number, number][] {
  const { halfU, halfV, corner } = SKATEPARK, a = halfU - corner, b = halfV - corner, r = corner - inset;
  const out: [number, number][] = [];
  const line = (u0: number, v0: number, u1: number, v1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / spacing));
    for (let i = 0; i < n; i++) out.push([u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n]);
  };
  const arc = (cu: number, cv: number, from: number) => {
    const n = Math.max(2, Math.round(Math.PI / 2 * r / spacing));
    for (let i = 0; i < n; i++) { const q = from + Math.PI / 2 * i / n; out.push([cu + Math.cos(q) * r, cv + Math.sin(q) * r]); }
  };
  line(halfU - inset, 0, halfU - inset, b); arc(a, b, 0);
  line(a, halfV - inset, -a, halfV - inset); arc(-a, b, Math.PI / 2);
  line(-halfU + inset, b, -halfU + inset, -b); arc(-a, -b, Math.PI);
  line(-a, -halfV + inset, a, -halfV + inset); arc(a, -b, Math.PI * 1.5);
  line(halfU - inset, -b, halfU - inset, 0);
  // The east side and its corners stop at the bluff edge.
  return out.map(([u, v]) => [u > 0 ? Math.min(u, parkEastEdge(v, inset)) : u, v]);
}

// ---------------------------------------------------------------------------
// Transition profiles. `w` is the distance inside the rim. A circular transition of
// radius `rt` meets the flat bottom tangentially and rises to `top` degrees, then a
// short straight `vert` section finishes at the coping.
export type Transition = { rt: number; top: number; vert: number };
export function transitionDepth(t: Transition) { return t.vert + t.rt * (1 - Math.cos(t.top * DEG)); }
export function transitionWidth(t: Transition) { return t.vert / Math.tan(t.top * DEG) + t.rt * Math.sin(t.top * DEG); }
/** Height below the rim and its slope d(height)/d(w) (negative: deeper inward). */
export function transitionAt(t: Transition, w: number): { h: number; slope: number } {
  if (w <= 0) return { h: 0, slope: 0 };
  const top = t.top * DEG, tan = Math.tan(top), wv = t.vert / tan;
  if (w <= wv) return { h: -w * tan, slope: -tan };
  const q = wv + t.rt * Math.sin(top) - w;
  if (q <= 0) return { h: -transitionDepth(t), slope: 0 };
  const phi = Math.asin(Math.min(1, q / t.rt));
  return { h: -transitionDepth(t) + t.rt * (1 - Math.cos(phi)), slope: -Math.tan(phi) };
}

// ---------------------------------------------------------------------------
// Pools: smooth unions of circular lobes. Lobes overlap enough that the flat bottom
// is one connected region around `center`, so every ray from it crosses each wall
// level exactly once (the park mesh lofts along those rays).
type Lobe = readonly [u: number, v: number, r: number];
export type PoolSpec = { id: string; name: string; lobes: readonly Lobe[]; blend: number; transition: Transition; center: readonly [number, number] };
export const PARK_POOLS: readonly PoolSpec[] = [
  { id: 'kidney', name: 'The Deep End', lobes: [[-12, -10, 5.6], [-6.9, -10.9, 5.0]], blend: 3.2, transition: { rt: 3.3, top: 84, vert: .35 }, center: [-9.45, -10.4] },
  { id: 'clover', name: 'Clover Bowl', lobes: [[-14, 7.7, 4.4], [-16.2, 3.9, 4.4], [-11.8, 3.9, 4.2]], blend: 2.8, transition: { rt: 2.6, top: 82, vert: .12 }, center: [-14, 5.17] },
];

function smin(a: number, b: number, k: number) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; }
/** Signed distance to a pool's rim (negative inside). */
export function poolDistance(pool: PoolSpec, u: number, v: number) {
  let d = Infinity;
  for (const [lu, lv, r] of pool.lobes) { const di = Math.hypot(u - lu, v - lv) - r; d = d === Infinity ? di : smin(d, di, pool.blend); }
  return d;
}

// ---------------------------------------------------------------------------
// The snake run: a wide, deepening channel that winds west along the south of the park
// from the street plaza to a deep pocket. Its centreline is a tangent-continuous chain
// of arcs, each far wider than the channel, so distance and arc position are smooth
// everywhere inside it: no polyline kinks to throw a rolling board into the air.
type SnakeArc = { cu: number; cv: number; start: number; sweep: number; offset: number };
const SNAKE_RADIUS = 6.5, SNAKE_SWING = 28 * DEG;
// The swing starts at its north crest and ends at its south one; centred on v -22.
const SNAKE_HEAD = { u: 14.4, v: -22 + SNAKE_RADIUS * (1 - Math.cos(SNAKE_SWING)), heading: Math.PI };
const SNAKE_ARCS: readonly SnakeArc[] = (() => {
  const arcs: SnakeArc[] = [];
  let u = SNAKE_HEAD.u, v = SNAKE_HEAD.v, heading = SNAKE_HEAD.heading, offset = 0;
  // Left, then alternating right and left, then back to due west at the tail.
  for (const turn of [1, -2, 2, -2, 2, -1].map(k => k * SNAKE_SWING)) {
    const side = Math.sign(turn), cu = u - side * Math.sin(heading) * SNAKE_RADIUS, cv = v + side * Math.cos(heading) * SNAKE_RADIUS;
    const start = Math.atan2(v - cv, u - cu);
    arcs.push({ cu, cv, start, sweep: turn, offset });
    u = cu + Math.cos(start + turn) * SNAKE_RADIUS; v = cv + Math.sin(start + turn) * SNAKE_RADIUS;
    heading += turn; offset += Math.abs(turn) * SNAKE_RADIUS;
  }
  return arcs;
})();
export const SNAKE_RUN = {
  id: 'snake', name: 'Snake Run', arcs: SNAKE_ARCS, radius: SNAKE_RADIUS,
  length: SNAKE_ARCS.reduce((sum, arc) => sum + Math.abs(arc.sweep) * SNAKE_RADIUS, 0),
  halfWidth: 3.2, rt: 3, depthStart: .5, depthEnd: 2.8,
};
/** Rim depth at a distance along the snake (eased, so the head is a gentle roll-in). */
export function snakeDepthAt(s: number) {
  const t = clamp(s / SNAKE_RUN.length);
  return SNAKE_RUN.depthStart + (SNAKE_RUN.depthEnd - SNAKE_RUN.depthStart) * (t * t * (3 - 2 * t) * .7 + t * .3);
}
export function snakeTransition(s: number): Transition {
  const depth = snakeDepthAt(s);
  return { rt: SNAKE_RUN.rt, top: Math.acos(1 - Math.min(.98, depth / SNAKE_RUN.rt)) / DEG, vert: 0 };
}
/** Distance from the centreline (round caps beyond its ends) and the arc position of the
 * nearest point. Both are continuous inside the channel. */
export function snakeNearest(u: number, v: number) {
  let best = Infinity, along = 0;
  for (const arc of SNAKE_ARCS) {
    const angle = Math.atan2(v - arc.cv, u - arc.cu), dir = Math.sign(arc.sweep), span = Math.abs(arc.sweep);
    const turned = (((angle - arc.start) * dir) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // Inside the arc's sector the nearest point is radial; otherwise it is an end point.
    const t = turned <= span ? turned : turned - span < Math.PI * 2 - turned ? span : 0;
    const q = arc.start + dir * t, pu = arc.cu + Math.cos(q) * SNAKE_RADIUS, pv = arc.cv + Math.sin(q) * SNAKE_RADIUS;
    const d = Math.hypot(u - pu, v - pv);
    if (d < best) { best = d; along = arc.offset + t * SNAKE_RADIUS; }
  }
  return { distance: best, along };
}
/** Snake-run cross-section frame at an arc position: centre, tangent and left normal. */
export function snakeFrameAt(s: number) {
  const target = clamp(s, 0, SNAKE_RUN.length);
  let arc = SNAKE_ARCS[0];
  for (const candidate of SNAKE_ARCS) if (target >= candidate.offset - 1e-9) arc = candidate;
  const dir = Math.sign(arc.sweep), q = arc.start + dir * (target - arc.offset) / SNAKE_RADIUS;
  const tu = -Math.sin(q) * dir, tv = Math.cos(q) * dir;
  return { u: arc.cu + Math.cos(q) * SNAKE_RADIUS, v: arc.cv + Math.sin(q) * SNAKE_RADIUS, tu, tv, nu: -tv, nv: tu };
}

// ---------------------------------------------------------------------------
// The big wooden halfpipe in the north-west: coping lines run north-south, the
// cross-section runs east-west, its flat bottom sits on the deck and both decks stand
// HALFPIPE_HEIGHT up. Open at both ends, so you can roll in along the flat.
export const PARK_HALFPIPE = {
  id: 'halfpipe', name: 'Big Halfpipe', u0: -18, u1: -3.6, v0: 13.6, v1: 26.3, deckWidth: 1.8,
  transition: { rt: 3.2, top: 87, vert: .5 } as Transition,
};
export const HALFPIPE_HEIGHT = transitionDepth(PARK_HALFPIPE.transition);
export const HALFPIPE_COPING = [PARK_HALFPIPE.u0 + PARK_HALFPIPE.deckWidth, PARK_HALFPIPE.u1 - PARK_HALFPIPE.deckWidth] as const;
/** Height above the deck and its slope along u at a point across the halfpipe. */
export function halfpipeProfile(u: number): { h: number; slope: number } {
  const [west, east] = HALFPIPE_COPING, H = HALFPIPE_HEIGHT, t = PARK_HALFPIPE.transition;
  if (u <= west || u >= east) return { h: H, slope: 0 };
  // Each wall is a transition measured in from its own coping.
  if (u - west < east - u) { const p = transitionAt(t, u - west); return { h: H + p.h, slope: p.slope }; }
  const p = transitionAt(t, east - u);
  return { h: H + p.h, slope: -p.slope };
}
export function insideHalfpipe(u: number, v: number) {
  const hp = PARK_HALFPIPE;
  return u >= hp.u0 && u <= hp.u1 && v >= hp.v0 && v <= hp.v1;
}
/** Stairs up the east side to the east deck: eighteen treads, then a landing. */
export const HALFPIPE_STAIRS = { u0: -3.6, u1: -1.4, foot: 16.6, top: 22, landing: 24, steps: 18 };
export function halfpipeStairHeight(u: number, v: number): number | null {
  const s = HALFPIPE_STAIRS;
  if (u < s.u0 || u > s.u1 || v < s.foot || v > s.landing) return null;
  if (v >= s.top) return HALFPIPE_HEIGHT;
  return Math.min(s.steps, Math.floor((v - s.foot) / ((s.top - s.foot) / s.steps)) + 1) * HALFPIPE_HEIGHT / s.steps;
}
/** Railings round the decks and stairs, as local segments [u0, v0, u1, v1, base height]. */
export function halfpipeRailSegments(): [number, number, number, number, number][] {
  const hp = PARK_HALFPIPE, s = HALFPIPE_STAIRS, H = HALFPIPE_HEIGHT, [west, east] = HALFPIPE_COPING;
  return [
    [hp.u0 + .05, hp.v0, hp.u0 + .05, hp.v1, H],
    [hp.u0, hp.v0 + .05, west - .15, hp.v0 + .05, H], [hp.u0, hp.v1 - .05, west - .15, hp.v1 - .05, H],
    [east + .15, hp.v0 + .05, hp.u1, hp.v0 + .05, H], [east + .15, hp.v1 - .05, hp.u1, hp.v1 - .05, H],
    [hp.u1 - .05, hp.v0, hp.u1 - .05, s.top, H], [hp.u1 - .05, s.landing, hp.u1 - .05, hp.v1, H],
    [s.u1 - .05, s.top, s.u1 - .05, s.landing, H], [s.u0, s.landing - .05, s.u1, s.landing - .05, H],
  ];
}

// ---------------------------------------------------------------------------
// Street plaza features, raised above the deck. Boxes carry grindable edges.
export type ParkBox = { id: string; name: string; u: number; v: number; length: number; width: number; yaw: number; height: number; kind: 'ledge' | 'pad' | 'platform' };
export const PARK_BOXES: readonly ParkBox[] = [
  { id: 'long-ledge', name: 'Long Ledge', u: 15.5, v: 12.5, length: 9, width: .8, yaw: 0, height: .5, kind: 'ledge' },
  { id: 'manual-pad', name: 'Manual Pad', u: 6.5, v: 12, length: 4.5, width: 2, yaw: Math.PI / 2, height: .25, kind: 'pad' },
  { id: 'low-ledge', name: 'Low Ledge', u: 6.5, v: -6, length: 6, width: .7, yaw: 0, height: .38, kind: 'ledge' },
  { id: 'platform', name: 'Stair Platform', u: 14, v: -14.5, length: 5, width: 8, yaw: 0, height: 1.2, kind: 'platform' },
];
/** Five stairs down the north face of the platform, with a handrail down the middle. */
export const PARK_STAIRS = { id: 'five-stair', name: 'Five Stair', u0: 12.5, u1: 15.5, top: -12, bottom: -10, height: 1.2, steps: 5, rail: 14 };
export function parkStairHeight(u: number, v: number): number | null {
  const s = PARK_STAIRS;
  if (u < s.u0 || u > s.u1 || v < s.top || v >= s.bottom) return null;
  const treads = s.steps - 1, k = Math.min(treads - 1, Math.floor((v - s.top) / ((s.bottom - s.top) / treads)));
  return s.height * (1 - (k + 1) / s.steps);
}
/** Flat-topped pyramid with four banked faces and a rail along its top. */
export const PARK_FUNBOX = { id: 'funbox', name: 'Funbox', u: 9, v: 1.5, base: 3.2, top: 1.4, height: .9 };
/** Banks rise east from u0 to u1; the wall bank carries on flat to the park edge. */
export type ParkBank = { id: string; name: string; u0: number; u1: number; v0: number; v1: number; height: number; topTo?: number };
export const PARK_BANKS: readonly ParkBank[] = [
  { id: 'bank', name: 'Wall Bank', u0: 17.8, u1: 20.5, v0: 6.5, v1: 16.5, height: 1.2, topTo: SKATEPARK.halfU },
  { id: 'platform-bank', name: 'Platform Bank', u0: 7, u1: 10, v0: -17, v1: -12, height: 1.2 },
];
/** A quarter pipe rising north along the north edge, with a deck behind its coping. */
export const PARK_QUARTER = { id: 'quarter', name: 'North Quarter', u0: -.5, u1: 9.5, v0: 22.3, transition: { rt: 2.4, top: 80, vert: .15 } as Transition };
export const QUARTER_TOP = PARK_QUARTER.v0 + transitionWidth(PARK_QUARTER.transition);
export const QUARTER_HEIGHT = transitionDepth(PARK_QUARTER.transition);

function boxLocal(box: ParkBox, u: number, v: number) {
  const c = Math.cos(box.yaw), s = Math.sin(box.yaw), du = u - box.u, dv = v - box.v;
  // Local x runs across the box, local y along its length.
  return { across: du * c - dv * s, along: du * s + dv * c };
}
export function insideBox(box: ParkBox, u: number, v: number, margin = 0) {
  const p = boxLocal(box, u, v);
  return Math.abs(p.across) <= box.width / 2 + margin && Math.abs(p.along) <= box.length / 2 + margin;
}

export type ParkFeature = 'deck' | 'pool' | 'snake' | 'halfpipe' | 'stairs' | 'ledge' | 'pad' | 'platform' | 'funbox' | 'bank' | 'quarter';
export type ParkSurface = { height: number; gu: number; gv: number; feature: ParkFeature; id?: string };

/** The analytic park surface at a local point (null outside the footprint). Gradients are
 * physical slopes along local u and v, so the skateboard gets exact normals on every wall. */
export function parkSurfaceLocal(u: number, v: number): ParkSurface | null {
  if (parkFootprintDistance(u, v) > 0) return null;
  const deck = SKATEPARK.deck;
  const eps = .004;
  for (const pool of PARK_POOLS) {
    const d = poolDistance(pool, u, v);
    if (d >= 0) continue;
    const t = transitionAt(pool.transition, -d);
    // Chain rule: the height follows the rim distance, whose gradient points outward.
    const gx = (poolDistance(pool, u + eps, v) - poolDistance(pool, u - eps, v)) / (2 * eps);
    const gz = (poolDistance(pool, u, v + eps) - poolDistance(pool, u, v - eps)) / (2 * eps);
    return { height: deck + t.h, gu: -t.slope * gx, gv: -t.slope * gz, feature: 'pool', id: pool.id };
  }
  {
    const near = snakeNearest(u, v), w = SNAKE_RUN.halfWidth - near.distance;
    if (w > 0) {
      const t = transitionAt(snakeTransition(near.along), w);
      // Depth changes slowly along the run; the cross-slope dominates the normal.
      const a = snakeNearest(u + eps, v), b = snakeNearest(u - eps, v), c = snakeNearest(u, v + eps), e = snakeNearest(u, v - eps);
      const h = (n: { distance: number; along: number }) => transitionAt(snakeTransition(n.along), SNAKE_RUN.halfWidth - n.distance).h;
      return { height: deck + t.h, gu: (h(a) - h(b)) / (2 * eps), gv: (h(c) - h(e)) / (2 * eps), feature: 'snake', id: SNAKE_RUN.id };
    }
  }
  if (insideHalfpipe(u, v)) { const p = halfpipeProfile(u); return { height: deck + p.h, gu: p.slope, gv: 0, feature: 'halfpipe', id: PARK_HALFPIPE.id }; }
  const climb = halfpipeStairHeight(u, v);
  if (climb !== null) return { height: deck + climb, gu: 0, gv: 0, feature: 'stairs', id: 'halfpipe-stairs' };
  for (const box of PARK_BOXES) if (insideBox(box, u, v)) return { height: deck + box.height, gu: 0, gv: 0, feature: box.kind, id: box.id };
  const step = parkStairHeight(u, v);
  if (step !== null) return { height: deck + step, gu: 0, gv: 0, feature: 'stairs', id: PARK_STAIRS.id };
  {
    const f = PARK_FUNBOX, du = u - f.u, dv = v - f.v, m = Math.max(Math.abs(du), Math.abs(dv));
    if (m < f.base) {
      const rise = clamp((f.base - m) / (f.base - f.top)), slope = m > f.top ? f.height / (f.base - f.top) : 0;
      const gu = Math.abs(du) >= Math.abs(dv) ? -Math.sign(du) * slope : 0, gv = Math.abs(dv) > Math.abs(du) ? -Math.sign(dv) * slope : 0;
      return { height: deck + f.height * rise, gu, gv, feature: 'funbox', id: f.id };
    }
  }
  for (const b of PARK_BANKS) {
    if (u >= b.u0 && u <= (b.topTo ?? b.u1) && v >= b.v0 && v <= b.v1) {
      const t = clamp((u - b.u0) / (b.u1 - b.u0));
      return { height: deck + b.height * t, gu: t < 1 ? b.height / (b.u1 - b.u0) : 0, gv: 0, feature: 'bank', id: b.id };
    }
  }
  {
    const q = PARK_QUARTER;
    if (u >= q.u0 && u <= q.u1 && v >= q.v0) {
      const w = QUARTER_TOP - v;
      const t = w <= 0 ? { h: 0, slope: 0 } : transitionAt(q.transition, w);
      // Measured from its top: the deck behind the coping is QUARTER_HEIGHT up.
      return { height: deck + QUARTER_HEIGHT + t.h, gu: 0, gv: -t.slope, feature: 'quarter', id: q.id };
    }
  }
  return { height: deck, gu: 0, gv: 0, feature: 'deck' };
}

/** Chart-space park surface, with local slopes. */
export function skateparkSurfaceAt(x: number, z: number): ParkSurface | null {
  const { u, v } = parkLocalAtChart(x, z);
  return parkSurfaceLocal(u, v);
}
/** The highest the coarse terrain may render inside the park: just under the deck mesh,
 * and well under the bowls so no terrain triangle cuts across a transition. */
export function skateparkTerrainCeiling(x: number, z: number): number | null {
  const { u, v } = parkLocalAtChart(x, z);
  if (parkFootprintDistance(u, v) > .45) return null;
  let ceiling = SKATEPARK.deck - .1;
  for (const pool of PARK_POOLS) if (poolDistance(pool, u, v) < .9) ceiling = Math.min(ceiling, SKATEPARK.deck - transitionDepth(pool.transition) - .35);
  const near = snakeNearest(u, v);
  if (near.distance < SNAKE_RUN.halfWidth + .9) ceiling = Math.min(ceiling, SKATEPARK.deck - snakeDepthAt(near.along) - .35);
  return ceiling;
}
/** Cheap chart bounds for the whole park, stairs and bluff face. */
export function nearSkatepark(x: number, z: number) { return x < -31 && x > -76 && z > -52 && z < 52; }

// ---------------------------------------------------------------------------
// Grand stairs from the west end of Main St up to the park entrance.
export const GRAND_STAIRS = {
  /** Chart x of the foot and of the top landing edge; chart z half-width. */
  foot: -26.5, top: -32, halfWidth: 3.5, count: 16,
  base: SKATEPARK.street, rise: (SKATEPARK.deck - SKATEPARK.street) / 16,
} as const;
export const GRAND_STAIR_TREAD = (GRAND_STAIRS.foot - GRAND_STAIRS.top) / GRAND_STAIRS.count;
/** Discrete treads for walking; `ramp` is the smooth line a skateboard rolls. */
export function grandStairSurfaceAt(x: number, z: number): { height: number; ramp: number; step: number } | null {
  const s = GRAND_STAIRS;
  if (x > s.foot || x < s.top || Math.abs(z) > s.halfWidth) return null;
  const along = (s.foot - x) / (s.foot - s.top);
  const step = Math.min(s.count, Math.floor(along * s.count) + 1);
  return { height: s.base + step * s.rise, ramp: s.base + s.rise * (.5 + along * (s.count - .5)), step };
}
/** Chart z of the grand-stair handrails (both sides and the middle). */
export const GRAND_STAIR_RAILS = [-3.25, 0, 3.25] as const;
export const GRAND_STAIR_RAIL_HEIGHT = .85;

// ---------------------------------------------------------------------------
// Rims and grind lines, sampled once. Pool rims come from rays about each pool's
// centre; the same points bound the deck triangulation and carry the coping.
export const POOL_RAYS = 176;
export function poolRim(pool: PoolSpec, rays = POOL_RAYS): [number, number][] {
  const rim: [number, number][] = [];
  for (let i = 0; i < rays; i++) {
    const a = i / rays * Math.PI * 2, du = Math.cos(a), dv = Math.sin(a);
    let lo = 0, hi = 14;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (poolDistance(pool, pool.center[0] + du * mid, pool.center[1] + dv * mid) < 0) lo = mid; else hi = mid; }
    rim.push([pool.center[0] + du * lo, pool.center[1] + dv * lo]);
  }
  return rim;
}
/** Distance along a ray from the pool centre to a given inside depth `w` (bisection). */
export function poolRayDistance(pool: PoolSpec, angle: number, w: number, rimDistance: number) {
  const du = Math.cos(angle), dv = Math.sin(angle);
  let lo = 0, hi = rimDistance;
  for (let k = 0; k < 36; k++) { const mid = (lo + hi) / 2; if (-poolDistance(pool, pool.center[0] + du * mid, pool.center[1] + dv * mid) > w) lo = mid; else hi = mid; }
  return lo;
}
/** Closed rim of the snake run: left edge, west cap, right edge back, east cap. */
export function snakeRim(spacing = .3): [number, number][] {
  const hw = SNAKE_RUN.halfWidth, rim: [number, number][] = [];
  const steps = Math.ceil(SNAKE_RUN.length / spacing);
  const edge = (side: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const f = snakeFrameAt(i / steps * SNAKE_RUN.length);
    return [f.u + f.nu * hw * side, f.v + f.nv * hw * side] as [number, number];
  });
  // Each cap sweeps clockwise: the west cap from the left edge round the tip, the east
  // cap from the right edge round the back of the channel.
  const cap = (s: number, fromRight: boolean) => {
    const f = snakeFrameAt(s), base = Math.atan2(f.nv, f.nu) + (fromRight ? Math.PI : 0);
    for (let k = 1; k < 12; k++) { const a = base - k / 12 * Math.PI; rim.push([f.u + Math.cos(a) * hw, f.v + Math.sin(a) * hw]); }
  };
  rim.push(...edge(1)); cap(SNAKE_RUN.length, false); rim.push(...edge(-1).reverse()); cap(0, true);
  return rim;
}

export type GrindKind = 'rail' | 'ledge' | 'coping' | 'curb' | 'bench';
export type GrindLine = { id: string; name: string; kind: GrindKind; points: Vector3[]; closed: boolean };
function localLine(points: readonly (readonly [number, number, number])[]) { return points.map(([u, v, h]) => parkPoint(u, v, h)); }
function sampleSegment(a: readonly [number, number], b: readonly [number, number], height: number, spacing = .5) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, height] as const);
}
function boxEdges(box: ParkBox): GrindLine[] {
  const c = Math.cos(box.yaw), s = Math.sin(box.yaw), h = SKATEPARK.deck + box.height;
  // Inverse of boxLocal: across along (c, -s), along along (s, c).
  const at = (across: number, along: number) => [box.u + across * c + along * s, box.v - across * s + along * c] as const;
  return [-1, 1].map(side => ({
    id: `${box.id}:${side < 0 ? 'west' : 'east'}`, name: box.name, kind: 'ledge' as const, closed: false,
    points: localLine(sampleSegment(at(side * (box.width / 2 - .02), -box.length / 2), at(side * (box.width / 2 - .02), box.length / 2), h)),
  }));
}
let grindCache: GrindLine[] | null = null;
/** Every grindable line in and around the park, in planet coordinates. */
export function skateparkGrindLines(): GrindLine[] {
  if (grindCache) return grindCache;
  const deck = SKATEPARK.deck, lines: GrindLine[] = [];
  const line = (id: string, name: string, kind: GrindKind, points: readonly (readonly [number, number, number])[], closed = false) => lines.push({ id, name, kind, closed, points: localLine(points) });
  for (const pool of PARK_POOLS) line(`${pool.id}:coping`, pool.name, 'coping', poolRim(pool, 120).map(([u, v]) => [u, v, deck + .02] as const), true);
  line('snake:coping', SNAKE_RUN.name, 'coping', snakeRim(.5).map(([u, v]) => [u, v, deck + .02] as const), true);
  for (const box of PARK_BOXES) if (box.kind !== 'platform') lines.push(...boxEdges(box));
  // The platform's free top edges: either side of the stairs, its east and its south.
  const p = PARK_STAIRS, top = deck + 1.2 + .01;
  line('platform:north-west', 'Platform Ledge', 'ledge', sampleSegment([10, -12.02], [p.u0 - .05, -12.02], top));
  line('platform:north-east', 'Platform Ledge', 'ledge', sampleSegment([p.u1 + .05, -12.02], [17.98, -12.02], top));
  line('platform:east', 'Platform Ledge', 'ledge', sampleSegment([17.98, -12.02], [17.98, -16.98], top));
  line('platform:south', 'Platform Ledge', 'ledge', sampleSegment([17.98, -16.98], [10.05, -16.98], top));
  // The five-stair handrail: flat over the platform lip, then down the nosings.
  const nose = (v: number) => p.height * (1 - (v - p.top) / (p.bottom - p.top) * (p.steps - 1) / p.steps);
  line('five-stair:rail', 'Five Stair Rail', 'rail', [[p.rail, p.top - .7, deck + p.height + .85], [p.rail, p.top, deck + p.height + .85], ...Array.from({ length: 6 }, (_, i) => {
    const v = p.top + (p.bottom - .15 - p.top) * (i + 1) / 6;
    return [p.rail, v, deck + nose(v) + .85] as const;
  })]);
  const f = PARK_FUNBOX;
  line('funbox:rail', 'Funbox Rail', 'rail', sampleSegment([f.u - f.top + .15, f.v], [f.u + f.top - .15, f.v], deck + f.height + .32));
  line('flat-bar', 'Flat Bar', 'rail', sampleSegment([2, -4.5], [7.5, -4.5], deck + .42));
  const q = PARK_QUARTER;
  line('quarter:coping', q.name, 'coping', sampleSegment([q.u0 + .1, QUARTER_TOP], [q.u1 - .1, QUARTER_TOP], deck + QUARTER_HEIGHT + .02));
  const hp = PARK_HALFPIPE, [west, east] = HALFPIPE_COPING;
  for (const [side, u] of [['west', west], ['east', east]] as const) line(`halfpipe:coping:${side}`, hp.name, 'coping', sampleSegment([u, hp.v0 + .1], [u, hp.v1 - .1], deck + HALFPIPE_HEIGHT + .03));
  // Grand-stair handrails run from the street to the park deck, in chart space.
  const s = GRAND_STAIRS;
  for (const z of GRAND_STAIR_RAILS) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = s.foot + .15 - (s.foot - s.top + .3) * i / 24, along = clamp((s.foot - x) / (s.foot - s.top));
      points.push(mapDirection(x, z).multiplyScalar(MAP_RADIUS + s.base + s.rise * (.5 + along * (s.count - .5)) + GRAND_STAIR_RAIL_HEIGHT));
    }
    lines.push({ id: `stairs:rail:${z}`, name: z === 0 ? 'Big Stair Rail' : 'Stair Handrail', kind: 'rail', closed: false, points });
  }
  grindCache = lines;
  return lines;
}

// ---------------------------------------------------------------------------
// Game of S.K.A.T.E.: five letters, each asking for a different park skill.
export type SkateLetter = { letter: 'S' | 'K' | 'A' | 'T' | 'E'; hint: string; u: number; v: number; height: number };
const SNAKE_END = snakeFrameAt(SNAKE_RUN.length);
export const SKATE_LETTERS: readonly SkateLetter[] = [
  { letter: 'S', hint: 'Ollie off the top of the funbox', u: PARK_FUNBOX.u, v: PARK_FUNBOX.v, height: SKATEPARK.deck + PARK_FUNBOX.height + 2 },
  { letter: 'K', hint: 'Big vert air in the Deep End', u: -17, v: -10, height: SKATEPARK.deck + 3 },
  { letter: 'A', hint: 'Grind the Long Ledge', u: 15.3, v: 13, height: SKATEPARK.deck + .5 + 1.2 },
  { letter: 'T', hint: 'Ride the Snake Run and air out of its pocket', u: SNAKE_END.u - SNAKE_RUN.halfWidth + .5, v: SNAKE_END.v, height: SKATEPARK.deck + 1.2 },
  { letter: 'E', hint: 'Big air on the halfpipe', u: HALFPIPE_COPING[1] - .45, v: 20, height: SKATEPARK.deck + HALFPIPE_HEIGHT + 3.4 },
];
export function skateLetterPoint(letter: SkateLetter, target = new Vector3()) { return parkPoint(letter.u, letter.v, letter.height, target); }
/** A letter is taken when the rider's body centre, this high above the board, passes
 * within the reach of it. */
export const SKATE_LETTER_BODY = .85;
export const SKATE_LETTER_REACH = 1.05;
/** Where a game of S.K.A.T.E. starts: the top of the grand stairs, facing into the park. */
export const SKATE_GAME_START = { u: SKATEPARK.halfU - 5, v: 0, facing: { u: -1, v: 0 } } as const;
export const SKATE_GAME_TIME = 120;
