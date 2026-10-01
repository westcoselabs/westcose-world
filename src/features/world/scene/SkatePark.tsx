'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  HALFPIPE_COPING, HALFPIPE_HEIGHT, HALFPIPE_STAIRS, PARK_BANKS, PARK_BOXES, PARK_FUNBOX, PARK_HALFPIPE, PARK_POOLS, PARK_QUARTER, PARK_STAIRS,
  QUARTER_HEIGHT, QUARTER_TOP, SKATEPARK, SNAKE_RUN, halfpipeRailSegments, parkEastEdge, parkFootprintOutline, parkLocal, parkPoint, parkSurfaceLocal, parkTangents,
  poolRayDistance, poolRim, skateparkGrindLines, snakeFrameAt, snakeRim, snakeTransition, transitionAt, transitionWidth,
  type ParkBank, type ParkBox, type PoolSpec, type Transition,
} from '../data/skatepark-layout';
import { parkFenceSegments } from '../data/concept-landmarks';
import { westBluffDistance } from '../data/island-terrain';
import { MAP_RADIUS, mapCoordinates } from '../data/world-map';
import { MeshBuilder, tint } from './meshBuilder';
import { block, createKitContext, physicalSign, tube, type KitContext } from './kit/context';
import { SignAtlas } from './kit/SignAtlas';
import { TOWN_PALETTE as P } from './kit/materials';

const DEG = Math.PI / 180;
const DECK = '#C8C4B7', POOL = '#BEBAAE', POOL_DEEP = '#ADA99D', TILE = '#5C7D87', COPING = '#E0DCD1', SEAM = '#ADA99D';
const RAMP = '#BCB7AA', RAMP_TOP = '#CBC6B9', EDGE = '#6F7C7B', RAIL_COLOR = '#7B8887', FENCE = '#4C5A57', STEEL = '#8E9A99';
const PLY = '#C9A36C', PLY_FLAT = '#BE9862', DECK_BOARD = '#A97F51', FRAME = '#7A5A38';
const TRUNK = '#8B7358', FROND = '#5E7F4E', FROND_LIGHT = '#77965E';
const RAIL = new THREE.CylinderGeometry(1, 1, 1, 7);
const deckTop = SKATEPARK.deck;

/** World normal of the analytic park surface, nudged inward off a rim. */
function surfaceNormal(u: number, v: number, nudgeU = 0, nudgeV = 0) {
  const s = parkSurfaceLocal(u + nudgeU, v + nudgeV) ?? { gu: 0, gv: 0 };
  const t = parkTangents(u, v);
  return t.up.addScaledVector(t.east, -s.gu).addScaledVector(t.north, -s.gv).normalize();
}

/** Ring depths down a transition: dense where its slope changes fastest. */
function transitionLevels(t: Transition, steps = 16) {
  const top = t.top * DEG, wv = t.vert > 0 ? t.vert / Math.tan(top) : 0, levels = [0];
  if (wv > 0) levels.push(wv);
  for (let k = 1; k <= steps; k++) { const phi = top * (1 - k / steps); levels.push(wv + t.rt * Math.sin(top) - t.rt * Math.sin(phi)); }
  return levels;
}
function poolColor(depthBelowDeck: number, seed: number) {
  if (depthBelowDeck < .32) return tint(TILE, seed, .04);
  return tint(depthBelowDeck > 2.2 ? POOL_DEEP : POOL, seed, .025);
}

function deck(mesh: MeshBuilder) {
  const outer = parkFootprintOutline(0, .8).map(([u, v]) => new THREE.Vector2(u, v));
  const holes = [...PARK_POOLS.map(pool => poolRim(pool)), snakeRim(.3)].map(rim => rim.map(([u, v]) => new THREE.Vector2(u, v)));
  const all = [...outer, ...holes.flat()];
  const emit = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number) => {
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a), longest = Math.max(ab, bc, ca);
    if (longest > 2.2 && depth < 10) {
      // Bisect the longest edge so large earcut triangles follow the planet.
      if (longest === ab) { const m = a.clone().add(b).multiplyScalar(.5); emit(a, m, c, depth + 1); emit(m, b, c, depth + 1); }
      else if (longest === bc) { const m = b.clone().add(c).multiplyScalar(.5); emit(a, b, m, depth + 1); emit(a, m, c, depth + 1); }
      else { const m = c.clone().add(a).multiplyScalar(.5); emit(a, b, m, depth + 1); emit(m, b, c, depth + 1); }
      return;
    }
    const cu = (a.x + b.x + c.x) / 3, cv = (a.y + b.y + c.y) / 3;
    mesh.triangle(parkPoint(a.x, a.y, deckTop + .012), parkPoint(b.x, b.y, deckTop + .012), parkPoint(c.x, c.y, deckTop + .012), DECK, parkPoint(cu, cv, 1).normalize());
  };
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) emit(all[a], all[b], all[c], 0);
  // A short skirt down to the lawn at the outer edge.
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], mid = a.clone().add(b).multiplyScalar(.5);
    const out = parkTangents(mid.x, mid.y), dir = new THREE.Vector3().addScaledVector(out.east, mid.x).addScaledVector(out.north, mid.y);
    mesh.quad(parkPoint(a.x, a.y, deckTop - .2), parkPoint(b.x, b.y, deckTop - .2), parkPoint(b.x, b.y, deckTop + .012), parkPoint(a.x, a.y, deckTop + .012), '#A9A597', dir);
  }
}

/** Expansion joints scored into the open deck every four metres. */
function seams(mesh: MeshBuilder) {
  const { halfU, halfV } = SKATEPARK, half = .035, piece = .5, h = deckTop + .017;
  const open = (u: number, v: number) => parkSurfaceLocal(u, v)?.feature === 'deck';
  for (let u = -halfU + 4; u < halfU; u += 4) for (let v = -halfV; v < halfV; v += piece) {
    if (!open(u, v + piece / 2) || !open(u, v) || !open(u, v + piece)) continue;
    mesh.quad(parkPoint(u - half, v, h), parkPoint(u + half, v, h), parkPoint(u + half, v + piece, h), parkPoint(u - half, v + piece, h), SEAM, parkPoint(u, v, 1).normalize());
  }
  for (let v = -halfV + 4; v < halfV; v += 4) for (let u = -halfU; u < halfU; u += piece) {
    if (!open(u + piece / 2, v) || !open(u, v) || !open(u + piece, v)) continue;
    mesh.quad(parkPoint(u, v - half, h), parkPoint(u + piece, v - half, h), parkPoint(u + piece, v + half, h), parkPoint(u, v + half, h), SEAM, parkPoint(u, v, 1).normalize());
  }
}

function pool(mesh: MeshBuilder, spec: PoolSpec) {
  const t = spec.transition, levels = transitionLevels(t), rim = poolRim(spec), rays = rim.length;
  const [cu, cv] = spec.center;
  const rings: { p: THREE.Vector3; n: THREE.Vector3; depth: number }[][] = [];
  for (let i = 0; i < rays; i++) {
    const a = i / rays * Math.PI * 2, du = Math.cos(a), dv = Math.sin(a), R = Math.hypot(rim[i][0] - cu, rim[i][1] - cv);
    rings.push(levels.map((w, k) => {
      const r = k === 0 ? R : poolRayDistance(spec, a, w, R), u = cu + du * r, v = cv + dv * r, h = transitionAt(t, w).h;
      return { p: parkPoint(u, v, deckTop + h + .004), n: surfaceNormal(u, v, -du * .003, -dv * .003), depth: -h };
    }));
  }
  const bottom = parkPoint(cu, cv, deckTop + transitionAt(t, 1e3).h + .004);
  const bottomNormal = parkTangents(cu, cv).up;
  for (let i = 0; i < rays; i++) {
    const A = rings[i], B = rings[(i + 1) % rays];
    for (let k = 0; k < levels.length - 1; k++) {
      const color = poolColor((A[k].depth + A[k + 1].depth) / 2, i * 7 + k);
      mesh.triangle(A[k].p, B[k].p, B[k + 1].p, color, A[k].n, [A[k].n, B[k].n, B[k + 1].n]);
      mesh.triangle(A[k].p, B[k + 1].p, A[k + 1].p, color, A[k].n, [A[k].n, B[k + 1].n, A[k + 1].n]);
    }
    const last = levels.length - 1;
    mesh.triangle(bottom, A[last].p, B[last].p, tint(POOL_DEEP, i, .02), bottomNormal);
  }
}

function snake(mesh: MeshBuilder) {
  const hw = SNAKE_RUN.halfWidth, L = SNAKE_RUN.length, steps = Math.ceil(L / .3), K = 14;
  // Each cross-section: left wall from the rim down, then the right wall back up.
  const section = (s: number) => {
    const f = snakeFrameAt(s), tr = snakeTransition(s), W = transitionWidth(tr), top = tr.top * DEG;
    const wall = Array.from({ length: K + 1 }, (_, k) => Math.min(W, tr.rt * Math.sin(top) - tr.rt * Math.sin(top * (1 - k / K))));
    const lateral = [...wall.map(w => hw - w), ...wall.slice().reverse().map(w => -(hw - w))];
    const widths = [...wall, ...wall.slice().reverse()];
    return lateral.map((d, i) => {
      const u = f.u + f.nu * d, v = f.v + f.nv * d, h = transitionAt(tr, widths[i]).h;
      return { p: parkPoint(u, v, deckTop + h + .004), n: surfaceNormal(u, v, -f.nu * Math.sign(d) * .003, -f.nv * Math.sign(d) * .003), depth: -h };
    });
  };
  const sections = Array.from({ length: steps + 1 }, (_, j) => section(j / steps * L));
  for (let j = 0; j < steps; j++) {
    const A = sections[j], B = sections[j + 1];
    for (let k = 0; k < A.length - 1; k++) {
      const color = poolColor((A[k].depth + A[k + 1].depth) / 2, j * 3 + k);
      mesh.triangle(A[k].p, B[k].p, B[k + 1].p, color, A[k].n, [A[k].n, B[k].n, B[k + 1].n]);
      mesh.triangle(A[k].p, B[k + 1].p, A[k + 1].p, color, A[k].n, [A[k].n, B[k + 1].n, A[k + 1].n]);
    }
  }
  // Rounded end caps: half bowls swept round the tip, matching the rim the deck is cut to.
  for (const end of [0, L]) {
    const f = snakeFrameAt(end), tr = snakeTransition(end), W = transitionWidth(tr), top = tr.top * DEG;
    const base = Math.atan2(f.nv, f.nu) + (end === 0 ? Math.PI : 0), arcs = 12;
    const radii = Array.from({ length: K + 1 }, (_, k) => hw - Math.min(W, tr.rt * Math.sin(top) - tr.rt * Math.sin(top * (1 - k / K))));
    const ring = (m: number) => radii.map(r => {
      const q = base - m / arcs * Math.PI, u = f.u + Math.cos(q) * r, v = f.v + Math.sin(q) * r, h = transitionAt(tr, hw - r).h;
      return { p: parkPoint(u, v, deckTop + h + .004), n: surfaceNormal(u, v, -Math.cos(q) * .003, -Math.sin(q) * .003), depth: -h };
    });
    const center = parkPoint(f.u, f.v, deckTop + transitionAt(tr, W + 1).h + .004);
    for (let m = 0; m < arcs; m++) {
      const A = ring(m), B = ring(m + 1);
      for (let k = 0; k < K; k++) {
        const color = poolColor((A[k].depth + A[k + 1].depth) / 2, m * 5 + k);
        mesh.triangle(A[k].p, B[k].p, B[k + 1].p, color, A[k].n, [A[k].n, B[k].n, B[k + 1].n]);
        mesh.triangle(A[k].p, B[k + 1].p, A[k + 1].p, color, A[k].n, [A[k].n, B[k + 1].n, A[k + 1].n]);
      }
      mesh.triangle(center, A[K].p, B[K].p, POOL_DEEP, parkTangents(f.u, f.v).up);
    }
  }
}

function localQuad(mesh: MeshBuilder, corners: readonly (readonly [number, number, number])[], color: string | THREE.Color, outward: THREE.Vector3) {
  const [a, b, c, d] = corners.map(([u, v, h]) => parkPoint(u, v, h));
  mesh.quad(a, b, c, d, color, outward);
}
function localDir(u: number, v: number, du: number, dv: number, dh = 0) {
  const t = parkTangents(u, v);
  return new THREE.Vector3().addScaledVector(t.east, du).addScaledVector(t.north, dv).addScaledVector(t.up, dh);
}

function box(mesh: MeshBuilder, spec: ParkBox) {
  const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw), hx = spec.width / 2, hy = spec.length / 2, top = deckTop + spec.height;
  const at = (across: number, along: number) => [spec.u + across * c + along * s, spec.v - across * s + along * c] as const;
  const corners = [at(-hx, -hy), at(hx, -hy), at(hx, hy), at(-hx, hy)];
  localQuad(mesh, corners.map(([u, v]) => [u, v, top] as const), spec.kind === 'ledge' ? '#C3BEB1' : RAMP_TOP, localDir(spec.u, spec.v, 0, 0, 1));
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4], mu = (u0 + u1) / 2 - spec.u, mv = (v0 + v1) / 2 - spec.v;
    localQuad(mesh, [[u0, v0, deckTop], [u1, v1, deckTop], [u1, v1, top], [u0, v0, top]], RAMP, localDir(spec.u, spec.v, mu, mv));
  }
}

function funbox(mesh: MeshBuilder) {
  const f = PARK_FUNBOX, top = deckTop + f.height;
  const sq = (r: number, h: number) => [[f.u + r, f.v + r, h], [f.u - r, f.v + r, h], [f.u - r, f.v - r, h], [f.u + r, f.v - r, h]] as const;
  const low = sq(f.base, deckTop + .012), high = sq(f.top, top);
  localQuad(mesh, high, RAMP_TOP, localDir(f.u, f.v, 0, 0, 1));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mu = (low[i][0] + low[j][0]) / 2 - f.u, mv = (low[i][1] + low[j][1]) / 2 - f.v;
    localQuad(mesh, [low[i], low[j], high[j], high[i]], tint(RAMP, i, .03), localDir(f.u, f.v, mu, mv, 1));
  }
}

function bank(mesh: MeshBuilder, b: ParkBank) {
  const h = deckTop + b.height, n = Math.max(2, Math.ceil((b.v1 - b.v0) / 2));
  // A wall bank's top runs on to the bluff edge, where its face meets the retaining wall.
  const end = (v: number) => Math.min(b.topTo ?? b.u1, parkEastEdge(v));
  for (let i = 0; i < n; i++) {
    const v0 = b.v0 + (b.v1 - b.v0) * i / n, v1 = b.v0 + (b.v1 - b.v0) * (i + 1) / n;
    localQuad(mesh, [[b.u0, v0, deckTop + .012], [b.u0, v1, deckTop + .012], [b.u1, v1, h], [b.u1, v0, h]], RAMP, localDir(b.u0, v0, -1, 0, 2));
    if (end(v0) > b.u1) {
      localQuad(mesh, [[b.u1, v0, h], [b.u1, v1, h], [end(v1), v1, h], [end(v0), v0, h]], RAMP_TOP, localDir(b.u1, v0, 0, 0, 1));
      localQuad(mesh, [[end(v0), v0, h], [end(v1), v1, h], [end(v1), v1, deckTop - .2], [end(v0), v0, deckTop - .2]], RAMP, localDir(end(v0), v0, 1, 0));
    }
  }
  for (const [v, dir] of [[b.v0, -1], [b.v1, 1]] as const) {
    mesh.triangle(parkPoint(b.u0, v, deckTop), parkPoint(b.u1, v, deckTop), parkPoint(b.u1, v, h), RAMP, localDir(b.u0, v, 0, dir));
    if (end(v) > b.u1) localQuad(mesh, [[b.u1, v, deckTop], [end(v), v, deckTop], [end(v), v, h], [b.u1, v, h]], RAMP, localDir(b.u1, v, 0, dir));
  }
}

function quarter(mesh: MeshBuilder) {
  const q = PARK_QUARTER, levels = transitionLevels(q.transition, 14).reverse();
  const topH = deckTop + QUARTER_HEIGHT, cols = 12, back = SKATEPARK.halfV;
  // Profile from the flat deck (w = W) up to the coping (w = 0); the deck behind runs to the edge.
  const profile = levels.map(w => [QUARTER_TOP - w, topH + transitionAt(q.transition, w).h] as const);
  for (let c = 0; c < cols; c++) {
    const u0 = q.u0 + (q.u1 - q.u0) * c / cols, u1 = q.u0 + (q.u1 - q.u0) * (c + 1) / cols;
    for (let k = 0; k < profile.length - 1; k++) {
      const [va, ha] = profile[k], [vb, hb] = profile[k + 1];
      localQuad(mesh, [[u0, va, ha], [u1, va, ha], [u1, vb, hb], [u0, vb, hb]], tint(RAMP, c + k, .025), localDir(u0, va, 0, -1, .5));
    }
    localQuad(mesh, [[u0, QUARTER_TOP, topH], [u1, QUARTER_TOP, topH], [u1, back, topH], [u0, back, topH]], RAMP_TOP, localDir(u0, QUARTER_TOP, 0, 0, 1));
    localQuad(mesh, [[u0, back, deckTop - .2], [u1, back, deckTop - .2], [u1, back, topH], [u0, back, topH]], RAMP, localDir(u0, back, 0, 1));
  }
  // Solid side walls under the profile at each end.
  for (const [u, dir] of [[q.u0, -1], [q.u1, 1]] as const) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [va, ha] = profile[k], [vb, hb] = profile[k + 1];
      localQuad(mesh, [[u, va, deckTop], [u, vb, deckTop], [u, vb, hb], [u, va, ha]], RAMP, localDir(u, va, dir, 0));
    }
    localQuad(mesh, [[u, QUARTER_TOP, deckTop], [u, back, deckTop], [u, back, topH], [u, QUARTER_TOP, topH]], RAMP, localDir(u, QUARTER_TOP, dir, 0));
  }
}

/** The wooden halfpipe: plywood walls on a flat bottom, plank decks, sheathed ends. */
function halfpipe(mesh: MeshBuilder) {
  const hp = PARK_HALFPIPE, H = deckTop + HALFPIPE_HEIGHT, [west, east] = HALFPIPE_COPING, t = hp.transition;
  const levels = transitionLevels(t, 18), W = transitionWidth(t), panels = Math.ceil((hp.v1 - hp.v0) / 1.22);
  // One wall, coping (w = 0) down to the flat (w = W), as [u, height, normal-u-sign].
  const wall = (side: 1 | -1) => levels.map(w => ({ u: side > 0 ? west + w : east - w, h: deckTop + HALFPIPE_HEIGHT + transitionAt(t, w).h, w }));
  for (let p = 0; p < panels; p++) {
    const v0 = hp.v0 + (hp.v1 - hp.v0) * p / panels, v1 = hp.v0 + (hp.v1 - hp.v0) * (p + 1) / panels;
    for (const side of [1, -1] as const) {
      const rows = wall(side);
      for (let k = 0; k < rows.length - 1; k++) {
        const a = rows[k], b = rows[k + 1], color = tint(PLY, p * 13 + k * 3 + (side > 0 ? 0 : 7), .045);
        const na = surfaceNormal(a.u, v0, side * .003), nb = surfaceNormal(b.u, v0, side * .003);
        const p00 = parkPoint(a.u, v0, a.h + .004), p01 = parkPoint(a.u, v1, a.h + .004), p10 = parkPoint(b.u, v0, b.h + .004), p11 = parkPoint(b.u, v1, b.h + .004);
        mesh.triangle(p00, p10, p11, color, na, [na, nb, nb]);
        mesh.triangle(p00, p11, p01, color, na, [na, nb, na]);
      }
    }
    // Flat bottom, then plank decks over each coping.
    localQuad(mesh, [[west + W, v0, deckTop + .006], [east - W, v0, deckTop + .006], [east - W, v1, deckTop + .006], [west + W, v1, deckTop + .006]], tint(PLY_FLAT, p, .04), localDir(west + W, v0, 0, 0, 1));
    for (const [u0, u1] of [[hp.u0, west], [east, hp.u1]] as const) {
      const planks = 6;
      for (let k = 0; k < planks; k++) {
        const a = u0 + (u1 - u0) * k / planks, b = u0 + (u1 - u0) * (k + 1) / planks;
        localQuad(mesh, [[a, v0, H + .004], [b, v0, H + .004], [b, v1, H + .004], [a, v1, H + .004]], tint(DECK_BOARD, k * 5 + p, .06), localDir(a, v0, 0, 0, 1));
      }
    }
  }
  // Sheathing: the open ends under each wall and deck, and the decks' outer faces.
  for (const [v, dir] of [[hp.v0, -1], [hp.v1, 1]] as const) {
    for (const side of [1, -1] as const) {
      const rows = wall(side);
      for (let k = 0; k < rows.length - 1; k++) {
        const a = rows[k], b = rows[k + 1];
        localQuad(mesh, [[a.u, v, deckTop], [b.u, v, deckTop], [b.u, v, b.h], [a.u, v, a.h]], FRAME, localDir(a.u, v, 0, dir));
      }
    }
    for (const [u0, u1] of [[hp.u0, west], [east, hp.u1]] as const) localQuad(mesh, [[u0, v, deckTop], [u1, v, deckTop], [u1, v, H], [u0, v, H]], FRAME, localDir(u0, v, 0, dir));
  }
  for (const [u, dir] of [[hp.u0, -1], [hp.u1, 1]] as const) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const v0 = hp.v0 + (hp.v1 - hp.v0) * i / n, v1 = hp.v0 + (hp.v1 - hp.v0) * (i + 1) / n;
      localQuad(mesh, [[u, v0, deckTop], [u, v1, deckTop], [u, v1, H], [u, v0, H]], tint(FRAME, i, .08), localDir(u, v0, dir, 0));
    }
  }
}

/** Stairs as treads along +v with heights above `base`, risers facing the lower side,
 * and closed side stringers. `before`/`after` are the heights either end meets (null
 * where another mesh already closes that face). */
function stairs(mesh: MeshBuilder, u0: number, u1: number, v0: number, v1: number, base: number, heights: number[], before: number | null, after: number | null, tread: string, riser: string) {
  const n = heights.length, depth = (v1 - v0) / n;
  const face = (v: number, from: number, to: number) => {
    if (Math.abs(to - from) < 1e-4) return;
    const lo = Math.min(from, to), hi = Math.max(from, to), facing = to > from ? -1 : 1;
    localQuad(mesh, [[u0, v, base + lo], [u1, v, base + lo], [u1, v, base + hi], [u0, v, base + hi]], riser, localDir(u0, v, 0, facing));
  };
  if (before !== null) face(v0, before, heights[0]);
  for (let i = 0; i < n; i++) {
    const a = v0 + depth * i, b = a + depth, top = base + heights[i];
    localQuad(mesh, [[u0, a, top], [u1, a, top], [u1, b, top], [u0, b, top]], tint(tread, i, .04), localDir(u0, a, 0, 0, 1));
    if (i > 0) face(a, heights[i - 1], heights[i]);
    for (const [u, dir] of [[u0, -1], [u1, 1]] as const) localQuad(mesh, [[u, a, base], [u, b, base], [u, b, top], [u, a, top]], riser, localDir(u, a, dir, 0));
  }
  if (after !== null) face(v1, heights[n - 1], after);
}

function tubeBetween(c: KitContext, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: string) {
  const d = b.clone().sub(a), length = d.length();
  if (length < 1e-4) return;
  c.details.add(RAIL, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(length)), new THREE.Vector3(radius, length + .01, radius)), color);
}
function railing(c: KitContext, u0: number, v0: number, u1: number, v1: number, base0: number, base1: number, color: string) {
  const length = Math.hypot(u1 - u0, v1 - v0), posts = Math.max(1, Math.round(length / 1.4));
  for (const h of [.5, 1]) tubeBetween(c, parkPoint(u0, v0, base0 + h), parkPoint(u1, v1, base1 + h), .028, color);
  for (let i = 0; i <= posts; i++) {
    const t = i / posts, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, b = base0 + (base1 - base0) * t;
    tubeBetween(c, parkPoint(u, v, b), parkPoint(u, v, b + 1.02), .032, color);
  }
}
function localFrame(u: number, v: number, base: number, yaw = 0) {
  const t = parkTangents(u, v);
  return new THREE.Matrix4().makeBasis(t.east, t.up, t.east.clone().cross(t.up)).setPosition(parkPoint(u, v, base)).multiply(new THREE.Matrix4().makeRotationY(yaw));
}
function palm(c: KitContext, u: number, v: number, base: number, seed: number) {
  const f = localFrame(u, v, base);
  const height = 6 + (seed % 5) * .4, lean = ((seed % 7) - 3) * .03;
  let px = 0, py = 0;
  for (let k = 0; k < 6; k++) {
    const h = height / 6;
    tube(c.plants, f, [px, py + h / 2, 0], .2 - k * .016, h + .04, k % 2 ? TRUNK : '#7E684F', [0, 0, -lean * (k + 1)]);
    px += Math.sin(lean * (k + 1)) * h; py += Math.cos(lean * (k + 1)) * h;
  }
  const crown = f.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, 0));
  for (let b = 0; b < 8; b++) {
    const frond = crown.clone().multiply(new THREE.Matrix4().makeRotationY(b / 8 * Math.PI * 2 + seed));
    block(c.plants, frond, [0, .05, .85], [.5, .05, 1.8], b % 2 ? FROND : FROND_LIGHT, [.35, 0, 0]);
    block(c.plants, frond, [0, -.45, 1.95], [.38, .05, 1.1], b % 2 ? FROND_LIGHT : FROND, [.95, 0, 0]);
  }
}
function signpost(c: KitContext, u: number, v: number, yaw: number, title: string, subtitle: string) {
  const f = localFrame(u, v, deckTop, yaw);
  block(c.details, f, [0, .8, 0], [.08, 1.6, .08], FENCE);
  block(c.details, f, [0, 1.55, 0], [1.7, .5, .08], P.graphite);
  for (const side of [1, -1]) physicalSign(c, f, title, subtitle, [0, 1.55, side * .045], 1.6, .42, [0, side > 0 ? 0 : Math.PI, 0], true);
}
/** Tall floodlights at the park's corners. */
function floodlight(c: KitContext, u: number, v: number, yaw: number) {
  const f = localFrame(u, v, deckTop, yaw);
  tube(c.details, f, [0, .25, 0], .16, .5, P.graphite);
  tube(c.details, f, [0, 3.6, 0], .07, 7.2, '#3A4547');
  block(c.details, f, [0, 7.15, .35], [1.3, .1, .1], '#3A4547');
  for (const x of [-.45, .45]) {
    block(c.details, f, [x, 7.05, .5], [.42, .3, .26], '#3A4547', [-.45, 0, 0]);
    block(c.glow, f, [x, 6.98, .6], [.34, .2, .05], P.amber, [-.45, 0, 0]);
  }
}
function bench(c: KitContext, u: number, v: number, yaw: number) {
  const f = localFrame(u, v, deckTop, yaw);
  block(c.structure, f, [0, .22, 0], [1.9, .44, .55], '#B1AC9F');
  block(c.details, f, [0, .45, 0], [1.95, .03, .6], EDGE);
}
function bin(c: KitContext, u: number, v: number) {
  const f = localFrame(u, v, deckTop);
  tube(c.details, f, [0, .45, 0], .28, .9, '#3D5A55');
  tube(c.details, f, [0, .92, 0], .3, .05, P.graphite);
}

function buildPark() {
  const surface = new MeshBuilder(), ramps = new MeshBuilder(), wood = new MeshBuilder();
  deck(surface); seams(surface);
  for (const spec of PARK_POOLS) pool(surface, spec);
  snake(surface);
  for (const spec of PARK_BOXES) box(ramps, spec);
  funbox(ramps); quarter(ramps);
  for (const spec of PARK_BANKS) bank(ramps, spec);
  // The five-stair off the platform's north face (heights fall toward +v).
  const s = PARK_STAIRS, treads = s.steps - 1;
  stairs(ramps, s.u0, s.u1, s.top, s.bottom, deckTop, Array.from({ length: treads }, (_, k) => s.height * (1 - (k + 1) / s.steps)), null, 0, RAMP_TOP, RAMP);
  halfpipe(wood);
  const hs = HALFPIPE_STAIRS;
  stairs(wood, hs.u0, hs.u1, hs.foot, hs.top, deckTop, Array.from({ length: hs.steps }, (_, k) => (k + 1) * HALFPIPE_HEIGHT / hs.steps), 0, null, DECK_BOARD, FRAME);
  localQuad(wood, [[hs.u0, hs.top, deckTop + HALFPIPE_HEIGHT + .004], [hs.u1, hs.top, deckTop + HALFPIPE_HEIGHT + .004], [hs.u1, hs.landing, deckTop + HALFPIPE_HEIGHT + .004], [hs.u0, hs.landing, deckTop + HALFPIPE_HEIGHT + .004]], DECK_BOARD, localDir(hs.u0, hs.top, 0, 0, 1));
  for (const [u, dir] of [[hs.u1, 1]] as const) localQuad(wood, [[u, hs.top, deckTop], [u, hs.landing, deckTop], [u, hs.landing, deckTop + HALFPIPE_HEIGHT], [u, hs.top, deckTop + HALFPIPE_HEIGHT]], FRAME, localDir(u, hs.top, dir, 0));
  localQuad(wood, [[hs.u0, hs.landing, deckTop], [hs.u1, hs.landing, deckTop], [hs.u1, hs.landing, deckTop + HALFPIPE_HEIGHT], [hs.u0, hs.landing, deckTop + HALFPIPE_HEIGHT]], FRAME, localDir(hs.u0, hs.landing, 0, 1));

  const kit = createKitContext();
  // Coping on every bowl and ramp, ledge steel on the boxes, rails on posts.
  for (const line of skateparkGrindLines()) {
    if (line.id.startsWith('stairs:')) continue;
    const pts = line.closed ? [...line.points, line.points[0]] : line.points;
    const steel = line.id.startsWith('halfpipe') || line.id.startsWith('quarter');
    const radius = line.kind === 'coping' ? (steel ? .05 : .065) : line.kind === 'ledge' ? .035 : .04;
    const color = line.kind === 'coping' ? (steel ? STEEL : COPING) : line.kind === 'ledge' ? EDGE : RAIL_COLOR;
    const sink = (p: THREE.Vector3) => line.kind === 'ledge' ? p.clone().multiplyScalar(1 - .012 / p.length()) : p;
    for (let i = 1; i < pts.length; i++) tubeBetween(kit, sink(pts[i - 1]), sink(pts[i]), radius, color);
    if (line.kind === 'rail') for (const i of [0, Math.floor(pts.length / 2), pts.length - 1]) {
      // Posts drop from the rail to whatever surface is beneath it.
      const p = pts[i], local = parkLocal(p), ground = MAP_RADIUS + (parkSurfaceLocal(local.u, local.v)?.height ?? deckTop);
      tubeBetween(kit, p, p.clone().multiplyScalar(ground / p.length()), .035, FENCE);
    }
  }
  // Fence: posts and two rails, open at the entrance above the stairs.
  for (const [u0, v0, u1, v1, b0, b1] of parkFenceSegments()) railing(kit, u0, v0, u1, v1, b0, b1, FENCE);
  // Halfpipe deck railings, and the sloped rail up the outside of its stairs.
  for (const [u0, v0, u1, v1, base] of halfpipeRailSegments()) railing(kit, u0, v0, u1, v1, deckTop + base, deckTop + base, STEEL);
  railing(kit, hs.u1 - .05, hs.foot, hs.u1 - .05, hs.top, deckTop + .05, deckTop + HALFPIPE_HEIGHT, STEEL);
  // Frame posts down the halfpipe's outer faces.
  for (const u of [PARK_HALFPIPE.u0 - .06, PARK_HALFPIPE.u1 + .06]) for (let v = PARK_HALFPIPE.v0; v <= PARK_HALFPIPE.v1 + .01; v += (PARK_HALFPIPE.v1 - PARK_HALFPIPE.v0) / 6) {
    block(kit.details, localFrame(u, v, deckTop), [0, HALFPIPE_HEIGHT / 2, 0], [.16, HALFPIPE_HEIGHT, .16], FRAME);
  }
  // Palms round the outside of the fence, Venice-style, wherever the bluff top carries them.
  parkFootprintOutline(-1.3, 6.5).forEach(([u, v], i) => {
    if (u > SKATEPARK.halfU - 2) return;
    const chart = mapCoordinates(parkPoint(u, v, 0));
    if (westBluffDistance(chart.x, chart.z) > -.6) return;
    palm(kit, u, v, deckTop, i * 23 + 5);
  });
  for (const [u, v, yaw] of [[-20.2, 24.2, Math.PI * .75], [18.7, 23.2, -Math.PI * .75], [-20.4, -16, Math.PI * .25], [20.2, -8.5, -Math.PI * .5]] as const) floodlight(kit, u, v, yaw);
  bench(kit, -20.6, 15.2, Math.PI / 2); bench(kit, 20.1, -15.6, -Math.PI / 2); bench(kit, 3.5, -1.6, 0);
  bin(kit, 18.6, 5); bin(kit, -20.6, 12.4); bin(kit, 4.2, -8.6);
  signpost(kit, -1.4, -4.2, 0, 'THE DEEP END', '3.3 M / VERT');
  signpost(kit, 19.3, -17.3, -Math.PI / 2, 'SNAKE RUN', 'DROP IN AT THE HEAD');
  signpost(kit, 17.6, -5.2, -Math.PI / 2, 'GAME OF S.K.A.T.E.', 'START ON THE STAIRS');
  signpost(kit, -.6, 13.4, 0, 'BIG HALFPIPE', '3.5 M / 87° VERT');
  for (const batch of [kit.structure, kit.details, kit.plants, kit.glow]) batch.setSurfaceFrame(null);
  return { surface: surface.finish(), ramps: ramps.finish(), wood: wood.finish(), structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), glow: kit.glow.finish(), signs: kit.signs };
}

/** The Venice-inspired concrete park and its wooden halfpipe on the west bluff. The walker,
 * terrain and skateboard all read the analytic surface in skatepark-layout.ts; this draws it. */
export default function SkatePark() {
  const park = useMemo(() => buildPark(), []);
  useEffect(() => () => { for (const g of [park.surface, park.ramps, park.wood, park.structure, park.details, park.plants, park.glow]) g.dispose(); }, [park]);
  return <group name="skate-park">
    <mesh name="skate-park-surface" geometry={park.surface} receiveShadow><meshStandardMaterial vertexColors roughness={.92} /></mesh>
    <mesh name="skate-park-ramps" geometry={park.ramps} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.9} flatShading /></mesh>
    <mesh name="skate-park-halfpipe" geometry={park.wood} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.8} /></mesh>
    <mesh geometry={park.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.9} /></mesh>
    <mesh geometry={park.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.7} /></mesh>
    <mesh geometry={park.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <mesh geometry={park.glow}><meshStandardMaterial vertexColors roughness={.3} emissive={P.amber} emissiveIntensity={.6} /></mesh>
    <SignAtlas signs={park.signs} />
  </group>;
}
