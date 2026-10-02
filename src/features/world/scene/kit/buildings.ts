import * as THREE from 'three';
import { buildingMatrix, buildingWallSegments, DOOR_HEIGHT } from '../../data/building-shapes';
import type { TownBuilding } from '../../data/town-types';
import { SceneryBatch } from '../sceneryGeometry';
import { block, frame, idSeed, physicalSign, tube, UNIT_GABLE, UNIT_LEAF, type KitContext } from './context';
import { TOWN_PALETTE as P } from './materials';
import { addArchitecturalDetails } from './architecturalDetails';
import { addBuildingFoundation } from './foundations';
import { closedDoor, windowModule } from './openings';
import { heroFacade } from './facades';

function roller(c: KitContext, m: THREE.Matrix4, x: number, z: number, width: number, height: number, trim: string) {
  block(c.details, m, [x, height / 2, z], [width + 0.21, height + 0.12, 0.12], trim);
  block(c.details, m, [x, height / 2, z + 0.073], [width, height, 0.06], P.graphite);
  for (let j = 0; j < Math.floor(height / 0.16); j++) block(c.details, m, [x, 0.1 + j * 0.16, z + 0.114], [width - 0.06, 0.034, 0.024], P.steel);
  block(c.details, m, [x, 0.17, z + 0.143], [0.4, 0.056, 0.05], P.bone);
}

function balcony(c: KitContext, m: THREE.Matrix4, width: number, z: number, y: number, color: string) {
  block(c.structure, m, [0, y, z + 0.56], [width, 0.15, 1.22], P.concrete);
  block(c.details, m, [0, y + 0.96, z + 1.15], [width, 0.055, 0.055], color);
  block(c.details, m, [0, y + 0.26, z + 1.15], [width, 0.045, 0.045], color);
  block(c.details, m, [0, y - 0.075, z + 1.19], [width + 0.07, 0.09, 0.11], P.darkConcrete);
  const count = Math.ceil(width / 0.28);
  for (let j = 0; j <= count; j++) block(c.details, m, [(j / count - 0.5) * width, y + 0.48, z + 1.15], [0.04, 0.91, 0.04], color);
  for (const side of [-1, 1]) block(c.details, m, [side * width / 2, y + 0.96, z + 0.6], [0.055, 0.055, 1.16], color);
}

function canopy(c: KitContext, b: TownBuilding, m: THREE.Matrix4, y: number, width: number, stripe: boolean) {
  const z = b.depth / 2 + 0.48;
  if (stripe) {
    const count = Math.round(width / 0.42), section = width / count;
    for (let i = 0; i < count; i++) {
      const x = -width / 2 + section * (i + 0.5), color = i % 2 ? b.accent : P.bone;
      block(c.details, m, [x, y, z], [section, 0.075, 0.94], color, [0.13, 0, 0]);
      block(c.details, m, [x, y - 0.15, z + 0.46], [section, 0.25, 0.055], color);
    }
  } else {
    block(c.structure, m, [0, y, z], [width, 0.14, 1.2], b.accent);
    block(c.details, m, [0, y - 0.1, z + 0.6], [width, 0.17, 0.075], P.bone);
    for (const side of [-1, 1]) block(c.details, m, [side * (width / 2 - 0.22), y - 0.24, b.depth / 2 + 0.2], [0.055, 0.7, 0.055], P.graphite, [0.75, 0, 0]);
  }
}

function roofModule(c: KitContext, b: TownBuilding, m: THREE.Matrix4) {
  let batch = c.structure;
  if (b.interior) {
    batch = c.roofs.get(b.interior) ?? new SceneryBatch(m);
    c.roofs.set(b.interior, batch);
  }
  const { width: w, depth: d, height: h } = b;
  const seed = idSeed(b.id), roofColor = b.secondary ? P.steel : P.graphite;
  block(batch, m, [0, h + 0.035, 0], [w + 0.25, 0.14, d + 0.27], roofColor);
  if (b.roof === 'gable') {
    const rise = b.archetype === 'cottage' ? 1.05 : b.archetype === 'arcade' ? 0.8 : 0.67;
    const angle = Math.atan2(rise, w / 2);
    for (const side of [-1, 1]) block(batch, m, [side * w / 4, h + rise / 2 + 0.12, 0], [Math.hypot(w / 2, rise) + 0.23, 0.15, d + 0.43], roofColor, [0, 0, -side * angle]);
    for (const side of [-1, 1]) for (let seam = 0; seam <= Math.ceil(d / 0.77); seam++) {
      const z = -d / 2 + seam * d / Math.ceil(d / 0.77);
      block(batch, m, [side * w / 4, h + rise / 2 + 0.211, z], [Math.hypot(w / 2, rise) + 0.22, 0.027, 0.036], P.steel, [0, 0, -side * angle]);
    }
    for (const side of [-1, 1]) tube(batch, m, [side * (w / 2 + 0.14), h + 0.08, 0], 0.073, d + 0.43, P.steel, [Math.PI / 2, 0, 0]);
    block(batch, m, [0, h + rise + 0.13, 0], [0.16, 0.14, d + 0.44], b.trim);
    batch.shape(UNIT_GABLE, m, [0, h, 0], [w, rise, d], b.color);
  } else if (b.roof === 'sawtooth') {
    const teeth = b.archetype === 'warehouse' ? 3 : 2, segment = d / teeth;
    for (let j = 0; j < teeth; j++) {
      const z = -d / 2 + segment * (j + 0.5), rise = 0.85;
      block(batch, m, [0, h + rise / 2 + 0.12, z], [w + 0.32, 0.16, Math.hypot(segment, rise) + 0.12], roofColor, [Math.atan2(rise, segment), 0, 0]);
      for (let seam = 0; seam <= Math.ceil(w / 0.79); seam++) block(batch, m, [-w / 2 + seam * w / Math.ceil(w / 0.79), h + rise / 2 + 0.223, z], [0.034, 0.026, Math.hypot(segment, rise) + 0.11], P.steel, [Math.atan2(rise, segment), 0, 0]);
      block(batch, m, [0, h + 0.5, z - segment / 2], [w - 0.1, 0.8, 0.1], P.glass);
      for (let jx = 0; jx < 5; jx++) block(batch, m, [(jx / 4 - 0.5) * (w - 0.12), h + 0.5, z - segment / 2 - 0.065], [0.055, 0.87, 0.055], P.bone);
    }
  } else if (b.roof === 'lean') {
    const rise = 0.48;
    block(batch, m, [0, h + rise / 2 + 0.09, 0], [w + 0.45, 0.17, Math.hypot(d, rise) + 0.33], roofColor, [Math.atan2(rise, d), 0, 0]);
    for (let seam = 0; seam <= Math.ceil(w / 0.74); seam++) block(batch, m, [-w / 2 + seam * w / Math.ceil(w / 0.74), h + rise / 2 + 0.187, 0], [0.033, 0.027, Math.hypot(d, rise) + 0.3], P.steel, [Math.atan2(rise, d), 0, 0]);
    block(batch, m, [0, h + 0.25, -d / 2], [w, 0.48, 0.14], b.color);
  } else {
    for (const side of [-1, 1]) {
      block(batch, m, [side * (w / 2 - 0.06), h + 0.27, 0], [0.16, 0.51, d], b.color);
      block(batch, m, [0, h + 0.27, side * (d / 2 - 0.06)], [w, 0.51, 0.16], b.color);
      block(batch, m, [0, h + 0.54, side * d / 2], [w + 0.18, 0.1, 0.23], b.trim);
      for (let cap = 0; cap < Math.ceil(w / 0.77); cap++) {
        const length = w / Math.ceil(w / 0.77);
        block(batch, m, [-w / 2 + (cap + 0.5) * length, h + 0.62, side * d / 2], [length - 0.026, 0.09, 0.29], cap % 4 === 1 ? P.plaster : P.concrete);
      }
      for (let cap = 0; cap < Math.ceil(d / 0.77); cap++) {
        const length = d / Math.ceil(d / 0.77);
        block(batch, m, [side * w / 2, h + 0.62, -d / 2 + (cap + 0.5) * length], [0.29, 0.09, length - 0.026], cap % 4 === 1 ? P.plaster : P.concrete);
      }
    }
    for (let seam = 1; seam < Math.ceil(w); seam++) block(batch, m, [-w / 2 + seam * w / Math.ceil(w), h + 0.113, 0], [0.027, 0.013, d - 0.25], P.steel);
  }
  if (b.roof !== 'gable') tube(batch, m, [0, h + 0.035, d / 2 + 0.16], 0.078, w + 0.36, P.steel, [0, 0, Math.PI / 2]);
  if (!b.secondary) {
    const ventX = w * (seed % 2 ? -0.25 : 0.22);
    block(batch, m, [ventX, h + 0.51, -d * 0.18], [1.04, 0.64, 0.76], P.steel);
    for (let j = 0; j < 5; j++) block(batch, m, [ventX, h + 0.28 + j * 0.1, -d * 0.18 + 0.39], [0.85, 0.03, 0.04], P.graphite);
    tube(batch, m, [-ventX, h + 0.77, -d * 0.24], 0.13, 1.3, P.steel);
    block(batch, m, [-ventX, h + 1.44, -d * 0.24], [0.43, 0.07, 0.43], P.graphite);
    if (b.id === 'water-works' || b.id === 'apartments') {
      tube(batch, m, [0, h + 1.16, 0], 1.06, 1.58, P.steel);
      tube(batch, m, [0, h + 1.98, 0], 1.1, 0.11, P.graphite);
      for (const side of [-1, 1]) block(batch, m, [side * 0.7, h + 0.23, 0], [0.1, 0.44, 1.43], P.graphite);
    }
  }
}

function exteriorStair(c: KitContext, b: TownBuilding, m: THREE.Matrix4, target: number) {
  const x = b.width / 2 + 0.48, steps = 13, run = Math.min(4.4, b.depth - 0.5), rise = target / steps;
  for (let i = 0; i < steps; i++) {
    const z = b.depth / 2 - run * (i + 0.5) / steps;
    block(c.details, m, [x, (i + 1) * rise, z], [0.9, 0.075, run / steps + 0.07], P.steel);
    if (i % 3 === 0) block(c.details, m, [x + 0.42, (i + 1) * rise + 0.44, z], [0.044, 0.92, 0.044], P.graphite);
  }
  block(c.details, m, [x + 0.42, target / 2 + 0.8, b.depth / 2 - run / 2], [0.055, 0.055, Math.hypot(run, target)], P.graphite, [Math.atan2(target, run), 0, 0]);
}

export function addTownBuilding(c: KitContext, b: TownBuilding) {
  const m = buildingMatrix(b), w = b.width, d = b.depth, h = b.height, fz = d / 2 + 0.035;
  for(const batch of [c.structure,c.details,c.plants,c.glow])batch.setSurfaceFrame(m);
  const seed = idSeed(b.id);
  const overhead = b.interior ? new SceneryBatch(m) : c.structure;
  if (b.interior) c.roofs.set(b.interior, overhead);
  for (const wall of buildingWallSegments(b)) block(b.interior && wall.id.endsWith(':header') ? overhead : c.structure, m, [...wall.center], [...wall.size], b.color);
  // The slab surface is local Y=0, shared exactly with radial floor support.
  block(c.structure, m, [0, -0.105, 0], [w + 0.12, 0.21, d + 0.12], P.darkConcrete);
  addBuildingFoundation(c.structure, b, m, P.darkConcrete);
  if (!b.interior) block(c.details, m, [0, 0.25, fz], [w + 0.045, 0.48, 0.08], b.secondary ? P.steel : P.darkConcrete);
  if (b.interior) {
    // Keep the threshold clear; no solid trim or shutter crosses the doorway.
    const doorLeft = b.entryOffset - b.entryWidth / 2, doorRight = b.entryOffset + b.entryWidth / 2;
    block(c.details, m, [(-w / 2 + doorLeft) / 2, .25, fz], [doorLeft + w / 2, .48, .08], P.darkConcrete);
    block(c.details, m, [(w / 2 + doorRight) / 2, .25, fz], [w / 2 - doorRight, .48, .08], P.darkConcrete);
    // Cover the plinth only beside the opening, never through it.
    block(c.details, m, [b.entryOffset, 0.011, fz], [b.entryWidth + 0.04, 0.025, 0.13], P.concrete);
    if (!b.facade) {
      for (const x of [doorLeft - 0.09, doorRight + 0.09]) block(c.details, m, [x, DOOR_HEIGHT / 2, fz + 0.045], [0.16, DOOR_HEIGHT, 0.16], b.trim);
      block(overhead, m, [b.entryOffset, DOOR_HEIGHT + 0.04, fz + 0.045], [b.entryWidth + 0.34, 0.18, 0.18], b.trim);
    }
    block(c.details, m, [b.entryOffset, -0.055, d / 2 + 0.39], [b.entryWidth + 0.46, 0.11, 0.9], P.concrete);
    // Shop windows fill the front either side of the doorway, wherever the door sits.
    if (!b.facade) for (const [a, z] of [[-w / 2 + 0.45, doorLeft - 0.4], [doorRight + 0.4, w / 2 - 0.45]]) {
      if (z - a > 0.7) windowModule(c, m, (a + z) / 2, 1.58, fz + 0.06, Math.min(z - a, 3.2), b.archetype === 'warehouse' ? 1.1 : 1.73, b.trim, b.interior !== 'arcade');
    }
  } else if (b.facade) {
    // Drawn by heroFacade below.
  } else if (b.secondary || b.archetype === 'shed') {
    const dw = Math.min(1.05, w * 0.42);
    closedDoor(c, m, -w * 0.1, fz, dw, b.accent, false);
    for (let j = 0; j < Math.floor(w / 0.36); j++) block(c.details, m, [-w / 2 + 0.15 + j * 0.36, h / 2, -d / 2 - 0.02], [0.035, h - 0.12, 0.035], P.steel);
    if (w > 3.2) windowModule(c, m, w * 0.29, 1.66, fz, 0.67, 0.51, b.trim);
  } else if (['warehouse', 'garage'].includes(b.archetype)) {
    roller(c, m, -w * 0.12, fz, w * 0.58, Math.min(3.4, h - 0.7), b.trim);
    closedDoor(c, m, w * 0.36, fz, 0.83, b.accent);
  } else if (b.archetype === 'motel') {
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * w / 4;
      closedDoor(c, m, x - 0.43, fz, 0.78, b.accent);
      windowModule(c, m, x + 0.49, 1.4, fz, 0.75, 1.0, b.trim, i === 1);
    }
  } else if (['market', 'corner', 'livework'].includes(b.archetype)) {
    closedDoor(c, m, w * 0.32, fz, 0.88, b.accent);
    windowModule(c, m, -w * 0.15, 1.47, fz + 0.04, w * 0.56, 1.79, b.trim, b.archetype === 'market');
    block(c.details, m, [-w * 0.15, 0.43, fz + 0.09], [w * 0.62, 0.17, 0.18], b.accent);
    // A plaque between the door and the corner names whoever works upstairs.
    if (b.doorSign) {
      block(c.details, m, [w * 0.32 + 0.78, 1.62, fz + 0.045], [0.64, 0.42, 0.05], P.steel);
      physicalSign(c, m, b.doorSign.title, b.doorSign.subtitle, [w * 0.32 + 0.78, 1.62, fz + 0.075], 0.56, 0.34, [0, 0, 0], true);
    }
  } else {
    closedDoor(c, m, 0, fz, 1.08, b.accent);
    for (const side of [-1, 1]) windowModule(c, m, side * w * 0.3, 1.49, fz + 0.03, w * 0.21, 1.26, b.trim, side > 0, b.archetype === 'cottage');
  }
  if (!b.secondary && h > 5 && !b.facade) {
    const y = b.interior ? h - 0.76 : b.archetype === 'motel' ? 4.74 : h - 1.22;
    const upperHeight = b.interior ? 0.78 : 1.2;
    const columns = b.archetype === 'motel' ? 4 : w > 8 ? 3 : 2;
    for (let j = 0; j < columns; j++) windowModule(c, m, (j / Math.max(1, columns - 1) - 0.5) * w * 0.61, y, fz, Math.min(1.24, w / columns * 0.5), upperHeight, b.trim, (seed + j) % 4 === 0, b.archetype === 'cottage');
    if (b.balcony && !b.interior) balcony(c, m, w * 0.94, fz, y - 0.84, P.graphite);
  }
  if (!b.secondary && !b.facade) for (const side of [-1, 1]) {
    const sideFrame = frame(m, [side * (w / 2 + 0.025), 0, 0], side * Math.PI / 2);
    for (let j = 0; j < 2; j++) windowModule(c, sideFrame, (j - 0.5) * d * 0.46, Math.min(2.75, h - 1.15), 0.02, Math.min(1.18, d * 0.2), 1.28, b.trim, false);
  }
  heroFacade(c, b, m, overhead);
  if (b.awning && !b.facade) canopy(b.interior ? { ...c, structure: overhead, details: overhead } : c, b, m, b.interior ? DOOR_HEIGHT + 0.25 : 2.72, w * 0.94, !b.interior && b.archetype !== 'market');
  if (b.exteriorStair) exteriorStair(c, b, m, Math.min(3.75, h - 2.2));
  if (b.sign && !b.facade) {
    const signY = b.interior ? Math.min(h - 0.65, 3.56) : Math.min(h - 0.6, 3.29);
    const signWidth = Math.min(w - 0.32, b.sign.length > 17 ? w * 0.97 : w * 0.84);
    const balconyY = (b.archetype === 'motel' ? 4.74 : h - 1.22) - .84;
    const atBalconyRail = b.balcony && !b.interior && h > 5 && balconyY < signY && balconyY + .96 > signY;
    const signZ = fz + (atBalconyRail ? 1.21 : 0.17);
    block(b.interior ? overhead : c.details, m, [0, signY, signZ], [signWidth + 0.15, 0.81, 0.12], b.archetype === 'arcade' ? b.accent : b.trim);
    physicalSign(c, m, b.sign, b.subtitle, [0, signY, signZ + 0.069], signWidth, 0.64, [0, 0, 0], b.archetype !== 'cottage' && b.archetype !== 'office', undefined, b.interior);
  }
  // Sun-bleached corner bands, rain pipes and small maintenance details.
  for (const side of [-1, 1]) {
    block(c.details, m, [side * (w / 2 - 0.055), h / 2, fz], [0.12, h, 0.1], b.trim);
    tube(c.details, m, [side * (w / 2 - 0.23), h / 2, -d / 2 - 0.035], 0.043, h, P.steel);
  }
  if (b.archetype === 'warehouse' || b.secondary) {
    for (let j = 0; j < Math.floor(w / 0.5); j++) block(c.details, m, [-w / 2 + 0.17 + j * 0.5, h * 0.53, -d / 2 - 0.03], [0.046, h * 0.85, 0.04], P.steel);
  }
  if (!b.secondary && seed % 3 === 0) {
    const x = -w / 2 + 0.41, z = fz + 0.37;
    block(c.details, m, [x, 0.29, z], [0.65, 0.58, 0.65], P.rust);
    block(c.details, m, [x, 0.59, z], [0.6, 0.025, 0.6], P.soil);
    c.plants.shape(UNIT_LEAF, m, [x, 0.93, z], [0.39, 0.61, 0.37], P.leaf, [0.1, seed, 0.1]);
  }
  if (!b.secondary && seed % 4 === 1) {
    block(c.details, m, [w * 0.3, 0.44, -d / 2 - 0.44], [0.7, 0.88, 0.7], P.steel);
    block(c.details, m, [w * 0.3, 0.9, -d / 2 - 0.44], [0.78, 0.06, 0.78], P.graphite);
  }
  addArchitecturalDetails(c, b, m);
  roofModule(c, b, m);
  return m;
}
