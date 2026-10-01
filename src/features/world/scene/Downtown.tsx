'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mapDirection, mapFrame, mapPoint } from '../data/world-map';
import { COURTYARD, DOWNTOWN_FURNITURE, downtownCells, downtownMarkings, STREET_LEVEL, WALK_LEVEL, type DowntownKind } from '../data/downtown-layout';
import { GRAND_STAIRS, GRAND_STAIR_TREAD, SKATEPARK, skateparkGrindLines } from '../data/skatepark-layout';
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

function lamp(c: KitContext, x: number, z: number, level: number) {
  const f = mapFrame(x, z, level).matrix;
  // Arms reach toward the carriageway (Main St at z 0, Palm Ave at z 22.5).
  const street = z > 16 ? 22.5 : 0, toward = z > 16 ? (z > street ? -1 : 1) : z > 0 ? -1 : 1;
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

function sculpture(c: KitContext) {
  const [x, z] = COURTYARD.sculpture, f = mapFrame(x, z, WALK_LEVEL).matrix;
  tube(c.structure, f, [0, .12, 0], 2.3, .24, '#BEB9AB');
  tube(c.structure, f, [0, .45, 0], 1.75, .42, '#8E8A7E');
  block(c.structure, f, [0, 1.05, 0], [2.2, .8, 1.3], '#4F5859');
  for (const side of [1, -1]) physicalSign(c, f, 'WESTCOSE', 'DEAD COAST', [0, 1.05, side * .66], 2, .6, [0, side > 0 ? 0 : Math.PI, 0], true, '#4F5859');
  // A curling stone-bronze wave rising off the plinth.
  const wave = '#7D8A86';
  c.structure.shape(TORUS, f, [0, 2.35, 0], [.85, .85, .85], wave, [0, 0, -.25]);
  c.structure.shape(TORUS, f, [.35, 2.05, .05], [.55, .55, .55], '#6E7B78', [0, 0, .55]);
  block(c.structure, f, [0, 1.62, -.25], [.7, .5, 1.1], wave, [.2, 0, 0]);
  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    block(c.structure, f, [dx, .3, dz], [.9, .6, .9], '#BEB9AB');
    c.plants.shape(CONE, f, [dx, .95, dz], [.45, .8, .45], FROND_LIGHT);
  }
}

function wayfinding(c: KitContext, x: number, z: number, yaw: number, top: string, bottom: string) {
  const f = mapFrame(x, z, WALK_LEVEL).matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
  block(c.details, f, [0, 1.05, 0], [.09, 2.1, .09], P.steel);
  block(c.details, f, [0, 1.95, 0], [2.2, .6, .12], P.graphite);
  for (const side of [1, -1]) physicalSign(c, f, top, bottom, [0, 1.95, side * .065], 2.05, .48, [0, side > 0 ? 0 : Math.PI, 0], true);
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
  grandStairs(stairs);
  const kit = createKitContext();
  DOWNTOWN_FURNITURE.forEach((item, i) => {
    if (item.kind === 'palm') palm(kit, item.x, item.z, WALK_LEVEL, i * 37 + 11);
    else if (item.kind === 'lamp') lamp(kit, item.x, item.z, WALK_LEVEL);
    else bench(kit, item.x, item.z, WALK_LEVEL, item.yaw);
  });
  sculpture(kit);
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
  wayfinding(kit, 6.6, -5.4, 0, 'PIER / BOARDWALK ↓', 'BEACH / FISHING');
  wayfinding(kit, 7.2, 16.6, 0, 'SKI RESORT ↑', 'PALM AVE / FOREST TRAIL');
  wayfinding(kit, 14.2, 5.3, 0, 'SKATE SHOP →', 'DECKS / FREE BOARDS');
  for (const batch of [kit.structure, kit.details, kit.plants, kit.glow]) batch.setSurfaceFrame(null);
  return {
    surfaces: surfaces.finish(), stairs: stairs.finish(),
    structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), glow: kit.glow.finish(), signs: kit.signs,
  };
}

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
    <mesh geometry={town.glow}><meshStandardMaterial vertexColors roughness={.3} emissive={P.amber} emissiveIntensity={.55} /></mesh>
    <SignAtlas signs={town.signs} />
  </group>;
}
