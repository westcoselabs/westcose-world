'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildingLocalPoint } from '../data/building-shapes';
import { coordinatesAt, directionAt, frameAt, RADIUS } from '../data/planet';
import { TOWN_BUILDINGS } from '../data/town-layout';
import { surfaceMaterialAt, townSurfaceAt } from '../data/town-surfaces';
import { block } from './kit/context';
import { TOWN_PALETTE as P } from './kit/materials';
import { WeatheredMaterial } from './materials/WeatheredMaterial';
import { SURFACE } from './materials/surface-types';
import { SceneryBatch, variation } from './sceneryGeometry';
import { COASTAL_TREES } from './vegetation/coastalPlanting';

type Point = readonly [number, number];
type Patch = { x: number; z: number; width: number; depth: number; angle: number };
const IDENTITY = new THREE.Matrix4();

/** Small, authored interventions around existing edges, never a new obstacle layer. */
export const STREET_PATINA = {
  treeBeds: [
    'courtyard-shade', 'courtyard-south', 'office-garden', 'studio-side',
    'print-corner', 'print-yard', 'narrow-garden', 'livework-yard', 'cafe-garden',
  ],
  drains: [
    { x: 10.75, z: 9.45, width: 0.34, depth: 1.14, angle: 0 },
    { x: -0.85, z: 9.65, width: 0.72, depth: 0.37, angle: 0.07 },
    { x: -16.19, z: 5.2, width: 0.26, depth: 1.35, angle: 0 },
    { x: -16.39, z: 9.5, width: 0.28, depth: 1.06, angle: -0.08 },
    { x: -21.4, z: 12.83, width: 0.92, depth: 0.32, angle: 0 },
  ] satisfies Patch[],
  manholes: [[-0.7, 6.8], [-19.8, 12.45]] as const,
  repairs: [
    { x: -2.2, z: 5.4, width: 1.18, depth: 0.62, angle: 0.16 },
    { x: 9.9, z: 9.35, width: 0.77, depth: 1.08, angle: -0.13 },
    { x: -14.53, z: 6.4, width: 0.47, depth: 1.3, angle: 0.03 },
    { x: -19.1, z: 12.84, width: 1.15, depth: 0.44, angle: -0.06 },
    { x: 10.65, z: 2.15, width: 0.67, depth: 0.76, angle: 0.14 },
  ] satisfies Patch[],
  channels: [
    [[10.74, 8.25], [10.74, 11.5]],
    [[-16.17, 4.15], [-16.42, 10.15]],
    [[-23.0, 12.82], [-20.5, 12.82]],
  ] as const,
};

function surfacePoint(x: number, z: number, lift: number) {
  const paving = surfaceMaterialAt(x, z) ? 0.035 : 0;
  return directionAt(x / RADIUS, z / RADIUS).multiplyScalar(RADIUS + townSurfaceAt(x, z).height + paving + lift);
}

function groundFrame(x: number, z: number, lift = 0.022, yaw = 0) {
  const f = frameAt(x / RADIUS, z / RADIUS);
  const q = f.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  return new THREE.Matrix4().compose(surfacePoint(x, z, lift), q, new THREE.Vector3(1, 1, 1));
}

function rotatePoint(x: number, z: number, u: number, v: number, angle: number): Point {
  return [x + u * Math.cos(angle) - v * Math.sin(angle), z + u * Math.sin(angle) + v * Math.cos(angle)];
}

/** Preserve chart-space texture coordinates as the patch follows the sphere. */
function groundGeometry(points: readonly Point[], indices: number[], lift: number | readonly number[], kind: number) {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const [i, [x, z]] of points.entries()) {
    const p = surfacePoint(x, z, typeof lift === 'number' ? lift : lift[i]), up = p.clone().normalize();
    positions.push(p.x, p.y, p.z); normals.push(up.x, up.y, up.z); uvs.push(x, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('surfaceUv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('surfaceKind', new THREE.Float32BufferAttribute(points.map(() => kind), 1));
  geometry.setAttribute('surfaceHeight', new THREE.Float32BufferAttribute(points.map(() => 1), 1));
  geometry.setIndex(indices);
  return geometry;
}

function addGround(batch: SceneryBatch, points: readonly Point[], indices: number[], lift: number | readonly number[], kind: number, color: string) {
  const geometry = groundGeometry(points, indices, lift, kind);
  batch.add(geometry, IDENTITY, color); geometry.dispose();
}

function rectangle(batch: SceneryBatch, spec: Patch, lift: number, kind: number, color: string) {
  const across = Math.max(1, Math.ceil(spec.width / 0.35)), along = Math.max(1, Math.ceil(spec.depth / 0.35));
  const points: Point[] = [], indices: number[] = [];
  for (let j = 0; j <= along; j++) for (let i = 0; i <= across; i++) {
    points.push(rotatePoint(spec.x, spec.z, (i / across - 0.5) * spec.width, (j / along - 0.5) * spec.depth, spec.angle));
    if (i < across && j < along) {
      const a = j * (across + 1) + i;
      indices.push(a, a + 1, a + across + 1, a + 1, a + across + 2, a + across + 1);
    }
  }
  addGround(batch, points, indices, lift, kind, color);
}

function stroke(batch: SceneryBatch, a: Point, b: Point, width: number, lift: number, kind: number, color: string) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  rectangle(batch, { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, width: Math.hypot(dx, dz), depth: width, angle: Math.atan2(dz, dx) }, lift, kind, color);
}

function organicPatch(batch: SceneryBatch, x: number, z: number, rx: number, rz: number, seed: number, color: string, lift = 0.017) {
  const points: Point[] = [[x, z]], indices: number[] = [], segments = 18;
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2, scale = 0.91 + variation(seed + i * 1.7) * 0.12;
    points.push([x + Math.cos(angle) * rx * scale, z + Math.sin(angle) * rz * scale]);
    indices.push(0, i + 1, (i + 1) % segments + 1);
  }
  addGround(batch, points, indices, lift, SURFACE.gravel, color);
}

function treeBed(batch: SceneryBatch, id: string, index: number) {
  const tree = COASTAL_TREES.find(t => t.id === id);
  if (!tree) return;
  const { x, z } = tree, rx = index < 2 ? 0.82 : 0.67, rz = index < 2 ? 0.73 : 0.61;
  organicPatch(batch, x, z, rx + 0.1, rz + 0.09, index * 7, '#696B5C', 0.004);
  // Existing bare-ground roots meet a small mound; paved beds need no extra lift.
  const points: Point[] = [[x, z]], indices: number[] = [], segments = 18;
  for (const radius of [0.58, 1]) for (let j = 0; j < segments; j++) {
    const angle = j / segments * Math.PI * 2, uneven = 0.93 + variation(index * 7 + j) * 0.08;
    points.push([x + Math.cos(angle) * rx * radius * uneven, z + Math.sin(angle) * rz * radius * uneven]);
  }
  for (let j = 0; j < segments; j++) {
    const a = j + 1, b = (j + 1) % segments + 1;
    indices.push(0, a, b, a, a + segments, b, b, a + segments, b + segments);
  }
  const lifts = points.map(([px, pz], i) => i > segments ? 0.006 : 0.006 + (surfaceMaterialAt(px, pz) ? 0 : 0.035));
  addGround(batch, points, indices, lifts, SURFACE.gravel, '#575347');
  // A few surviving edging stones suggest a planting opening, not a raised planter.
  for (let i = 0; i < 10; i++) {
    if (i === (index + 3) % 10 || (index % 3 === 1 && i === 7)) continue;
    const angle = i / 10 * Math.PI * 2;
    const px = x + Math.cos(angle) * (rx + 0.075), pz = z + Math.sin(angle) * (rz + 0.07);
    const m = groundFrame(px, pz, 0.023, -angle);
    block(batch, m, [0, 0, 0], [0.115, 0.029, 0.32], i % 3 ? '#AAA696' : P.concrete, [0.035 * Math.sin(i), 0, 0.04 * Math.cos(i)]);
  }
}

function drain(batch: SceneryBatch, spec: Patch) {
  rectangle(batch, { ...spec, width: spec.width + 0.12, depth: spec.depth + 0.12 }, 0.003, SURFACE.plaster, '#989787');
  rectangle(batch, spec, 0.006, SURFACE.metal, P.graphite);
  const horizontal = spec.width > spec.depth;
  const length = horizontal ? spec.width : spec.depth, count = Math.max(5, Math.floor(length / 0.115));
  for (let i = 0; i < count; i++) {
    const offset = (i / (count - 1) - 0.5) * (length - 0.08);
    const bar = horizontal
      ? { ...spec, width: 0.035, depth: spec.depth - 0.035 }
      : { ...spec, width: spec.width - 0.035, depth: 0.035 };
    const p = rotatePoint(spec.x, spec.z, horizontal ? offset : 0, horizontal ? 0 : offset, spec.angle);
    rectangle(batch, { ...bar, x: p[0], z: p[1] }, 0.01, SURFACE.metal, '#647778');
  }
  for (const side of [-1, 1]) {
    const a = rotatePoint(spec.x, spec.z, -spec.width / 2, side * spec.depth / 2, spec.angle);
    const b = rotatePoint(spec.x, spec.z, spec.width / 2, side * spec.depth / 2, spec.angle);
    stroke(batch, a, b, 0.034, 0.01, SURFACE.metal, P.steel);
  }
}

function manhole(batch: SceneryBatch, x: number, z: number) {
  const segments = 24;
  for (const [radius, lift, color] of [[0.45, 0.004, '#AAA696'], [0.392, 0.007, P.graphite], [0.355, 0.01, P.steel]] as const) {
    const points: Point[] = [[x, z]], indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      points.push([x + Math.cos(angle) * radius, z + Math.sin(angle) * radius]);
      indices.push(0, i + 1, (i + 1) % segments + 1);
    }
    addGround(batch, points, indices, lift, SURFACE.metal, color);
  }
  for (let i = -3; i <= 3; i++) {
    const v = i * 0.079, half = Math.sqrt(0.32 ** 2 - v ** 2);
    stroke(batch, [x - half, z + v], [x + half, z + v], 0.018, 0.012, SURFACE.metal, P.graphite);
  }
  for (const side of [-1, 1]) rectangle(batch, { x: x + side * 0.25, z, width: 0.042, depth: 0.096, angle: 0 }, 0.014, SURFACE.metal, P.graphite);
}

function repair(batch: SceneryBatch, spec: Patch, index: number) {
  rectangle(batch, { ...spec, width: spec.width + 0.045, depth: spec.depth + 0.035 }, 0.015, SURFACE.gravel, '#66685C');
  rectangle(batch, spec, 0.02, SURFACE.plaster, index % 2 ? '#ACA897' : '#B5B09F');
  for (let i = 0; i < 4; i++) {
    const u = (i / 3 - 0.5) * spec.width * 0.82, v = spec.depth * 0.47;
    const [x, z] = rotatePoint(spec.x, spec.z, u, v, spec.angle);
    block(batch, groundFrame(x, z, 0.025, -spec.angle), [0, 0, 0], [0.15 + variation(i + index) * 0.11, 0.024, 0.13], i % 2 ? '#AAA696' : P.concrete, [0.03, 0.13 * i, 0.055]);
  }
  const a = rotatePoint(spec.x, spec.z, -spec.width * 0.36, spec.depth * 0.26, spec.angle);
  const b = rotatePoint(spec.x, spec.z, -spec.width * 0.09, spec.depth * 0.06, spec.angle);
  const end = rotatePoint(spec.x, spec.z, spec.width * 0.06, spec.depth * 0.23, spec.angle);
  stroke(batch, a, b, 0.017, 0.026, SURFACE.gravel, '#6C6D60');
  stroke(batch, b, end, 0.014, 0.026, SURFACE.gravel, '#6C6D60');
}

function wallFootRubble(batch: SceneryBatch) {
  const places = [
    { id: 'studio', x: -3.65, z: -1.25 },
    { id: 'print-shop', x: 3.74, z: 0.1 },
    { id: 'about', x: 3.76, z: -1.3 },
  ];
  places.forEach((spec, index) => {
    const building = TOWN_BUILDINGS.find(b => b.id === spec.id)!;
    for (let j = 0; j < 7; j++) {
      const p = buildingLocalPoint(building, [spec.x + (variation(j + index) - 0.5) * 0.15, 0, spec.z + (j - 3) * 0.21]);
      const c = coordinatesAt(p), x = c.lon * RADIUS, z = c.lat * RADIUS;
      if (j === 3) organicPatch(batch, x, z, 0.22, 0.83, 47 + index, '#777668', 0.016);
      block(batch, groundFrame(x, z, 0.023), [0, 0, 0], [0.12 + variation(j * 7) * 0.13, 0.04, 0.11 + variation(j * 11) * 0.07], j % 3 ? '#A39A84' : '#956D51', [0.03, j * 0.71, 0.05]);
    }
  });
}

function fallenLeaves() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, -0.34, 0, 0, 0, 0.09, 0.07, 0.34, 0, 0, 0, 0, 0.5], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]); g.computeVertexNormals();
  return g;
}

function buildPatina() {
  const solids = new SceneryBatch(), litter = new SceneryBatch();
  STREET_PATINA.treeBeds.forEach((id, i) => treeBed(solids, id, i));
  STREET_PATINA.drains.forEach(spec => drain(solids, spec));
  STREET_PATINA.manholes.forEach(([x, z]) => manhole(solids, x, z));
  STREET_PATINA.repairs.forEach((spec, i) => repair(solids, spec, i));
  for (const [a, b] of STREET_PATINA.channels) {
    stroke(solids, a, b, 0.19, 0.016, SURFACE.gravel, '#777A6A');
    stroke(solids, a, b, 0.052, 0.021, SURFACE.metal, '#4F5954');
  }
  wallFootRubble(solids);
  const leaf = fallenLeaves();
  const pockets = [[3.95, 8.67, 0.53], [10.64, 1.25, 0.42], [0.02, 9.82, 0.51], [-16.02, 6.85, 0.26], [-18.95, 12.18, 0.38], [10.95, 10.5, 0.34]];
  pockets.forEach(([x, z, radius], index) => {
    for (let j = 0; j < 12; j++) {
      const angle = j * 2.39996 + index, r = Math.sqrt(variation(j * 3.7 + index)) * radius;
      const px = x + Math.cos(angle) * r, pz = z + Math.sin(angle) * r;
      const length = 0.13 + variation(j + index * 13) * 0.13;
      litter.shape(leaf, groundFrame(px, pz, 0.008, angle), [0, 0, 0], [length, length, length], ['#766D4E', '#91826A', '#657054', '#A68C63'][(index + j) % 4]);
    }
  });
  leaf.dispose();
  return { solids: solids.finish(), litter: litter.finish() };
}

/** Two batched draws of shallow detail; existing walking support stays unchanged. */
export default function StreetPatina() {
  const world = useMemo(() => buildPatina(), []);
  useEffect(() => () => { world.solids.dispose(); world.litter.dispose(); }, [world]);
  return <group name="WestCose / street patina">
    <mesh geometry={world.solids} receiveShadow><WeatheredMaterial /></mesh>
    <mesh geometry={world.litter} receiveShadow><meshStandardMaterial vertexColors roughness={0.94} side={THREE.DoubleSide} /></mesh>
  </group>;
}
