import * as THREE from 'three';
import { CONTENT } from '@/content/registry';
import { interiorFurnitureSegments } from '../../data/building-shapes';
import type { TownBuilding, WallSegment } from '../../data/town-types';
import { block, frame, physicalSign, tube, UNIT_CYLINDER, UNIT_LEAF, type KitContext, type Triple } from '../kit/context';
import { TOWN_PALETTE as P } from '../kit/materials';

const LAMP_SHADE = new THREE.CylinderGeometry(0.35, 1, 1, 8);

/** Batched luminous lenses sit inside actual shades, without extra light sources. */
function wallLamp(c: KitContext, m: THREE.Matrix4, position: Triple, yaw: number) {
  const lamp = frame(m, position, yaw);
  block(c.details, lamp, [0, 0, 0], [0.23, 0.49, 0.07], P.graphite);
  block(c.details, lamp, [0, 0.17, 0.1], [0.046, 0.055, 0.24], P.steel);
  block(c.glow, lamp, [0, -0.015, 0.21], [0.19, 0.32, 0.14], P.amber);
  for (const end of [-1, 1]) block(c.details, lamp, [0, end * 0.21, 0.21], [0.31, 0.075, 0.3], P.steel);
  for (const side of [-1, 1]) block(c.details, lamp, [side * 0.118, 0, 0.304], [0.026, 0.41, 0.025], P.graphite);
  block(c.details, lamp, [0, -0.03, 0.308], [0.25, 0.03, 0.027], P.graphite);
}

function deskLamp(c: KitContext, m: THREE.Matrix4, position: Triple, yaw = 0, color: string = P.blue) {
  const lamp = frame(m, position, yaw);
  tube(c.details, lamp, [0, 0.025, 0], 0.13, 0.05, P.graphite);
  tube(c.details, lamp, [0.028, 0.19, 0], 0.018, 0.3, P.steel, [0, 0, -0.22]);
  tube(c.details, lamp, [0.15, 0.407, 0], 0.018, 0.28, P.steel, [0, 0, -0.91]);
  tube(c.details, lamp, [0.06, 0.327, 0], 0.043, 0.06, color, [Math.PI / 2, 0, 0]);
  c.details.shape(LAMP_SHADE, lamp, [0.27, 0.5, 0], [0.16, 0.15, 0.16], color);
  tube(c.glow, lamp, [0.27, 0.423, 0], 0.133, 0.018, P.warmGlass);
  block(c.details, lamp, [0.032, 0.057, 0.03], [0.038, 0.024, 0.035], P.bone);
}

function mug(c: KitContext, m: THREE.Matrix4, position: Triple, color: string = P.bone) {
  const cup = frame(m, position);
  tube(c.details, cup, [0, 0.09, 0], 0.078, 0.18, color);
  tube(c.details, cup, [0, 0.183, 0], 0.066, 0.008, P.graphite);
  block(c.details, cup, [0.113, 0.09, 0], [0.036, 0.14, 0.04], color);
  for (const y of [0.03, 0.15]) block(c.details, cup, [0.082, y, 0], [0.08, 0.032, 0.041], color);
}

function framedStudy(c: KitContext, m: THREE.Matrix4, position: Triple, width: number, height: number, variant: number) {
  const p = frame(m, position);
  block(c.details, p, [0, 0, 0], [width + 0.1, height + 0.1, 0.075], P.graphite);
  block(c.details, p, [0, 0, 0.046], [width, height, 0.025], P.paper);
  // Original geometric process studies, deliberately not fake client artwork.
  if (variant === 0) {
    c.details.shape(UNIT_CYLINDER, p, [0, height * 0.03, 0.069], [width * 0.3, 0.013, width * 0.3], P.blue, [Math.PI / 2, 0, 0]);
    block(c.details, p, [width * 0.03, -height * 0.08, 0.083], [width * 0.33, height * 0.29, 0.019], P.leaf, [0, 0, 0.22]);
  } else if (variant === 1) {
    for (let i = 0; i < 4; i++) block(c.details, p, [(i - 1.5) * width * 0.16, 0, 0.067], [width * 0.1, height * (0.2 + i * 0.13), 0.02], i % 2 ? P.rust : P.blue);
  } else {
    block(c.details, p, [-width * 0.11, height * 0.1, 0.067], [width * 0.51, height * 0.31, 0.025], P.rust, [0, 0, -0.16]);
    block(c.details, p, [width * 0.14, -height * 0.12, 0.085], [width * 0.35, height * 0.33, 0.022], P.graphite, [0, 0, 0.18]);
  }
  for (let i = 0; i < 2; i++) block(c.details, p, [-width * 0.14, -height * 0.38 - i * 0.06, 0.07], [width * (0.36 - i * 0.11), 0.015, 0.02], P.steel);
}

function table(c: KitContext, m: THREE.Matrix4, furniture: WallSegment, color: string = P.timber) {
  const [x, , z] = furniture.center, [w, h, d] = furniture.size;
  block(c.details, m, [x, h - 0.055, z], [w, 0.11, d], color);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(c.details, m, [x + sx * (w / 2 - 0.12), (h - 0.1) / 2, z + sz * (d / 2 - 0.13)], [0.09, h - 0.1, 0.09], P.graphite);
  block(c.details, m, [x, 0.22, z], [w - 0.15, 0.075, d - 0.17], P.steel);
}

function shelf(c: KitContext, m: THREE.Matrix4, position: Triple, width: number, height: number, depth: number, books = false) {
  const p = frame(m, position);
  for (const x of [-width / 2, width / 2]) block(c.details, p, [x, height / 2, 0], [0.075, height, depth], P.steel);
  const levels = Math.max(3, Math.round(height / 0.48));
  for (let j = 0; j < levels; j++) {
    const y = 0.12 + j * (height - 0.15) / (levels - 1);
    block(c.details, p, [0, y, 0], [width, 0.063, depth], P.timber);
    if (j === levels - 1) continue;
    if (books) for (let i = 0; i < 7; i++) block(c.details, p, [-width * 0.4 + i * width * 0.125, y + 0.21, -0.02], [0.08 + (i % 2) * 0.025, 0.31 + (i % 3) * 0.027, depth * 0.65], [P.rust, P.blue, P.paper, P.graphite][(i + j) % 4], [0, 0, i % 5 === 0 ? 0.07 : 0]);
    else for (let i = 0; i < 3; i++) {
      block(c.details, p, [(i - 1) * width * 0.29, y + 0.17, 0], [width * 0.24, 0.26, depth * 0.8], (i + j) % 2 ? P.plaster : P.steel);
      block(c.details, p, [(i - 1) * width * 0.29, y + 0.17, depth * 0.41], [width * 0.1, 0.07, 0.015], P.paper);
    }
  }
}

function monitor(c: KitContext, m: THREE.Matrix4, position: Triple, width = 0.72, angle = 0, warm = false) {
  const p = frame(m, position, angle);
  block(c.details, p, [0, 0.1, 0], [0.07, 0.2, 0.08], P.graphite);
  block(c.details, p, [0, 0.035, 0.04], [0.35, 0.05, 0.27], P.graphite);
  block(c.details, p, [0, 0.38, 0], [width, width * 0.66, 0.095], P.graphite);
  block(c.glow, p, [0, 0.38, 0.053], [width * 0.89, width * 0.55, 0.022], warm ? P.warmGlass : P.glass);
  for (let j = 0; j < 3; j++) block(c.details, p, [-width * 0.15, 0.4 - j * 0.064, 0.068], [width * (0.38 - j * 0.06), 0.018, 0.012], P.bone);
  block(c.details, p, [0, 0.025, 0.34], [width * 0.81, 0.045, 0.22], P.steel);
}

function roomBase(c: KitContext, b: TownBuilding, m: THREE.Matrix4) {
  const w = b.width - 0.44, d = b.depth - 0.44;
  const timber = b.interior === 'about' || b.interior === 'studio' || b.interior === 'skateshop';
  block(c.details, m, [0, 0.009, 0], [w, 0.018, d], timber ? P.paleTimber : b.interior === 'arcade' ? P.steel : P.concrete);
  const count = Math.floor(w / (timber ? 0.48 : 1.1));
  for (let j = 1; j < count; j++) block(c.details, m, [-w / 2 + j * w / count, 0.021, 0], [0.018, 0.007, d], timber ? P.timber : P.darkConcrete);
  for (const side of [-1, 1]) {
    block(c.details, m, [side * (w / 2 - 0.02), 0.14, 0], [0.045, 0.28, d], P.steel);
    wallLamp(c, m, [side * (w / 2 - 0.025), 2.37, -d * 0.16], -side * Math.PI / 2);
  }
  block(c.details, m, [0, 0.14, -d / 2 + 0.02], [w, 0.28, 0.045], P.steel);
  // Wall-mounted signs and project labels remain physical; long content lives in HTML.
  physicalSign(c, m, 'OUT', undefined, [b.entryOffset + b.entryWidth / 2 + 0.42, 1.95, b.depth / 2 - 0.24], 0.56, 0.32, [0, Math.PI, 0]);
}

function studio(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.24;
  physicalSign(c, m, 'PROJECTS / PROCESS', CONTENT.world.eyebrow, [0, 3.14, back + 0.023], b.width - 1.05, 0.63);
  for (let i = 0; i < 3; i++) framedStudy(c, m, [(i - 1) * 1.55, 1.77, back + 0.07], 1.18, 1.68, i);
  const work = furniture[0]; table(c, m, work, P.paleTimber);
  const [x, , z] = work.center;
  block(c.details, m, [x, 0.97, z + 0.55], [0.82, 0.08, 0.95], P.paper, [0, 0.09, 0]);
  block(c.details, m, [x + 0.08, 1.025, z + 0.55], [0.29, 0.014, 0.58], P.blue, [0, 0.09, 0]);
  monitor(c, m, [x, 0.9, z - 0.66], 0.64, Math.PI / 2);
  deskLamp(c, m, [x - 0.24, 0.9, z + 1.16], Math.PI / 2, P.blue);
  tube(c.details, m, [x - 0.18, 1.055, z + 0.61], 0.043, 0.64, P.paper, [0, 0, Math.PI / 2]);
  for (const end of [-1, 1]) tube(c.details, m, [x - 0.18 + end * 0.324, 1.055, z + 0.61], 0.027, 0.007, P.paleTimber, [0, 0, Math.PI / 2]);
  tube(c.details, m, [x - 0.28, 1.005, z - 1.08], 0.082, 0.21, P.rust);
  for (let i = 0; i < 4; i++) tube(c.details, m, [x - 0.31 + i * 0.021, 1.16 + (i % 2) * 0.025, z - 1.08], 0.008, 0.22, i % 2 ? P.graphite : P.paleTimber, [0, 0, (i - 1.5) * 0.08]);
  const shelfFrame = frame(m, [b.width / 2 - 0.39, 0, -0.8], -Math.PI / 2);
  shelf(c, shelfFrame, [0, 0, 0], 2.65, 1.95, 0.38, true);
  physicalSign(c, shelfFrame, 'WORK IN PROGRESS', undefined, [0, 2.29, 0.03], 2.4, 0.4, [0, 0, 0], true);
  // Flat files under the shared worktable are contained inside its collider.
  for (let j = 0; j < 4; j++) block(c.details, m, [x, 0.35 + j * 0.1, z], [0.89, 0.065, 0.74], j % 2 ? P.concrete : P.paper);
}

function workshop(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.26;
  physicalSign(c, m, 'MADE HERE', CONTENT.services.eyebrow, [0, 3.22, back + 0.02], 4.9, 0.63, [0, 0, 0], true);
  block(c.details, m, [0, 1.87, back + 0.04], [b.width - 1.3, 1.72, 0.09], P.timber);
  for (let x = 0; x < 13; x++) for (let y = 0; y < 4; y++) block(c.details, m, [(x - 6) * 0.44, 1.24 + y * 0.4, back + 0.091], [0.026, 0.026, 0.015], P.graphite);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.72;
    const tool = frame(m, [x, 1.93, back + 0.16]);
    if (i % 3 === 0) {
      block(c.details, tool, [0, -0.05, 0], [0.061, 0.57, 0.075], P.timber, [0, 0, 0.06]);
      block(c.details, tool, [0, 0.22, 0], [0.31, 0.12, 0.095], P.steel);
      block(c.details, tool, [0.15, 0.19, 0], [0.045, 0.13, 0.095], P.graphite, [0, 0, -0.35]);
    } else if (i % 3 === 1) {
      block(c.details, tool, [0, -0.03, 0], [0.072, 0.51, 0.06], P.steel);
      for (const end of [-1, 1]) {
        block(c.details, tool, [0, end * 0.25, 0], [0.16, 0.08, 0.06], P.steel);
        for (const side of [-1, 1]) block(c.details, tool, [side * 0.077, end * 0.3, 0], [0.04, 0.13, 0.06], P.steel);
      }
    } else {
      block(c.details, tool, [0, -0.15, 0], [0.098, 0.24, 0.081], P.rust);
      block(c.details, tool, [0, 0.125, 0], [0.026, 0.34, 0.03], P.steel);
      block(c.details, tool, [0, 0.297, 0], [0.05, 0.043, 0.023], P.steel);
    }
  }
  furniture.forEach((work, i) => {
    table(c, m, work, P.timber);
    const [x, , z] = work.center;
    if (i === 0) {
      block(c.details, m, [x, 1.04, z + 0.87], [0.41, 0.27, 0.5], P.blue);
      block(c.details, m, [x, 1.21, z + 0.87], [0.55, 0.1, 0.29], P.steel);
      block(c.details, m, [x, 0.97, z - 0.7], [0.73, 0.06, 0.95], P.paper);
      tube(c.details, m, [x, 1.04, z + 1.16], 0.021, 0.63, P.graphite, [0, 0, Math.PI / 2]);
      for (const side of [-1, 1]) tube(c.details, m, [x + side * 0.29, 1.04, z + 1.16], 0.052, 0.07, P.steel, [0, 0, Math.PI / 2]);
      deskLamp(c, m, [x - 0.22, 0.9, z - 1.18], Math.PI / 2, P.rust);
    } else {
      for (let j = 0; j < 4; j++) block(c.details, m, [x, 0.96 + j * 0.06, z - 0.1], [0.82, 0.05, 1.76 - j * 0.06], j % 2 ? P.paleTimber : P.timber);
    }
    block(c.details, m, [x, 0.42, z - 0.66], [0.73, 0.4, 0.78], P.steel);
    block(c.details, m, [x, 0.47, z - 0.25], [0.27, 0.055, 0.035], P.bone);
  });
}

function arcadeCabinet(c: KitContext, m: THREE.Matrix4, title: string, main: boolean) {
  block(c.details, m, [0, 0.62, 0], [0.91, 1.24, 0.92], main ? P.rust : P.blue);
  block(c.details, m, [0, 1.38, -0.11], [0.95, 0.74, 0.76], P.graphite);
  block(c.glow, m, [0, 1.43, 0.283], [0.72, 0.48, 0.024], main ? P.warmGlass : P.glass);
  block(c.details, m, [0, 1.04, 0.34], [0.96, 0.1, 0.4], P.steel, [0.14, 0, 0]);
  tube(c.details, m, [-0.19, 1.17, 0.37], 0.045, 0.21, P.graphite);
  tube(c.details, m, [-0.19, 1.29, 0.37], 0.075, 0.1, P.rust);
  for (let i = 0; i < 3; i++) tube(c.details, m, [0.11 + i * 0.1, 1.105, 0.37], 0.035, 0.04, i % 2 ? P.bone : P.rust);
  block(c.details, m, [0, 1.82, -0.04], [1.0, 0.15, 0.8], main ? P.rust : P.steel);
  physicalSign(c, m, title, main ? CONTENT.fightclub.status : 'EXPERIMENT', [0, 1.72, 0.29], 0.79, 0.24, [0, 0, 0], true);
  block(c.details, m, [0, 0.57, 0.471], [0.11, 0.055, 0.023], P.graphite);
  block(c.details, m, [0, 0.55, 0.468], [0.25, 0.27, 0.035], P.steel);
  block(c.details, m, [0, 0.59, 0.49], [0.12, 0.038, 0.018], P.graphite);
  block(c.details, m, [0.063, 0.487, 0.495], [0.046, 0.055, 0.024], P.rust);
  for (const side of [-1, 1]) block(c.details, m, [side * 0.442, 0.65, 0.475], [0.023, 1.12, 0.024], P.paleTimber);
  for (let vent = 0; vent < 4; vent++) block(c.details, m, [(vent - 1.5) * 0.14, 0.23, 0.472], [0.085, 0.018, 0.025], P.graphite);
}

function arcade(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.25;
  physicalSign(c, m, 'WESTCOSE ARCADE', 'GAMES & EXPERIMENTS', [0, 3.12, back + 0.04], 5.3, 0.7, [0, 0, 0], true);
  furniture.forEach((row, sideIndex) => {
    const [x, , z] = row.center;
    for (let i = 0; i < 3; i++) arcadeCabinet(c, frame(m, [x, 0, z + (i - 1) * 1.12], sideIndex === 0 ? Math.PI / 2 : -Math.PI / 2), sideIndex === 0 && i === 1 ? 'FIGHTCLUB' : ['NEXT UP', 'PLAY TEST', 'NEW GAME'][i], sideIndex === 0 && i === 1);
  });
  for (const side of [-1, 1]) {
    block(c.details, m, [side * 1.87, 1.33, back + 0.17], [0.82, 2.34, 0.32], P.steel);
    for (const y of [0.82, 1.69]) c.details.shape(UNIT_CYLINDER, m, [side * 1.87, y, back + 0.345], [0.25, 0.026, 0.25], P.graphite, [Math.PI / 2, 0, 0]);
  }
  physicalSign(c, m, 'GOOD GAMES. GOOD COMPANY.', undefined, [0, 1.99, back + 0.08], 2.35, 0.44);
}

function about(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.25;
  physicalSign(c, m, 'WESTCOSE', CONTENT.about.eyebrow, [0, 3.3, back + 0.027], 4.8, 0.67);
  shelf(c, m, [b.width * 0.19, 0, back + 0.22], b.width * 0.47, 2.37, 0.35, true);
  const work = furniture[0]; table(c, m, work, P.timber);
  const [x, , z] = work.center;
  monitor(c, m, [x - 0.2, 0.85, z - 0.24], 0.78, 0, true);
  block(c.details, m, [x + 0.5, 0.93, z + 0.23], [0.39, 0.065, 0.51], P.paper, [0, 0.12, 0]);
  mug(c, m, [x + 0.54, 0.85, z - 0.14]);
  deskLamp(c, m, [x - 0.6, 0.85, z + 0.39], 0, P.blue);
  for (let i = 0; i < 2; i++) block(c.details, m, [x + 0.47, 0.875 + i * 0.035, z + 0.26], [0.41, 0.025, 0.51], i ? P.paper : P.rust, [0, 0.12, 0]);
  const side = frame(m, [b.width / 2 - 0.24, 0, 0], -Math.PI / 2);
  framedStudy(c, side, [0.49, 1.92, 0.06], 1.08, 1.49, 2);
  physicalSign(c, side, 'A PLACE FOR IDEAS', undefined, [-1.12, 2.12, 0.052], 1.24, 0.55);
  block(c.details, m, [b.width / 2 - 0.71, 0.24, 1.14], [0.62, 0.48, 0.62], P.timber);
  c.plants.shape(UNIT_LEAF, m, [b.width / 2 - 0.71, 0.99, 1.14], [0.48, 0.87, 0.43], P.leaf, [0.05, 1.2, 0.1]);
}

function lab(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.24;
  physicalSign(c, m, 'WESTCOSE LABS', 'SMALL EXPERIMENTS / OPEN POSSIBILITIES', [0, 3.07, back + 0.04], 4.86, 0.65, [0, 0, 0], true);
  furniture.forEach((bench, i) => {
    table(c, m, bench, P.steel);
    const [x, , z] = bench.center, angle = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    monitor(c, m, [x, 0.95, z - 0.62], 0.78, angle, true);
    const device = frame(m, [x, 0.95, z + 0.78], angle);
    block(c.details, device, [0, 0.23, 0], [0.6, 0.46, 0.43], P.plaster);
    block(c.glow, device, [-0.09, 0.28, 0.228], [0.29, 0.22, 0.021], P.glass);
    for (let j = 0; j < 3; j++) block(c.details, device, [0.2, 0.15 + j * 0.093, 0.242], [0.054, 0.054, 0.03], j % 2 ? P.rust : P.graphite);
    block(c.details, device, [0, 0.036, 0.016], [0.64, 0.063, 0.47], P.graphite);
    for (const side of [-1, 1]) block(c.details, device, [side * 0.24, 0.48, 0], [0.045, 0.13, 0.045], P.steel);
    block(c.details, device, [0, 0.543, 0], [0.52, 0.044, 0.045], P.steel);
    for (let vent = 0; vent < 5; vent++) block(c.details, device, [(vent - 2) * 0.071, 0.465, -0.1], [0.041, 0.016, 0.1], P.graphite);
    if (i === 1) deskLamp(c, m, [x - 0.21, 0.95, z - 1.3], 0, P.steel);
    for (let j = 0; j < 3; j++) block(c.details, m, [x, 0.27 + j * 0.17, z], [0.89, 0.13, 0.68], j % 2 ? P.graphite : P.plaster);
  });
  block(c.details, m, [0, 1.99, back + 0.045], [3.12, 1.52, 0.085], P.paper);
  for (let i = 0; i < 7; i++) block(c.details, m, [(i % 4 - 1.5) * 0.62, 2.26 - Math.floor(i / 4) * 0.6, back + 0.101], [0.48, 0.36, 0.023], [P.paleTimber, P.blue, P.rust][i % 3], [0, 0, (i % 3 - 1) * 0.09]);
  physicalSign(c, m, 'SOME IDEAS START HERE.', undefined, [0, 1.04, back + 0.067], 2.56, 0.37);
}

/** A hanging deck: nose and tail kicks, graphic face out, trucks on the back. */
export function hangingDeck(c: KitContext, m: THREE.Matrix4, position: Triple, color: string, stripe: string, yaw = 0, lean = 0) {
  const deck = frame(m, position, yaw);
  const tilt = new THREE.Matrix4().makeRotationX(lean), d = deck.clone().multiply(tilt);
  block(c.details, d, [0, 0, 0], [.21, .64, .028], color);
  for (const end of [-1, 1]) block(c.details, d, [0, end * .36, -.012], [.19, .1, .026], color, [end * .32, 0, 0]);
  block(c.details, d, [0, .06, .016], [.2, .11, .006], stripe);
  block(c.details, d, [0, -.13, .016], [.08, .22, .006], stripe);
  for (const end of [-1, 1]) {
    block(c.details, d, [0, end * .22, -.035], [.17, .03, .04], P.steel);
    for (const side of [-1, 1]) tube(c.details, d, [side * .085, end * .22, -.06], .026, .03, P.bone, [0, 0, Math.PI / 2]);
  }
}

const DECK_GRAPHICS: readonly (readonly [string, string])[] = [
  [P.rust, P.bone], [P.blue, P.amber], [P.bone, P.graphite], ['#D9A441', P.graphite], ['#4F8A7E', P.bone],
  [P.graphite, P.rust], ['#C4553F', '#F1E3C4'], ['#7C93A6', P.graphite], [P.paleTimber, P.blue],
];

function skateshop(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.24;
  // The board wall behind the counter: three rows of decks on a timber backing.
  physicalSign(c, m, 'TAKE A BOARD', 'DECKS / COMPLETES / FREE TO RIDE', [0, 3.72, back + .04], 4.6, .62, [0, 0, 0], true);
  block(c.details, m, [0, 2.05, back + .03], [b.width - .9, 2.7, .06], P.timber);
  for (let row = 0; row < 3; row++) {
    block(c.details, m, [0, 1.12 + row * .86 + .38, back + .08], [b.width - 1.1, .05, .06], P.steel);
    for (let i = 0; i < 9; i++) {
      const [color, stripe] = DECK_GRAPHICS[(i + row * 4) % DECK_GRAPHICS.length];
      hangingDeck(c, m, [(i - 4) * .74, 1.12 + row * .86, back + .16], color, stripe);
    }
  }
  // Counter: a timber front, a pale top, the register and a few wheels and stickers.
  const counter = furniture[0], [cx, , cz] = counter.center, [cw, ch, cd] = counter.size;
  block(c.details, m, [cx, ch / 2 - .03, cz], [cw, ch - .06, cd], P.graphite);
  block(c.details, m, [cx, ch - .03, cz], [cw + .08, .06, cd + .1], P.paleTimber);
  for (let i = 0; i < 7; i++) block(c.details, m, [cx - cw / 2 + .38 + i * .74, ch * .5, cz + cd / 2 + .006], [.46, .52, .012], DECK_GRAPHICS[i % DECK_GRAPHICS.length][0]);
  monitor(c, m, [cx + 1.6, ch, cz - .05], .5, 0, true);
  for (let i = 0; i < 4; i++) tube(c.details, m, [cx - 1.4 + (i % 2) * .09, ch + .03 + Math.floor(i / 2) * .062, cz + (i % 2 ? .05 : -.06)], .029, .058, i % 2 ? P.bone : P.amber, [Math.PI / 2, 0, 0]);
  block(c.details, m, [cx - .5, ch + .04, cz + .12], [.34, .08, .24], P.rust);
  physicalSign(c, m, 'TAKE A BOARD', 'E / TAP AT THE COUNTER', [cx - .2, ch + .33, cz + cd / 2 - .05], 1.1, .3, [0, 0, 0], false);
  block(c.details, m, [cx - .2, ch + .16, cz + cd / 2 - .1], [.06, .3, .06], P.steel);
  // Deck rack on the east wall: completes leaning in slots.
  const rack = furniture[1], [rx, , rz] = rack.center, [, rh, rd] = rack.size;
  block(c.details, m, [rx + .12, .08, rz], [.3, .16, rd], P.graphite);
  block(c.details, m, [rx + .15, rh - .1, rz], [.18, .08, rd], P.steel);
  for (let i = 0; i < 9; i++) {
    const [color, stripe] = DECK_GRAPHICS[(i + 3) % DECK_GRAPHICS.length];
    hangingDeck(c, m, [rx, .52, rz - rd / 2 + .2 + i * (rd - .4) / 8], color, stripe, -Math.PI / 2, -.22);
  }
  // Display table: folded shirts and shoe boxes.
  const table = furniture[2], [tx, , tz] = table.center, [tw, th, td] = table.size;
  block(c.details, m, [tx, th - .05, tz], [tw, .1, td], P.paleTimber);
  block(c.details, m, [tx, (th - .1) / 2, tz], [tw - .2, th - .1, td - .2], P.steel);
  for (let i = 0; i < 6; i++) block(c.details, m, [tx - tw / 2 + .3 + (i % 3) * .5, th + .05 + Math.floor(i / 3) * .08, tz + (i < 3 ? -.25 : .25)], [.4, .07, .34], [P.bone, P.rust, P.blue, P.graphite, P.amber, P.paper][i]);
  // Shoe wall on the west side and a couple of posters.
  const west = frame(m, [-b.width / 2 + .3, 0, .6], Math.PI / 2);
  shelf(c, west, [0, 0, 0], 2.8, 1.9, .34, false);
  physicalSign(c, west, 'WESTCOSE SKATE', 'SINCE LAST SUMMER', [0, 2.34, .02], 2.2, .42, [0, 0, 0], true);
  framedStudy(c, frame(m, [b.width / 2 - .24, 0, -2.2], -Math.PI / 2), [0, 1.95, .05], .8, 1.1, 1);
}

/** Furnishings use the same perimeter bounds as player and camera collision. */
export function addTownInterior(c: KitContext, b: TownBuilding, m: THREE.Matrix4) {
  if (!b.interior) return;
  roomBase(c, b, m);
  const furniture = interiorFurnitureSegments(b);
  ({ studio, workshop, arcade, about, lab, skateshop })[b.interior](c, b, m, furniture);
}
