/** The Sea Caves' visible rock, built from the same analytic volume the walker uses.
 *
 * A 0.4m grid samples the plan once. Floor and ceiling are dense per-cell surfaces; walls are
 * strips traced round the rock face (marching squares at the drawn offset) and pushed only
 * outward, into the rock, by a chunky wobble, so the walkable clearance never shrinks.
 * Stalactites keep their tips at least 2.6m above the floor. Lighting is designed rather than
 * simulated: the caves sit on the planet's dark side, so each face is coloured by how far a
 * visitor would walk from the ocean window and the mouth, which way it faces, and how tucked
 * into a corner it is. Rendered unlit. Pure data: built lazily by the scene, and by checks.
 */
import { Color, Vector3 } from 'three';
import { MAP_RADIUS, mapCoordinates } from './world-map';
import { SEA_CAVE_FRAME, seaCaveGradient, seaCaveLocal, seaCavePortalAt, seaCaveTerrainLocal, seaCaveWindowAt, type SeaCaveZone } from './sea-cave';
import { SEA_CAVE_ARENA, SEA_CAVE_CHAMBERS, SEA_CAVE_MOUTH, SEA_CAVE_WALL_OFFSET, SEA_CAVE_WINDOW } from './sea-cave-layout';
import { groundSurfaceAt } from './town-surfaces';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (a: number, b: number, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

/** Grid over the plan (local metres). */
const GRID = { minU: -12, maxU: 28, minV: -2, maxV: 48, step: .4 } as const;
const COLS = Math.round((GRID.maxU - GRID.minU) / GRID.step) + 1, ROWS = Math.round((GRID.maxV - GRID.minV) / GRID.step) + 1;
const gu = (i: number) => GRID.minU + i * GRID.step, gv = (j: number) => GRID.minV + j * GRID.step;
const FACE = SEA_CAVE_WALL_OFFSET;

/** Where the walls and ceiling may meet daylight and must be trimmed to what is buried. */
function nearOpening(u: number, v: number) {
  const portal = seaCavePortalAt(u, v), face = seaCaveWindowAt(u, v);
  return (portal.s < 4.5 && Math.abs(portal.lateral) < 5) || (face.out > -3 && Math.abs(face.across) < SEA_CAVE_WINDOW.halfWidth + 3);
}
const inMouthApron = (u: number, v: number) => seaCavePortalAt(u, v).s < -.05;
/** Wall faces across the window's aperture are left open. */
function inWindowAperture(u: number, v: number) {
  const face = seaCaveWindowAt(u, v);
  return face.out > -.75 && Math.abs(face.across) < SEA_CAVE_WINDOW.halfWidth - .15;
}

const PALETTE = {
  wall: new Color('#7C857E'), wallWarm: new Color('#8A8676'), wallDark: new Color('#6C7570'), ceiling: new Color('#6A726C'),
  sand: new Color('#C7B48D'), damp: new Color('#8F8F82'), tunnel: new Color('#B5A27E'), pool: new Color('#3F6F72'),
  windowTint: new Color('#D5E9F0'), mouthTint: new Color('#EFE6D6'),
};
/** Overall brightness of the baked light before tone mapping. */
const CAVE_EXPOSURE = .9;

export type SeaCaveMesh = {
  /** Opaque rock: non-indexed triangles with flat, baked colours. */
  rock: { positions: Float32Array; colors: Float32Array };
  /** Additive light shafts from the window: RGBA colours. */
  shafts: { positions: Float32Array; colors: Float32Array };
  stats: { rockTriangles: number; shaftTriangles: number; stalactites: number; boulders: number };
};

export function buildSeaCaveMesh(): SeaCaveMesh {
  // --- Sample the volume once. ----------------------------------------------------------
  const sdf = new Float32Array(COLS * ROWS), floor = new Float32Array(COLS * ROWS), ceiling = new Float32Array(COLS * ROWS);
  const zone: SeaCaveZone[] = new Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const s = seaCaveLocal(gu(i), gv(j)), k = j * COLS + i;
    sdf[k] = s.sdf; floor[k] = s.floor; ceiling[k] = s.ceiling; zone[k] = s.zone;
  }

  // --- Walking distance from the window and from the mouth (Dijkstra on the grid). ----
  const distanceFrom = (seed: (u: number, v: number) => boolean) => {
    const distance = new Float32Array(COLS * ROWS).fill(Infinity), open: number[] = [];
    for (let k = 0; k < distance.length; k++) {
      if (sdf[k] > FACE + .3) continue;
      if (seed(gu(k % COLS), gv(Math.floor(k / COLS)))) { distance[k] = 0; open.push(k); }
    }
    // Small grids: a bucketed sweep is plenty (8-connected, repeated relaxation).
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let frontier = open;
    while (frontier.length) {
      const next: number[] = [];
      for (const k of frontier) {
        const i = k % COLS, j = Math.floor(k / COLS);
        for (const [di, dj, cost] of steps) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
          const n = nj * COLS + ni;
          if (sdf[n] > FACE + .3) continue;
          const d = distance[k] + cost * GRID.step;
          if (d < distance[n] - 1e-6) { distance[n] = d; next.push(n); }
        }
      }
      frontier = next;
    }
    return distance;
  };
  const fromWindow = distanceFrom((u, v) => { const f = seaCaveWindowAt(u, v); return f.out > -1.4 && Math.abs(f.across) < SEA_CAVE_WINDOW.halfWidth; });
  const fromMouth = distanceFrom((u, v) => { const p = seaCavePortalAt(u, v); return p.s < .6 && p.s > -1.5 && Math.abs(p.lateral) < 2; });
  const sampleGrid = (grid: Float32Array, u: number, v: number) => {
    const x = clamp((u - GRID.minU) / GRID.step, 0, COLS - 1.001), y = clamp((v - GRID.minV) / GRID.step, 0, ROWS - 1.001);
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, at = (a: number, b: number) => grid[b * COLS + a];
    const values = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)], weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let sum = 0, weight = 0;
    for (let q = 0; q < 4; q++) if (Number.isFinite(values[q])) { sum += values[q] * weights[q]; weight += weights[q]; }
    return weight > 0 ? sum / weight : 60;
  };

  // --- Baked light. ---------------------------------------------------------------------
  const windowCenter = SEA_CAVE_WINDOW.center, mouthCenter = SEA_CAVE_MOUTH.center;
  const color = new Color(), tint = new Color();
  type Kind = 'floor' | 'ceiling' | 'wall' | 'rock';
  const strata = new Color();
  /** Wall stone: gently tilted horizontal bands, blended so they never form blocks. */
  const stratumColor = (u: number, v: number, h: number) => {
    const band = Math.sin(h * 2.3 + .35 * Math.sin(u * .45 + v * .32) + .2 * u) + .35 * Math.sin(h * 5.1 + v * .6);
    strata.copy(PALETTE.wall).lerp(PALETTE.wallWarm, smooth(.2, 1.1, band)).lerp(PALETTE.wallDark, smooth(-.4, -1.2, band));
    return strata;
  };
  /** Colour of a face from its centroid (local u, v, elevation), plan normal and kind. */
  function shade(u: number, v: number, h: number, ne: number, nn: number, nu: number, kind: Kind, base: Color, out: number[]) {
    if (kind === 'wall') base = stratumColor(u, v, h);
    const dw = sampleGrid(fromWindow, u, v), dm = sampleGrid(fromMouth, u, v);
    const tw = Math.hypot(windowCenter[0] - u, windowCenter[1] - v) || 1, tm = Math.hypot(mouthCenter[0] - u, mouthCenter[1] - v) || 1;
    const facingWindow = (ne * (windowCenter[0] - u) + nn * (windowCenter[1] - v)) / tw;
    const facingMouth = (ne * (mouthCenter[0] - u) + nn * (mouthCenter[1] - v)) / tm;
    const spreadW = kind === 'floor' ? .62 + .18 * smooth(1.5, 7, dw) : kind === 'ceiling' ? .5 + .25 * smooth(8, 0, dw) : .42 + .58 * Math.max(0, facingWindow) + .12 * Math.max(0, nu);
    const spreadM = kind === 'floor' ? .85 : kind === 'ceiling' ? .35 : .38 + .62 * Math.max(0, facingMouth);
    const window = 1.02 * Math.exp(-dw / 11) * spreadW, mouth = .85 * Math.exp(-dm / 6.5) * spreadM;
    const corner = seaCaveLocal(u, v).sdf;
    const ao = kind === 'wall' || kind === 'rock' ? .78 + .22 * smooth(.2, 1.4, h - sampleGrid(floor, u, v)) : .72 + .28 * smooth(.1, 1.6, -corner);
    const light = (.3 + window + mouth) * ao * CAVE_EXPOSURE;
    tint.copy(PALETTE.mouthTint).lerp(PALETTE.windowTint, clamp(window / Math.max(1e-3, window + mouth)));
    color.copy(base).multiply(tint).multiplyScalar(Math.min(1.12, light));
    out.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  }

  // --- Geometry assembly. ----------------------------------------------------------------
  const positions: number[] = [], colors: number[] = [];
  const scratch = [new Vector3(), new Vector3(), new Vector3()];
  const terrainAt = (u: number, v: number) => { const c = SEA_CAVE_FRAME.chart(u, v); return groundSurfaceAt(c.x, c.z).height; };
  const buriedCache = new Map<string, number>();
  /** Signed metres of a local point above the terrain (negative = buried in rock). */
  const aboveGround = (u: number, v: number, h: number) => {
    const key = `${Math.round(u * 20)},${Math.round(v * 20)}`;
    let top = buriedCache.get(key);
    if (top === undefined) { top = seaCaveTerrainLocal(u, v, terrainAt(u, v)); buriedCache.set(key, top); }
    return h - top;
  };
  type P = [u: number, v: number, h: number];
  /** Emit a local-space triangle, trimmed to what is buried near the openings. */
  const emit = (a: P, b: P, c: P, kind: Kind, base: Color, clip = false) => {
    let polygons: P[][] = [[a, b, c]];
    if (clip) {
      const signed = (p: P) => aboveGround(p[0], p[1], p[2]) - .02;
      const kept: P[] = [], poly = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = poly[i], q = poly[(i + 1) % 3], sp = signed(p), sq = signed(q);
        if (sp <= 0) kept.push(p);
        if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { const t = sp / (sp - sq); kept.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
      }
      polygons = kept.length >= 3 ? [kept] : [];
    }
    for (const polygon of polygons) for (let i = 1; i < polygon.length - 1; i++) {
      const tri = [polygon[0], polygon[i], polygon[i + 1]];
      tri.forEach((p, n) => SEA_CAVE_FRAME.point(p[0], p[1], p[2], scratch[n]));
      const normal = scratch[1].clone().sub(scratch[0]).cross(scratch[2].clone().sub(scratch[0]));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      for (const p of scratch) positions.push(p.x, p.y, p.z);
      const cu = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cv = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, ch = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
      const t = SEA_CAVE_FRAME.tangents(cu, cv);
      shade(cu, cv, ch, normal.dot(t.east), normal.dot(t.north), normal.dot(t.up), kind, base, colors);
    }
  };

  const floorBase = (z: SeaCaveZone) => z === 'tunnel' ? PALETTE.tunnel : z === 'grotto' || z === 'window' || z === 'tidepool' ? PALETTE.sand : PALETTE.damp;
  /** Chunky outward-only relief: metres into the rock at a local point. */
  const relief = (u: number, v: number, h: number, amount: number) => amount * clamp(.5 + .5 * (Math.sin(1.7 * u + .9 * h + 1.3) * Math.cos(1.3 * v - 1.1 * h) + .5 * Math.sin(3.1 * u - 2.3 * v + 2.7 * h)));

  // Floor and ceiling over every cell that touches the drawn rock face.
  const tidepool = SEA_CAVE_CHAMBERS.find(chamber => chamber.id === 'tidepool')!;
  for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
    const ks = [j * COLS + i, j * COLS + i + 1, (j + 1) * COLS + i + 1, (j + 1) * COLS + i];
    if (Math.min(...ks.map(k => sdf[k])) > FACE + .2) continue;
    const cu = gu(i) + GRID.step / 2, cv = gv(j) + GRID.step / 2;
    // In the open apron the beach is the floor; the cave floor only fills where the cut
    // removed the cape's face, so the two never fight.
    const apron = inMouthApron(cu, cv);
    if (apron && aboveGround(cu, cv, floor[ks[0]]) > -.1) continue;
    const corners: [number, number][] = [[gu(i), gv(j)], [gu(i + 1), gv(j)], [gu(i + 1), gv(j + 1)], [gu(i), gv(j + 1)]];
    const z = zone[ks[0]];
    const fl = corners.map(([u, v], n) => [u, v, floor[ks[n]]] as P);
    const base = floorBase(z);
    emit(fl[0], fl[1], fl[2], 'floor', base); emit(fl[0], fl[2], fl[3], 'floor', base);
    const near = nearOpening(cu, cv) || apron;
    const cl = corners.map(([u, v], n) => [u, v, ceiling[ks[n]] + relief(u, v, 0, .35)] as P);
    emit(cl[0], cl[2], cl[1], 'ceiling', PALETTE.ceiling, near); emit(cl[0], cl[3], cl[2], 'ceiling', PALETTE.ceiling, near);
  }

  // The tide pool: a still, smooth-edged pool lying on the chamber floor.
  {
    const [pu, pv] = tidepool.center, ra = tidepool.radii[0] * .55, rb = tidepool.radii[1] * .5, sides = 28;
    const ring = Array.from({ length: sides }, (_, n) => {
      const a = n / sides * Math.PI * 2, wobble = 1 + .08 * Math.sin(a * 3 + 1.2) + .05 * Math.sin(a * 5);
      const u = pu + Math.cos(a) * ra * wobble, v = pv + Math.sin(a) * rb * wobble;
      return [u, v, seaCaveLocal(u, v).floor + .02] as P;
    });
    const middle: P = [pu, pv, seaCaveLocal(pu, pv).floor + .02];
    for (let n = 0; n < sides; n++) emit(middle, ring[n], ring[(n + 1) % sides], 'floor', PALETTE.pool);
  }

  // Walls: trace the rock face, then stack bands from below the floor to above the ceiling.
  const segments: [[number, number], [number, number]][] = [];
  for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
    const a = sdf[j * COLS + i] - FACE, b = sdf[j * COLS + i + 1] - FACE, c = sdf[(j + 1) * COLS + i + 1] - FACE, d = sdf[(j + 1) * COLS + i] - FACE;
    const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const t = (p: number, q: number) => p / (p - q);
    const top: [number, number] = [gu(i) + t(a, b) * GRID.step, gv(j)], right: [number, number] = [gu(i + 1), gv(j) + t(b, c) * GRID.step];
    const bottom: [number, number] = [gu(i) + t(d, c) * GRID.step, gv(j + 1)], left: [number, number] = [gu(i), gv(j) + t(a, d) * GRID.step];
    const cases: Record<number, [[number, number], [number, number]][]> = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]],
      8: [[left, top]], 9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
    };
    for (const segment of cases[idx]) segments.push(segment);
  }
  for (const [p, q] of segments) {
    const mu = (p[0] + q[0]) / 2, mv = (p[1] + q[1]) / 2;
    if (inWindowAperture(mu, mv)) continue;
    const near = nearOpening(mu, mv) || inMouthApron(mu, mv);
    const ends = [p, q].map(([u, v]) => {
      const s = seaCaveLocal(u, v), g = seaCaveGradient(u, v);
      return { u, v, g, bottom: s.floor - .3, top: s.ceiling + .35 };
    });
    const bands = Math.max(2, Math.ceil(Math.max(ends[0].top - ends[0].bottom, ends[1].top - ends[1].bottom) / 1.05));
    const ring = (end: typeof ends[number], k: number): P => {
      const h = end.bottom + (end.top - end.bottom) * k / bands, push = k === 0 || k === bands ? .02 : relief(end.u, end.v, h, .3);
      return [end.u + end.g.u * push, end.v + end.g.v * push, h];
    };
    for (let k = 0; k < bands; k++) {
      const a0 = ring(ends[0], k), a1 = ring(ends[0], k + 1), b0 = ring(ends[1], k), b1 = ring(ends[1], k + 1);
      const base = PALETTE.wall;
      // Inward faces: the plan gradient points into the rock, so wind to face against it.
      const cross = (q[0] - p[0]) * ends[0].g.v - (q[1] - p[1]) * ends[0].g.u;
      if (cross > 0) { emit(a0, b0, b1, 'wall', base, near); emit(a0, b1, a1, 'wall', base, near); }
      else { emit(a0, b1, b0, 'wall', base, near); emit(a0, a1, b1, 'wall', base, near); }
    }
  }

  // --- Formations. ------------------------------------------------------------------------
  /** A low-poly rock: a jittered icosahedron squashed by `scale` and sunk into its seat. */
  const ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(x => x / l); });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v, f };
  })();
  let boulders = 0, stalactites = 0;
  const rock = (u: number, v: number, h: number, size: [number, number, number], seed: number, base: Color) => {
    const yaw = hash(seed, 1) * Math.PI * 2, c = Math.cos(yaw), s = Math.sin(yaw);
    const points = ICO.v.map(([x, y, z], n) => {
      const jitter = .82 + .32 * hash(seed, n);
      const lx = x * size[0] * jitter, lz = z * size[2] * jitter;
      return [u + lx * c - lz * s, v + lx * s + lz * c, h + y * size[1] * jitter] as P;
    });
    for (const [a, b, d] of ICO.f) emit(points[a], points[d], points[b], 'rock', base);
    boulders++;
  };
  const cone = (u: number, v: number, root: number, tip: number, radius: number, seed: number) => {
    const sides = 5, ringPoints: P[] = [];
    for (let n = 0; n < sides; n++) {
      const a = (n + hash(seed, n) * .4) / sides * Math.PI * 2, r = radius * (.8 + .3 * hash(seed, n + 9));
      ringPoints.push([u + Math.cos(a) * r, v + Math.sin(a) * r, root]);
    }
    const apex: P = [u + (hash(seed, 3) - .5) * radius * .4, v + (hash(seed, 4) - .5) * radius * .4, tip];
    for (let n = 0; n < sides; n++) {
      const a = ringPoints[n], b = ringPoints[(n + 1) % sides];
      // Outward faces: a hanging cone winds the other way round from a standing one.
      if (tip < root) emit(a, apex, b, 'rock', PALETTE.ceiling); else emit(a, b, apex, 'rock', PALETTE.wall);
    }
    stalactites++;
  };
  // Stalactites hang where the roof is high; tips stay 2.6m clear of the floor.
  for (let j = 1; j < ROWS - 1; j += 2) for (let i = 1; i < COLS - 1; i += 2) {
    const k = j * COLS + i, clear = ceiling[k] - floor[k];
    if (sdf[k] > -.4 || clear < 3.4) continue;
    const u = gu(i) + (hash(i, j, 1) - .5) * .6, v = gv(j) + (hash(i, j, 2) - .5) * .6;
    const density = zone[k] === 'grotto' || zone[k] === 'slot' || zone[k] === 'tidepool' ? .2 : .07;
    if (hash(i, j, 3) > density || nearOpening(u, v)) continue;
    // Measured where it actually hangs, after the jitter (arched roofs fall toward the walls).
    const here = seaCaveLocal(u, v), length = Math.min(here.ceiling - here.floor - 2.7, .5 + 1.4 * hash(i, j, 4));
    if (length < .3) continue;
    cone(u, v, here.ceiling + .25, here.ceiling - length, .14 + .2 * hash(i, j, 5), i * 1000 + j);
  }
  // Boulders tucked against the chamber walls, never inside the walkable floor or the arena.
  for (let j = 1; j < ROWS - 1; j++) for (let i = 1; i < COLS - 1; i++) {
    const k = j * COLS + i;
    // Half-buried in the wall: no part reaches the walkable floor (sdf < 0).
    if (sdf[k] < FACE + .2 || sdf[k] > FACE + .75 || hash(i, j, 7) > .07) continue;
    const z = zone[k];
    if (z !== 'grotto' && z !== 'tidepool' && z !== 'undercroft' && z !== 'window') continue;
    const u = gu(i), v = gv(j);
    if (Math.hypot(u - SEA_CAVE_ARENA.center[0], v - SEA_CAVE_ARENA.center[1]) < SEA_CAVE_ARENA.radius + .8 || inWindowAperture(u, v)) continue;
    const size = Math.min((sdf[k] - .2) / 1.45, .3 + .45 * hash(i, j, 8));
    if (size < .22) continue;
    rock(u, v, floor[k] + size * .25, [size * 1.2, size * .8, size], i * 7 + j * 13, hash(i, j, 9) > .5 ? PALETTE.wallWarm : PALETTE.wall);
  }
  // The window lip: a row of rounded rocks on the ledge edge, with the drop beyond.
  {
    const w = SEA_CAVE_WINDOW, l = Math.hypot(w.outward[0], w.outward[1]), ou = w.outward[0] / l, ov = w.outward[1] / l;
    for (let across = -w.halfWidth + .45, n = 0; across <= w.halfWidth - .45; across += .78, n++) {
      // On the ledge's very edge, clear of the walkable floor behind it.
      const out = .04 + (hash(n, 2) - .5) * .1;
      const u = w.center[0] - ov * across + ou * out, v = w.center[1] + ou * across + ov * out;
      const size = .28 + .14 * hash(n, 5);
      rock(u, v, w.sill + size * .35, [size * 1.25, size * (.9 + .5 * hash(n, 6)), size], 500 + n, PALETTE.wallWarm);
    }
  }

  // --- Light shafts through the window (additive, drawn separately). ---------------------
  const shaftPositions: number[] = [], shaftColors: number[] = [];
  {
    const w = SEA_CAVE_WINDOW, l = Math.hypot(w.outward[0], w.outward[1]), ou = w.outward[0] / l, ov = w.outward[1] / l;
    const beams = [[-3.6, 1.9, 14, .055], [-.6, 2.4, 17, .07], [2.6, 1.7, 13, .05], [4.6, 1.2, 10, .04]];
    for (const [across, width, reach, strength] of beams) {
      const at = (along: number, side: number, h: number) => {
        const u = w.center[0] - ov * (across + side) - ou * along, v = w.center[1] + ou * (across + side) - ov * along;
        return SEA_CAVE_FRAME.point(u, v, h);
      };
      // Beams fall gently inward from the window's upper half toward the Grotto floor. They
      // start inside the reveal and fade in, so from the sea they never read as panels.
      const station = (t: number) => {
        const along = 1.5 + (reach - 1.5) * t, spread = .5 + .4 * t, h = w.lintel - 1 - (w.lintel - 2.4) * t;
        return [at(along, -width * spread, h + .2), at(along, width * spread, h - .2)];
      };
      const stations = [0, .25, 1].map(station), glow = [0, strength, 0];
      for (let k = 0; k < 2; k++) {
        const [a, b] = stations[k], [c, d] = stations[k + 1];
        for (const [p, g] of [[a, glow[k]], [b, glow[k]], [d, glow[k + 1]], [a, glow[k]], [d, glow[k + 1]], [c, glow[k + 1]]] as const) {
          shaftPositions.push(p.x, p.y, p.z); shaftColors.push(g * .86, g * .96, g, 1);
        }
      }
    }
  }

  return {
    rock: { positions: new Float32Array(positions), colors: new Float32Array(colors) },
    shafts: { positions: new Float32Array(shaftPositions), colors: new Float32Array(shaftColors) },
    stats: { rockTriangles: positions.length / 9, shaftTriangles: shaftPositions.length / 9, stalactites, boulders },
  };
}

/** World position of a local point, for scenes placing lights and props in the caves. */
export const seaCaveWorld = (u: number, v: number, h: number) => SEA_CAVE_FRAME.point(u, v, h);
export const seaCaveChart = (u: number, v: number) => mapCoordinates(SEA_CAVE_FRAME.direction(u, v));
export const SEA_CAVE_RADIUS = MAP_RADIUS;
