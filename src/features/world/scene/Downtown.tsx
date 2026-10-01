'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mapDirection, mapFrame, mapPoint } from '../data/world-map';
import { COURTYARD, CUL_DE_SACS, culDeSacOuterRadius, culDeSacRoadRadius, DOWNTOWN_FURNITURE, downtownCells, downtownMarkings, PLAZA, STREET_LEVEL, WALK_LEVEL, type CulDeSac, type DowntownKind } from '../data/downtown-layout';
import { GRAND_STAIRS, GRAND_STAIR_TREAD, SKATEPARK, skateparkGrindLines } from '../data/skatepark-layout';
import { OVERLOOK, overlookPoint } from '../data/town-props';
import { TOWN_ROUTES } from '../data/town-layout';
import { MeshBuilder, tint } from './meshBuilder';
import { block, createKitContext, physicalSign, tube, type KitContext } from './kit/context';
import { SignAtlas } from './kit/SignAtlas';
import { TOWN_PALETTE as P } from './kit/materials';

const ASPHALT = '#4A5456', PAVING = '#CFC9B8', CURB = '#DDD8CA', YELLOW = '#D9B35C', WHITE = '#E9E5D9';
const STAIR = '#CBC6B7', RISER = '#AEA99B';
const TRUNK = '#8B7358', FROND = '#5E7F4E', FROND_LIGHT = '#77965E';
const TORUS = new THREE.TorusGeometry(1, .34, 7, 16, Math.PI * 1.3);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const RAIL = new THREE.CylinderGeometry(1, 1, 1, 6);
const DISC = new THREE.CylinderGeometry(1, 1, 1, 24);
const BULB = new THREE.IcosahedronGeometry(1, 0);

/** Carriageways, sidewalks, curb faces and edge skirts from the shared cell decomposition. */
function streets(mesh: MeshBuilder) {
  const { X, Z, kind } = downtownCells();
  const level = (k: DowntownKind) => k === 'road' ? STREET_LEVEL : WALK_LEVEL;
  const outward = new THREE.Vector3();
  const vertical = (xa: number, za: number, xb: number, zb: number, top: number, bottom: number, color: string, dirX: number, dirZ: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, zb - za) / 1.2));
    for (let s = 0; s < n; s++) {
      const x0 = xa + (xb - xa) * s / n, z0 = za + (zb - za) * s / n, x1 = xa + (xb - xa) * (s + 1) / n, z1 = za + (zb - za) * (s + 1) / n;
      const f = mapFrame((x0 + x1) / 2, (z0 + z1) / 2);
      outward.copy(f.east).multiplyScalar(dirX).addScaledVector(f.north, dirZ);
      mesh.quad(mapPoint(x0, z0, bottom), mapPoint(x1, z1, bottom), mapPoint(x1, z1, top), mapPoint(x0, z0, top), color, outward);
    }
  };
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    const k = kind[i][j];
    if (!k) continue;
    const x0 = X[i], x1 = X[i + 1], z0 = Z[j], z1 = Z[j + 1], h = level(k) + .004;
    const size = k === 'walk' ? 1.25 : 1.6;
    const nx = Math.max(1, Math.ceil((x1 - x0) / size)), nz = Math.max(1, Math.ceil((z1 - z0) / size));
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const xa = x0 + (x1 - x0) * a / nx, xb = x0 + (x1 - x0) * (a + 1) / nx, za = z0 + (z1 - z0) * b / nz, zb = z0 + (z1 - z0) * (b + 1) / nz;
      const seed = Math.round(xa * 3.1) * 131 + Math.round(za * 2.7) * 17;
      mesh.quad(mapPoint(xa, za, h), mapPoint(xb, za, h), mapPoint(xb, zb, h), mapPoint(xa, zb, h), k === 'road' ? tint(ASPHALT, seed, .025) : tint(PAVING, seed, .05), mapDirection((xa + xb) / 2, (za + zb) / 2));
    }
    // Faces belong to the higher side: sidewalks own their curbs, everything owns its skirt.
    const side = (di: number, dj: number) => kind[i + di]?.[j + dj] ?? null;
    const edges = [[-1, 0, x0, z0, x0, z1], [1, 0, x1, z0, x1, z1], [0, -1, x0, z0, x1, z0], [0, 1, x0, z1, x1, z1]] as const;
    for (const [di, dj, xa, za, xb, zb] of edges) {
      const other = side(di, dj);
      if (other === k || (k === 'road' && other === 'walk')) continue;
      if (k === 'walk' && other === 'road') {
        vertical(xa, za, xb, zb, WALK_LEVEL + .004, STREET_LEVEL, CURB, di, dj);
        // A pale curb-top band on the sidewalk side.
        const inset = .2, ix = -di * inset, iz = -dj * inset / Math.max(.2, Math.cos(xa / 72));
        const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, zb - za) / 1.2));
        for (let s = 0; s < n; s++) {
          const ax = xa + (xb - xa) * s / n, az = za + (zb - za) * s / n, bx = xa + (xb - xa) * (s + 1) / n, bz = za + (zb - za) * (s + 1) / n;
          mesh.quad(mapPoint(ax, az, WALK_LEVEL + .009), mapPoint(bx, bz, WALK_LEVEL + .009), mapPoint(bx + ix, bz + iz, WALK_LEVEL + .009), mapPoint(ax + ix, az + iz, WALK_LEVEL + .009), CURB, mapDirection(ax, az));
        }
      } else vertical(xa, za, xb, zb, level(k) + .004, level(k) - .55, k === 'road' ? '#3E4749' : '#B4AE9E', di, dj);
    }
  }
  for (const { rect: [x0, x1, z0, z1], color } of downtownMarkings()) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 1.5)), nz = Math.max(1, Math.ceil((z1 - z0) / 1.5)), h = STREET_LEVEL + .012;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const xa = x0 + (x1 - x0) * a / nx, xb = x0 + (x1 - x0) * (a + 1) / nx, za = z0 + (z1 - z0) * b / nz, zb = z0 + (z1 - z0) * (b + 1) / nz;
      mesh.quad(mapPoint(xa, za, h), mapPoint(xb, za, h), mapPoint(xb, zb, h), mapPoint(xa, zb, h), color === 'yellow' ? YELLOW : WHITE, mapDirection(xa, za));
    }
  }
}

/** A cul-de-sac in polar strips: planted island, turning circle, curb, sidewalk ring and the
 * outer skirt. Radii come from the same functions that classify walking support. */
function culDeSac(mesh: MeshBuilder, c: CulDeSac) {
  const [cx, cz] = c.center, steps = 128;
  const at = (radius: number, angle: number, h: number) => mapPoint(cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius, h);
  const up = (angle: number, radius: number) => mapDirection(cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius);
  /** A radial band between two radius functions, split so flat pieces follow the planet. */
  const band = (a0: number, a1: number, r0: (a: number) => number, r1: (a: number) => number, h: number, color: (seed: number) => THREE.Color | string) => {
    const outer = Math.max(r1(a0), r1(a1)), inner = Math.min(r0(a0), r0(a1)), rings = Math.max(1, Math.ceil((outer - inner) / 1.3));
    for (let k = 0; k < rings; k++) {
      const t0 = k / rings, t1 = (k + 1) / rings;
      const p00 = r0(a0) + (r1(a0) - r0(a0)) * t0, p01 = r0(a0) + (r1(a0) - r0(a0)) * t1;
      const p10 = r0(a1) + (r1(a1) - r0(a1)) * t0, p11 = r0(a1) + (r1(a1) - r0(a1)) * t1;
      if (p01 - p00 < 1e-4 && p11 - p10 < 1e-4) continue;
      mesh.quad(at(p00, a0, h), at(p01, a0, h), at(p11, a1, h), at(p10, a1, h), color(Math.round(a0 * 40) * 17 + k * 131), up(a0, (p00 + p01) / 2));
    }
  };
  const island = () => c.island, road = (a: number) => culDeSacRoadRadius(c, a), out = (a: number) => culDeSacOuterRadius(c, a);
  const verticalFace = (a0: number, a1: number, r0: number, r1: number, top: number, bottom: number, color: string, inward: boolean) => {
    const mid = (a0 + a1) / 2, f = mapFrame(cx + Math.cos(mid) * (r0 + r1) / 2, cz + Math.sin(mid) * (r0 + r1) / 2);
    const normal = f.east.clone().multiplyScalar(Math.cos(mid)).addScaledVector(f.north, Math.sin(mid)).multiplyScalar(inward ? -1 : 1);
    mesh.quad(at(r0, a0, bottom), at(r1, a1, bottom), at(r1, a1, top), at(r0, a0, top), color, normal);
  };
  for (let s = 0; s < steps; s++) {
    const a0 = -Math.PI + 2 * Math.PI * s / steps, a1 = -Math.PI + 2 * Math.PI * (s + 1) / steps;
    // The island: a curbed planting bed of low grass at sidewalk level.
    const bed = c.island - .26;
    mesh.triangle(at(0, a0, WALK_LEVEL + .03), at(bed, a1, WALK_LEVEL + .03), at(bed, a0, WALK_LEVEL + .03), s % 3 ? '#6F8A5C' : '#7C9465', up(a0, 0));
    band(a0, a1, () => bed, island, WALK_LEVEL + .006, seed => tint(CURB, seed, .03));
    verticalFace(a0, a1, c.island, c.island, WALK_LEVEL + .006, STREET_LEVEL, CURB, false);
    // The turning circle, then the curb and the sidewalk ring where it has width.
    band(a0, a1, island, road, STREET_LEVEL + .004, seed => tint(ASPHALT, seed, .025));
    const r0 = road(a0), r1 = road(a1), o0 = out(a0), o1 = out(a1);
    if (o0 - r0 > .02 || o1 - r1 > .02) {
      verticalFace(a0, a1, r0, r1, WALK_LEVEL + .004, STREET_LEVEL, CURB, true);
      band(a0, a1, road, a => Math.min(out(a), road(a) + .2), WALK_LEVEL + .009, () => CURB);
      band(a0, a1, a => Math.min(out(a), road(a) + .2), out, WALK_LEVEL + .004, seed => tint(PAVING, seed, .05));
    }
    // Skirts only on the open outer circle; the cut line joins the street's own sidewalks.
    if (Math.cos(a0) > -1e-6 || o0 >= c.walk - 1e-6) {
      if (o0 >= c.walk - 1e-6 && o1 >= c.walk - 1e-6) verticalFace(a0, a1, o0, o1, WALK_LEVEL + .004, WALK_LEVEL - .55, '#B4AE9E', false);
    }
  }
  // A painted turning arrow in the circle.
  const arrow = c.road - 1.6;
  for (let s = 0; s < 18; s++) {
    const a0 = -Math.PI * .75 + Math.PI * 1.5 * s / 18, a1 = -Math.PI * .75 + Math.PI * 1.5 * (s + 1) / 18;
    mesh.quad(at(arrow - .09, a0, STREET_LEVEL + .012), at(arrow + .09, a0, STREET_LEVEL + .012), at(arrow + .09, a1, STREET_LEVEL + .012), at(arrow - .09, a1, STREET_LEVEL + .012), WHITE, up(a0, arrow));
  }
}

/** Sixteen treads and risers from the Main St sidewalk up to the park entrance. */
function grandStairs(mesh: MeshBuilder) {
  const s = GRAND_STAIRS, across = 8;
  for (let i = 0; i < s.count; i++) {
    const xa = s.foot - i * GRAND_STAIR_TREAD, xb = s.foot - (i + 1) * GRAND_STAIR_TREAD, top = s.base + (i + 1) * s.rise;
    for (let c = 0; c < across; c++) {
      const za = -s.halfWidth + 2 * s.halfWidth * c / across, zb = -s.halfWidth + 2 * s.halfWidth * (c + 1) / across;
      mesh.quad(mapPoint(xa, za, top), mapPoint(xb, za, top), mapPoint(xb, zb, top), mapPoint(xa, zb, top), tint(STAIR, i * 13 + c, .03), mapDirection(xa, za));
      const f = mapFrame(xa, (za + zb) / 2);
      mesh.quad(mapPoint(xa, za, top - s.rise), mapPoint(xa, zb, top - s.rise), mapPoint(xa, zb, top), mapPoint(xa, za, top), RISER, f.east);
      // A darker nosing band makes each step edge read from below.
      mesh.quad(mapPoint(xa, za, top + .003), mapPoint(xa - .06, za, top + .003), mapPoint(xa - .06, zb, top + .003), mapPoint(xa, zb, top + .003), '#8F8B80', f.up);
    }
  }
}

function palm(c: KitContext, x: number, z: number, level: number, seed: number) {
  const f = mapFrame(x, z, level).matrix;
  const height = 5.2 + (seed % 5) * .35, lean = ((seed % 7) - 3) * .025;
  block(c.details, f, [0, .02, 0], [.9, .04, .9], P.graphite);
  let px = 0, py = 0;
  for (let k = 0; k < 6; k++) {
    const h = height / 6, r = .2 - k * .015;
    tube(c.plants, f, [px, py + h / 2, 0], r, h + .04, k % 2 ? TRUNK : '#7E684F', [0, 0, -lean * (k + 1)]);
    px += Math.sin(lean * (k + 1)) * h; py += Math.cos(lean * (k + 1)) * h;
  }
  const crown = f.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, 0));
  for (let b = 0; b < 8; b++) {
    const yaw = b / 8 * Math.PI * 2 + seed, frond = crown.clone().multiply(new THREE.Matrix4().makeRotationY(yaw));
    block(c.plants, frond, [0, .05, .85], [.5, .05, 1.8], b % 2 ? FROND : FROND_LIGHT, [.35, 0, 0]);
    block(c.plants, frond, [0, -.45, 1.95], [.38, .05, 1.1], b % 2 ? FROND_LIGHT : FROND, [.95, 0, 0]);
  }
  for (let k = 0; k < 3; k++) c.plants.shape(CONE, crown, [Math.cos(k * 2.1) * .18, -.15, Math.sin(k * 2.1) * .18], [.11, .18, .11], '#6D5A3E', [Math.PI, 0, 0]);
}

function lamp(c: KitContext, x: number, z: number, level: number, yaw?: number) {
  const f = mapFrame(x, z, level).matrix;
  // Arms reach toward the carriageway (Main St at z 0, Palm Ave at z 22.5), or along a yaw.
  let toward = 1;
  if (yaw === undefined) { const street = z > 16 ? 22.5 : 0; toward = z > 16 ? (z > street ? -1 : 1) : z > 0 ? -1 : 1; }
  else f.multiply(new THREE.Matrix4().makeRotationY(yaw));
  tube(c.details, f, [0, .25, 0], .12, .5, P.graphite);
  tube(c.details, f, [0, 2.2, 0], .055, 4.2, '#2F3A3C');
  block(c.details, f, [0, 4.25, toward * .5], [.08, .08, 1.05], '#2F3A3C');
  block(c.details, f, [0, 4.14, toward * 1], [.34, .16, .5], '#2F3A3C');
  block(c.glow, f, [0, 4.04, toward * 1], [.26, .05, .38], P.amber);
}

function bench(c: KitContext, x: number, z: number, level: number, yaw = 0) {
  const f = mapFrame(x, z, level).matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
  for (let s = 0; s < 3; s++) block(c.details, f, [0, .44, -.16 + s * .16], [1.6, .05, .12], P.timber);
  for (let s = 0; s < 2; s++) block(c.details, f, [0, .72 + s * .15, -.27], [1.6, .1, .04], P.timber, [-.15, 0, 0]);
  for (const side of [-1, 1]) block(c.details, f, [side * .7, .22, 0], [.07, .44, .5], P.graphite);
}

/** The courtyard's centrepiece: a round stone fountain whose plinth carries the curling
 * bronze wave, set in a compass-rose floor. */
function fountain(c: KitContext, paving: MeshBuilder) {
  const [x, z] = COURTYARD.fountain, f = mapFrame(x, z, WALK_LEVEL).matrix, r = COURTYARD.basin;
  // Compass rose and rings inlaid in the plaza floor.
  const inlay = (radius: number, angle: number, h: number) => mapPoint(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, h);
  const ring = (r0: number, r1: number, color: string, h: number) => {
    for (let s = 0; s < 72; s++) {
      const a0 = s / 72 * Math.PI * 2, a1 = (s + 1) / 72 * Math.PI * 2;
      paving.quad(inlay(r0, a0, h), inlay(r1, a0, h), inlay(r1, a1, h), inlay(r0, a1, h), tint(color, s * 7, .03), mapDirection(x, z));
    }
  };
  const h = WALK_LEVEL + .007;
  ring(COURTYARD.rose - .45, COURTYARD.rose, '#7E7A70', h);
  ring(COURTYARD.rose - .78, COURTYARD.rose - .62, '#9E978A', h);
  ring(r + .2, r + .62, '#6E6A61', h);
  // A sixteen-point compass star, each point a two-tone stone kite.
  for (let point = 0; point < 16; point++) {
    const angle = point / 16 * Math.PI * 2, major = point % 4 === 0, minor = point % 2 === 0;
    const length = major ? COURTYARD.rose - .55 : minor ? COURTYARD.rose * .7 : COURTYARD.rose * .54;
    const half = (major ? .3 : minor ? .2 : .14) * Math.PI / 4, base = r + .62;
    for (const side of [-1, 1]) {
      const tip = inlay(length, angle, h + .002), root = inlay(base, angle, h + .002), flank = inlay(base + (major ? .5 : .3), angle + side * half, h + .002);
      const light = major ? '#A8A296' : minor ? '#B4AE9F' : '#BDB7A8', dark = major ? '#3F4A4B' : minor ? '#5C6463' : '#6E6A61';
      paving.triangle(root, side > 0 ? flank : tip, side > 0 ? tip : flank, side > 0 ? dark : light, mapDirection(x, z));
    }
  }
  // Basin wall, coping and water.
  for (let s = 0; s < 24; s++) {
    const a = (s + .5) / 24 * Math.PI * 2, seg = f.clone().multiply(new THREE.Matrix4().makeRotationY(-a));
    block(c.structure, seg, [r - .18, .28, 0], [.36, .56, 2 * r * Math.tan(Math.PI / 24) + .03], '#BEB9AB');
    block(c.structure, seg, [r - .16, .6, 0], [.5, .08, 2 * (r + .06) * Math.tan(Math.PI / 24) + .04], '#D6D0C2');
  }
  c.structure.shape(DISC, f, [0, .4, 0], [r - .3, .02, r - .3], '#4F8A92');
  c.glow.shape(DISC, f, [0, .415, 0], [r - .55, .006, r - .55], '#7FB3B6');
  // The stepped plinth with the WESTCOSE / DEAD COAST plaque, and the wave above it.
  tube(c.structure, f, [0, .62, 0], 1.25, .5, '#8E8A7E');
  block(c.structure, f, [0, 1.35, 0], [2.2, 1.0, 1.4], '#4F5859');
  block(c.structure, f, [0, 1.9, 0], [2.4, .12, 1.6], '#6E7472');
  for (const side of [1, -1]) physicalSign(c, f, 'WESTCOSE', 'DEAD COAST', [0, 1.3, side * .71], 2, .62, [0, side > 0 ? 0 : Math.PI, 0], true, '#4F5859');
  const wave = '#7D8A86';
  c.structure.shape(TORUS, f, [0, 2.78, 0], [.86, .86, .86], wave, [0, 0, -.25]);
  c.structure.shape(TORUS, f, [.35, 2.5, .05], [.56, .56, .56], '#6E7B78', [0, 0, .55]);
  block(c.structure, f, [0, 2.12, -.25], [.72, .5, 1.05], wave, [.2, 0, 0]);
  // Spouts arc water from the plinth into the basin.
  for (let s = 0; s < 8; s++) {
    const a = s / 8 * Math.PI * 2, jet = f.clone().multiply(new THREE.Matrix4().makeRotationY(-a));
    block(c.details, jet, [1.25, .78, 0], [.14, .1, .14], P.steel);
    for (let k = 0; k < 4; k++) block(c.glow, jet, [1.4 + k * .17, .78 + .1 * k - .08 * k * k, 0], [.12, .05, .07], '#9CC9C8', [0, 0, -.35 * k]);
  }
}

function planter(c: KitContext, x: number, z: number, size: number, seed: number) {
  const f = mapFrame(x, z, WALK_LEVEL).matrix;
  block(c.structure, f, [0, .3, 0], [size, .6, size], '#B9B4A6');
  block(c.structure, f, [0, .62, 0], [size + .1, .06, size + .1], '#D2CCBD');
  block(c.details, f, [0, .62, 0], [size - .2, .04, size - .2], P.soil);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + seed, d = size * .3;
    c.plants.shape(CONE, f, [Math.cos(a) * d, .85, Math.sin(a) * d], [.22, .5, .22], k % 2 ? FROND_LIGHT : '#6C8A57', [0, a, 0]);
  }
}

/** Strings of warm bulbs strung between the plaza poles, sagging between their ends. */
function stringLights(c: KitContext, from: readonly [number, number], to: readonly [number, number], height: number, sag: number) {
  const a = mapPoint(from[0], from[1], WALK_LEVEL + height), b = mapPoint(to[0], to[1], WALK_LEVEL + height);
  const length = a.distanceTo(b), count = Math.ceil(length / .7), points: THREE.Vector3[] = [];
  for (let k = 0; k <= count; k++) {
    const t = k / count, p = a.clone().lerp(b, t), up = p.clone().normalize();
    points.push(p.addScaledVector(up, -sag * 4 * t * (1 - t)));
  }
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1], q = points[k], d = q.clone().sub(p), l = d.length();
    c.details.add(RAIL, new THREE.Matrix4().compose(p.clone().add(q).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(l)), new THREE.Vector3(.012, l, .012)), '#2F3A3C');
    if (k < points.length - 1) {
      const bulb = q.clone().addScaledVector(q.clone().normalize(), -.09);
      c.glow.add(BULB, new THREE.Matrix4().compose(bulb, new THREE.Quaternion(), new THREE.Vector3(.045, .06, .045)), '#F2C98A');
    }
  }
}

function plaza(c: KitContext, paving: MeshBuilder) {
  fountain(c, paving);
  PLAZA.planters.forEach(([x, z], i) => planter(c, x, z, PLAZA.planterSize, i * 1.7));
  for (const [x, z] of PLAZA.bollards) {
    const f = mapFrame(x, z, WALK_LEVEL).matrix;
    tube(c.details, f, [0, .38, 0], .12, .76, P.graphite);
    tube(c.glow, f, [0, .7, 0], .1, .1, P.amber);
    tube(c.details, f, [0, .79, 0], .14, .05, P.graphite);
  }
  const height = PLAZA.lightPoleHeight;
  PLAZA.lightPoles.forEach(([x, z], i) => {
    const f = mapFrame(x, z, WALK_LEVEL).matrix;
    tube(c.details, f, [0, .2, 0], .16, .4, P.graphite);
    tube(c.details, f, [0, height / 2, 0], .07, height, '#2F3A3C');
    block(c.details, f, [0, height - .1, 0], [.5, .06, .06], '#2F3A3C');
    // A banner on each pole facing the plaza.
    const banner = f.clone().multiply(new THREE.Matrix4().makeRotationY(x < 0 ? Math.PI / 2 : -Math.PI / 2));
    block(c.details, banner, [0, height - .55, .12], [.62, .05, .05], '#2F3A3C');
    block(c.details, banner, [0, height - 1.35, .14], [.58, 1.5, .03], i % 2 ? '#394F51' : P.rust);
    physicalSign(c, banner, i % 2 ? 'WESTCOSE' : 'COASTAL', i % 2 ? 'WORLD' : 'MISFITS / EST. 2018', [0, height - 1.35, .158], 1.36, .5, [0, 0, -Math.PI / 2], true, i % 2 ? '#394F51' : P.rust);
  });
  const [p0, p1, p2, p3] = PLAZA.lightPoles;
  for (const [a, b] of [[p0, p1], [p2, p3], [p0, p3], [p1, p2], [p0, p2], [p1, p3]] as const) stringLights(c, a, b, height - .2, .5);
  // A signpost of hand-painted arrows to every destination round the square.
  const f = mapFrame(-7.9, 16.9, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(.35));
  tube(c.details, f, [0, 1.45, 0], .07, 2.9, '#3A4646');
  const arrows: [string, number][] = [['STUDIO ROW GALLERY', -1], ['WESTCOSE SHOP', 1], ['SKATE SHOP / CUL-DE-SAC', 1], ['PIER / BEACH / MOTEL', -1], ['SKI RESORT / TRAILS', 1]];
  arrows.forEach(([label, side], k) => {
    const y = 2.55 - k * .36;
    block(c.details, f, [side * .55, y, 0], [1.3, .28, .05], k % 2 ? P.graphite : '#394F51');
    for (const face of [1, -1]) {
      const pointing = side * face > 0 ? `${label} →` : `← ${label}`;
      physicalSign(c, f, pointing, undefined, [side * .55, y, face * .03], 1.2, .24, [0, face > 0 ? 0 : Math.PI, 0], true, k % 2 ? P.graphite : '#394F51');
    }
  });
}

function wayfinding(c: KitContext, x: number, z: number, yaw: number, top: string, bottom: string) {
  const f = mapFrame(x, z, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
  block(c.details, f, [0, 1.05, 0], [.09, 2.1, .09], P.steel);
  block(c.details, f, [0, 1.95, 0], [2.2, .6, .12], P.graphite);
  for (const side of [1, -1]) physicalSign(c, f, top, bottom, [0, 1.95, side * .065], 2.05, .48, [0, side > 0 ? 0 : Math.PI, 0], true);
}

/** The Cliff Cul-de-sac's overlook above the hidden beach, and the lighthouse trailhead. */
function overlook(c: KitContext) {
  const posts = 14, steel = '#3B4848';
  for (let k = 0; k <= posts; k++) {
    const degrees = OVERLOOK.from + (OVERLOOK.to - OVERLOOK.from) * k / posts, p = overlookPoint(degrees);
    const f = mapFrame(p.x, p.z, WALK_LEVEL).matrix;
    tube(c.details, f, [0, OVERLOOK.height / 2, 0], .045, OVERLOOK.height, steel);
    if (k === posts) continue;
    const q = overlookPoint(OVERLOOK.from + (OVERLOOK.to - OVERLOOK.from) * (k + 1) / posts);
    for (const y of [OVERLOOK.height, OVERLOOK.height * .55, .2]) {
      const a = mapPoint(p.x, p.z, WALK_LEVEL + y), b = mapPoint(q.x, q.z, WALK_LEVEL + y), d = b.clone().sub(a), l = d.length();
      c.details.add(RAIL, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(l)), new THREE.Vector3(y === OVERLOOK.height ? .04 : .022, l + .02, y === OVERLOOK.height ? .04 : .022)), y === OVERLOOK.height ? '#A78A68' : steel);
    }
  }
  // Coin-op binoculars looking out over the cove, and a plaque.
  const view = overlookPoint(18, OVERLOOK.radius - .55), f = mapFrame(view.x, view.z, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(-Math.cos(18 * Math.PI / 180), Math.sin(18 * Math.PI / 180)) + Math.PI));
  tube(c.details, f, [0, .55, 0], .07, 1.1, steel);
  block(c.details, f, [0, 1.2, 0], [.34, .3, .5], '#5B7E8A');
  for (const side of [-1, 1]) tube(c.details, f, [side * .09, 1.24, -.3], .065, .18, steel, [Math.PI / 2, 0, 0]);
  const plaque = overlookPoint(36, OVERLOOK.radius - .3), pf = mapFrame(plaque.x, plaque.z, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(-Math.cos(36 * Math.PI / 180), Math.sin(36 * Math.PI / 180))));
  block(c.details, pf, [0, .55, 0], [.1, 1.1, .1], steel);
  block(c.details, pf, [0, 1.12, 0], [1.1, .5, .08], '#394F51', [-.35, 0, 0]);
  physicalSign(c, pf, 'THE HIDDEN BEACH', 'BELOW THE CLIFFS / THROUGH THE CAVE', [0, 1.13, .045], 1.02, .44, [-.35, 0, 0], true, '#394F51');
  // The trailhead marker where the lighthouse trail leaves the sidewalk.
  const trail = TOWN_ROUTES.find(route => route.id === 'lighthouse-trail')!, [tx, tz] = trail.points[0];
  const t = mapFrame(tx - .9, tz + 1.4, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(-.4));
  for (const side of [-1, 1]) block(c.details, t, [side * .7, .8, 0], [.12, 1.6, .12], '#6B5A44');
  block(c.details, t, [0, 1.45, 0], [1.7, .55, .1], '#A78A68');
  for (const side of [1, -1]) physicalSign(c, t, 'LIGHTHOUSE TRAIL', 'UPPER TRAIL / VIEWING POINT', [0, 1.45, side * .056], 1.6, .48, [0, side > 0 ? 0 : Math.PI, 0], true, '#394F51');
  // A low monument naming each cul-de-sac on its island, facing up its street.
  for (const cul of CUL_DE_SACS) {
    const m = mapFrame(cul.center[0] - cul.island + .55, cul.center[1], WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    block(c.structure, m, [0, .3, 0], [1.5, .6, .35], '#B9B4A6');
    physicalSign(c, m, cul.name.toUpperCase(), 'WESTCOSE', [0, .32, .18], 1.36, .42, [0, 0, 0], true, '#4F5859');
  }
}

function stairArch(c: KitContext) {
  const x = GRAND_STAIRS.top - .5, f = mapFrame(x, 0, SKATEPARK.deck).matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  for (const side of [-1, 1]) {
    block(c.details, f, [side * (GRAND_STAIRS.halfWidth + .25), 1.7, 0], [.3, 3.4, .3], P.graphite);
    block(c.details, f, [side * (GRAND_STAIRS.halfWidth + .25), .15, 0], [.55, .3, .55], '#9C988C');
  }
  block(c.details, f, [0, 3.25, 0], [GRAND_STAIRS.halfWidth * 2 + .9, .95, .2], P.graphite);
  for (const side of [1, -1]) physicalSign(c, f, 'WESTCOSE SKATE PARK', 'BOWLS / SNAKE RUN / STREET', [0, 3.25, side * .105], GRAND_STAIRS.halfWidth * 2 + .5, .82, [0, side > 0 ? 0 : Math.PI, 0], true, '#394F51');
}

function buildDowntown() {
  const surfaces = new MeshBuilder(), stairs = new MeshBuilder();
  streets(surfaces);
  for (const c of CUL_DE_SACS) culDeSac(surfaces, c);
  grandStairs(stairs);
  const kit = createKitContext();
  DOWNTOWN_FURNITURE.forEach((item, i) => {
    if (item.kind === 'palm') palm(kit, item.x, item.z, WALK_LEVEL, i * 37 + 11);
    else if (item.kind === 'lamp') lamp(kit, item.x, item.z, WALK_LEVEL, item.yaw);
    else bench(kit, item.x, item.z, WALK_LEVEL, item.yaw);
  });
  plaza(kit, surfaces);
  overlook(kit);
  stairArch(kit);
  // Handrails follow the same lines a skateboard grinds.
  for (const line of skateparkGrindLines().filter(line => line.id.startsWith('stairs:rail'))) {
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], d = b.clone().sub(a), length = d.length();
      kit.details.add(RAIL, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(length)), new THREE.Vector3(.045, length + .01, .045)), '#6E7C7A');
      if (i % 3 === 1) {
        const up = a.clone().normalize();
        kit.details.add(RAIL, new THREE.Matrix4().compose(a.clone().addScaledVector(up, -.45), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), new THREE.Vector3(.035, .9, .035)), '#56645F');
      }
    }
  }
  wayfinding(kit, -21.2, 5.3, 0, 'SKATE PARK ←', 'GRAND STAIRS / WEST BLUFF');
  wayfinding(kit, 6.6, -5.4, 0, 'PIER / BOARDWALK ↓', 'BEACH / FISHING / MOTEL');
  wayfinding(kit, 7.6, 17.2, 0, 'SKI RESORT ↑', 'PALM AVE / FOREST TRAIL');
  wayfinding(kit, 17.4, 5.3, 0, 'SKATE SHOP →', 'DECKS / FREE BOARDS');
  wayfinding(kit, 23.2, -5.3, 0, 'CLIFF CUL-DE-SAC →', 'LIGHTHOUSE TRAIL / GRAFFITI ALLEY');
  for (const batch of [kit.structure, kit.details, kit.plants, kit.glow]) batch.setSurfaceFrame(null);
  return {
    surfaces: surfaces.finish(), stairs: stairs.finish(),
    structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), glow: kit.glow.finish(), signs: kit.signs,
  };
}

/** Lenses, bulbs and fountain water glow in their own vertex colours. */
const tintEmission: THREE.MeshStandardMaterial['onBeforeCompile'] = shader => {
  shader.fragmentShader = shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = emissive;
    #ifdef USE_COLOR
    totalEmissiveRadiance *= vColor.rgb;
    #endif
  `);
};
const glowProgram = () => 'westcose-downtown-tinted-glow-v1';

/** Downtown streets, the grand stairs and the street furniture, as a few batched meshes. */
export default function Downtown() {
  const town = useMemo(() => buildDowntown(), []);
  useEffect(() => () => { for (const g of [town.surfaces, town.stairs, town.structure, town.details, town.plants, town.glow]) g.dispose(); }, [town]);
  return <group name="downtown">
    <mesh name="downtown-streets" geometry={town.surfaces} receiveShadow><meshStandardMaterial vertexColors roughness={.95} /></mesh>
    <mesh name="grand-stairs" geometry={town.stairs} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.95} /></mesh>
    <mesh geometry={town.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.9} /></mesh>
    <mesh geometry={town.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.82} /></mesh>
    <mesh geometry={town.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <mesh geometry={town.glow}><meshStandardMaterial vertexColors roughness={.3} emissive="#ffffff" emissiveIntensity={.62} onBeforeCompile={tintEmission} customProgramCacheKey={glowProgram} /></mesh>
    <SignAtlas signs={town.signs} />
  </group>;
}
