import * as THREE from 'three';
import type { TownBuilding } from '../../data/town-types';
import { block, frame, idSeed, tube, type KitContext, type Triple } from './context';
import { TOWN_PALETTE as P } from './materials';

export const TRELLIS_BUILDING_IDS = ['print-shop', 'cafe', 'livework', 'coast-radio'] as const;
export type TrellisFrame = { position: Triple; yaw: number; width: number; height: number };
export type WindowBoxFrame = { position: Triple; yaw: number; width: number; depth: number };

/** Geometry and climbing plants share these building-local, outward-facing anchors. */
export function trellisFrameFor(b: TownBuilding): TrellisFrame | null {
  if (!(TRELLIS_BUILDING_IDS as readonly string[]).includes(b.id)) return null;
  const height = Math.min(3.6, b.height - 0.8);
  if (b.id === 'cafe') return { position: [0, height / 2 + 0.15, -b.depth / 2 - 0.09], yaw: Math.PI, width: 2.0, height };
  const side = b.id === 'studio' || b.id === 'livework' ? -1 : 1;
  return { position: [side * (b.width / 2 + 0.09), height / 2 + 0.15, 0], yaw: side * Math.PI / 2, width: b.depth > 5 ? 1.35 : 1.05, height };
}

export function windowBoxFramesFor(b: TownBuilding): WindowBoxFrame[] {
  if (!['print-shop', 'livework', 'motel', 'duplex'].includes(b.id)) return [];
  const upperY = b.archetype === 'motel' ? 4.74 : b.height - 1.22;
  const balcony = Boolean(b.balcony);
  return [-1, 1].map(side => ({
    position: [side * b.width * 0.305, balcony ? upperY + 0.17 : upperY - 0.93, b.depth / 2 + (balcony ? 1.35 : 0.29)],
    yaw: 0, width: 1.05, depth: 0.31,
  }));
}

function facadeDoorRanges(b: TownBuilding): [number, number][] {
  const w = b.width;
  const around = (x: number, width: number): [number, number] => [x - width / 2 - 0.12, x + width / 2 + 0.12];
  if (b.interior) return [around(b.entryOffset, b.entryWidth)];
  if (b.facade === 'motel-rooms') return Array.from({ length: 3 }, (_, i) => around(w / 2 - w / 3 * (i + .5) - .62, 1.1));
  if (b.secondary || b.archetype === 'shed') return [around(-w * 0.1, Math.min(1.05, w * 0.42))];
  if (b.archetype === 'warehouse' || b.archetype === 'garage') return [around(-w * 0.12, w * 0.58), around(w * 0.36, 0.83)];
  if (b.archetype === 'motel') return Array.from({ length: 4 }, (_, i) => around((i - 1.5) * w / 4 - 0.43, 0.78));
  if (['market', 'corner', 'livework'].includes(b.archetype)) return [around(w * 0.32, 0.88)];
  return [around(0, 1.08)];
}

/** Broken bonds and recessed mortar read at walking scale without noisy texture. */
function masonry(c: KitContext, m: THREE.Matrix4, width: number, rows: number, seed: number, exclusions: [number, number][] = [], base = 0.065, brickHeight = 0.22) {
  const brickWidth = 0.58, gap = 0.033;
  const colorSet = [P.darkConcrete, P.concrete, '#a39a84', P.plaster];
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? -brickWidth / 2 : 0;
    for (let i = -1; i < Math.ceil(width / brickWidth) + 1; i++) {
      const left = Math.max(-width / 2, -width / 2 + i * brickWidth + offset);
      const right = Math.min(width / 2, -width / 2 + (i + 1) * brickWidth + offset);
      if (right - left < 0.13 || exclusions.some(([a, z]) => right > a && left < z)) continue;
      const stoneSeed = (seed + row * 19 + i * 7) >>> 0;
      const relief = 0.044 + (stoneSeed % 3) * 0.012;
      block(c.details, m, [(left + right) / 2, base + row * brickHeight + brickHeight / 2, relief / 2], [right - left - gap, brickHeight - 0.026, relief], colorSet[stoneSeed % colorSet.length]);
    }
  }
  // A narrow overhanging weathering course keeps the masonry base deliberate.
  const capY = base + rows * brickHeight + 0.045;
  for (let i = 0; i < Math.ceil(width / 0.78); i++) {
    const left = -width / 2 + i * 0.78, right = Math.min(width / 2, left + 0.78);
    if (exclusions.some(([a, z]) => right > a && left < z)) continue;
    block(c.details, m, [(left + right) / 2, capY, 0.045], [right - left - 0.018, 0.09, 0.145], i % 4 === 1 ? P.plaster : P.concrete);
  }
}

function exteriorLamp(c: KitContext, m: THREE.Matrix4, position: Triple) {
  const lamp = frame(m, position);
  block(c.details, lamp, [0, 0, 0], [0.17, 0.27, 0.075], P.graphite);
  block(c.details, lamp, [0, 0.1, 0.115], [0.045, 0.05, 0.23], P.steel);
  block(c.glow, lamp, [0, -0.06, 0.23], [0.15, 0.24, 0.13], P.amber);
  block(c.details, lamp, [0, 0.095, 0.23], [0.28, 0.065, 0.25], P.graphite);
  block(c.details, lamp, [0, -0.21, 0.23], [0.22, 0.055, 0.2], P.graphite);
  for (const side of [-1, 1]) block(c.details, lamp, [side * 0.105, -0.06, 0.315], [0.023, 0.28, 0.024], P.steel);
}

function servicePanel(c: KitContext, b: TownBuilding, m: THREE.Matrix4) {
  const back = frame(m, [b.width * 0.21, 0, -b.depth / 2 - 0.055], Math.PI);
  block(c.details, back, [0, 1.37, 0], [0.53, 0.78, 0.13], P.steel);
  block(c.details, back, [0, 1.37, 0.073], [0.45, 0.67, 0.035], P.concrete);
  block(c.details, back, [0.13, 1.28, 0.101], [0.04, 0.13, 0.028], P.graphite);
  block(c.details, back, [-0.025, 1.5, 0.101], [0.2, 0.13, 0.027], P.glass);
  tube(c.details, back, [-0.11, 2.37, -0.035], 0.022, 1.22, P.graphite);
  block(c.details, back, [0.28, 2.96, -0.035], [0.82, 0.044, 0.05], P.graphite);
  for (let i = 0; i < 3; i++) block(c.details, back, [-0.11, 1.94 + i * 0.4, 0.004], [0.1, 0.035, 0.035], P.steel);
}

export function addArchitecturalDetails(c: KitContext, b: TownBuilding, m: THREE.Matrix4) {
  const { width: w, depth: d, height: h } = b, seed = idSeed(b.id);
  const front = frame(m, [0, 0, d / 2 + 0.091]);
  // All entries are explicitly excluded from the front stonework.
  masonry(c, front, w - 0.12, 2, seed, facadeDoorRanges(b), 0.06, 0.18);
  if (!b.secondary) {
    for (const side of [-1, 1]) masonry(c, frame(m, [side * (w / 2 + 0.027), 0, 0], side * Math.PI / 2), d - 0.08, 3, seed + 13 + side);
    masonry(c, frame(m, [0, 0, -d / 2 - 0.026], Math.PI), w - 0.1, 3, seed + 41);
    if (!['warehouse', 'garage', 'shed', 'lab'].includes(b.archetype)) {
      for (const side of [-1, 1]) for (let i = 0; i < Math.floor((h - 0.4) / 0.31); i++) {
        const broad = i % 2 === 0;
        block(c.details, m, [side * (w / 2 - (broad ? 0.12 : 0.06)), 0.22 + i * 0.31, d / 2 + 0.077], [broad ? 0.31 : 0.18, 0.265, 0.12], i % 5 === 2 ? P.plaster : P.concrete);
      }
    }
    // A repaired exposed patch sits underneath selected trellises, below windows.
    if ((TRELLIS_BUILDING_IDS as readonly string[]).includes(b.id)) {
      const t = trellisFrameFor(b)!;
      const side = frame(m, [t.position[0], 0, t.position[2]], t.yaw);
      masonry(c, side, t.width + 0.25, 4, seed + 53, [], 0.88, 0.22);
    }
    servicePanel(c, b, m);
    for (const side of [-1, 1]) exteriorLamp(c, m, [side * (w / 2 - 0.37), Math.min(2.8, h - 0.65), d / 2 + 0.08]);
  }
  // One front corner downpipe and visible straps join the upper gutter.
  const pipeX = (seed % 2 ? -1 : 1) * (w / 2 - 0.23), pipeZ = d / 2 + 0.14;
  tube(c.details, m, [pipeX, h / 2 - 0.03, pipeZ], 0.046, h - 0.22, P.steel);
  for (let y = 0.62; y < h - 0.25; y += 1.35) block(c.details, m, [pipeX, y, pipeZ + 0.013], [0.145, 0.053, 0.14], P.graphite);
  block(c.details, m, [pipeX, h - 0.2, pipeZ], [0.18, 0.25, 0.17], P.steel);
  tube(c.details, m, [pipeX, 0.1, pipeZ + 0.085], 0.052, 0.25, P.steel, [Math.PI / 4, 0, 0]);
  const trellis = trellisFrameFor(b);
  if (trellis) {
    const t = frame(m, trellis.position, trellis.yaw);
    for (let i = 0; i < 4; i++) block(c.details, t, [(i / 3 - 0.5) * trellis.width, 0, 0.036], [0.036, trellis.height, 0.045], P.timber);
    for (let i = 0; i < 8; i++) block(c.details, t, [0, (i / 7 - 0.5) * trellis.height, 0.061], [trellis.width + 0.1, 0.037, 0.036], P.timber);
  }
  for (const anchor of windowBoxFramesFor(b)) {
    const box = frame(m, anchor.position, anchor.yaw);
    block(c.details, box, [0, -0.105, 0], [anchor.width, 0.04, anchor.depth], P.timber);
    for (const side of [-1, 1]) {
      block(c.details, box, [0, 0, side * anchor.depth / 2], [anchor.width, 0.24, 0.047], P.timber);
      block(c.details, box, [side * anchor.width / 2, 0, 0], [0.047, 0.24, anchor.depth], P.timber);
      block(c.details, box, [side * anchor.width * 0.32, -0.07, anchor.depth / 2 + 0.028], [0.035, 0.34, 0.035], P.graphite);
    }
    block(c.details, box, [0, 0.075, 0], [anchor.width - 0.09, 0.018, anchor.depth - 0.07], P.soil);
  }
}
