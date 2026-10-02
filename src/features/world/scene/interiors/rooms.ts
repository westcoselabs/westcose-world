import * as THREE from 'three';
import { CONTENT } from '@/content/registry';
import { interiorFurnitureSegments } from '../../data/building-shapes';
import type { TownBuilding, WallSegment } from '../../data/town-types';
import { capRow, foldedStacks, GARMENTS, garmentRail, mannequin } from '../kit/apparel';
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
  const timber = b.interior === 'about' || b.interior === 'studio' || b.interior === 'skateshop' || b.interior === 'workshop';
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
  const back = -b.depth / 2 + 0.24, w = b.width, d = b.depth, h = b.height;
  // The feature wall: the programme title and three large works under track lights.
  physicalSign(c, m, 'PROJECTS / PROCESS', CONTENT.world.eyebrow, [0, 4.45, back + 0.023], 6.2, 0.8);
  for (let i = 0; i < 3; i++) framedStudy(c, m, [(i - 1) * 2.7, 2.35, back + 0.07], 1.9, 2.4, i);
  for (let i = 0; i < 3; i++) {
    block(c.details, m, [(i - 1) * 2.7, h - .55, back + 1.1], [.08, .08, 2.1], P.graphite);
    block(c.glow, m, [(i - 1) * 2.7, h - .62, back + 1.75], [.18, .06, .18], P.warmGlass);
  }
  // Hung works along both long walls, a hanging rail above each.
  for (const side of [-1, 1]) {
    const wall = frame(m, [side * (w / 2 - 0.24), 0, 0], -side * Math.PI / 2);
    block(c.details, wall, [0, 3.65, .03], [d - 1.4, .05, .05], P.steel);
    for (let i = 0; i < 3; i++) framedStudy(c, wall, [(i - 1) * 2.55, 2.05, 0.06], 1.35, 1.7, (i + (side > 0 ? 1 : 2)) % 3);
  }
  // A long skylight glow down the centre of the hall.
  block(c.glow, m, [0, h - .3, 0], [1.1, .05, d - 2.4], '#E9E1CC');
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
  // Flat files under the shared worktable are contained inside its collider.
  for (let j = 0; j < 4; j++) block(c.details, m, [x, 0.35 + j * 0.1, z], [0.89, 0.065, 0.74], j % 2 ? P.concrete : P.paper);
  // The flat-file chest opposite, with prints laid out on top.
  const files = furniture[1], [fx, , fz] = files.center, [fw, fh, fd] = files.size;
  block(c.details, m, [fx, fh / 2, fz], [fw, fh, fd], P.steel);
  for (let j = 0; j < 5; j++) block(c.details, m, [fx + fw / 2 + .005, .14 + j * .16, fz], [.012, .1, fd - .2], P.graphite);
  for (let j = 0; j < 3; j++) block(c.details, m, [fx, fh + .012 + j * .004, fz - fd / 3 + j * fd / 3], [fw * .7, .008, fd * .26], [P.paper, P.rust, P.blue][j], [0, .1 * j, 0]);
  // On the plinth: a model of the little planet itself.
  const plinth = furniture[2], [px, , pz] = plinth.center, [pw, ph, pd] = plinth.size;
  block(c.details, m, [px, ph / 2, pz], [pw, ph, pd], P.bone);
  c.details.shape(UNIT_LEAF, m, [px, ph + .42, pz], [.42, .42, .42], '#3F6371');
  c.plants.shape(UNIT_LEAF, m, [px - .08, ph + .62, pz + .05], [.2, .16, .2], P.leaf, [.3, 0, .2]);
  block(c.details, m, [px + .1, ph + .78, pz], [.05, .14, .05], P.bone);
  physicalSign(c, m, 'WESTCOSE WORLD', 'A SMALL PLANET / WORK IN PROGRESS', [px, ph - .26, pz + pd / 2 + .006], pw * .86, .34, [0, 0, 0], true);
  const shelfFrame = frame(m, [-(w / 2 - 0.39), 0, d / 2 - 1.9], Math.PI / 2);
  shelf(c, shelfFrame, [0, 0, 0], 1.6, 1.95, 0.38, true);
}

/** The WestCose Shop sells clothing: a garment wall and caps behind the cash wrap, racks down both
 * side walls, folded tees on two tables, a fitting room and mannequins in the front windows. The
 * furniture list (building-shapes.ts) is read by index, in this order. */
function clothingStore(c: KitContext, b: TownBuilding, m: THREE.Matrix4, furniture: WallSegment[]) {
  const back = -b.depth / 2 + 0.26, w = b.width, d = b.depth, h = b.height;
  const [rackLeft, rackRight, cashWrap, fitting, mannequinLeft, mannequinRight, tableLeft, tableRight] = furniture;
  physicalSign(c, m, 'WESTCOSE SHOP', 'CLOTHING / MADE ON THE COAST', [0, 4.1, back + 0.02], 5.6, 0.72, [0, 0, 0], true);
  // The garment wall stops short of the fitting room: two rails of face-out tees and hoodies on a
  // timber backing, caps on pegs above.
  const wallLeft = -w / 2 + 0.6, wallRight = fitting.center[0] - fitting.size[0] / 2 - 0.2;
  block(c.details, m, [(wallLeft + wallRight) / 2, 2.15, back + 0.04], [wallRight - wallLeft + 0.3, 2.7, 0.06], P.timber);
  garmentRail(c, m, wallLeft, wallRight, 2.86, back + 0.12, 0);
  garmentRail(c, m, wallLeft, wallRight, 1.68, back + 0.12, 4);
  capRow(c, m, wallLeft, wallRight, 3.32, back + 0.07, 2);
  // Track lights wash the walls instead of the old pendant work lights.
  for (const x of [-1.7, 1.7]) {
    block(c.details, m, [x, h - 1.4, 0], [0.06, 0.06, d - 1.6], P.graphite);
    for (let i = 0; i < 5; i++) {
      const z = -d / 2 + 1.2 + i * (d - 2.4) / 4;
      tube(c.details, m, [x, h - 1.5, z], 0.05, 0.16, P.graphite);
      block(c.glow, m, [x, h - 1.585, z], [0.08, 0.012, 0.08], P.warmGlass);
    }
  }
  // Wall racks down both sides face the aisle: a low plinth, two uprights and a rail of garments.
  for (const [rack, side, title] of [[rackLeft, -1, 'TEES & HOODIES'], [rackRight, 1, 'NEW DROP']] as const) {
    const [x, , z] = rack.center, length = rack.size[2];
    const r = frame(m, [x, 0, z], -side * Math.PI / 2);
    block(c.details, r, [0, 0.12, 0], [length, 0.24, 0.5], P.paleTimber);
    for (const end of [-1, 1]) tube(c.details, r, [end * (length / 2 - 0.05), 0.92, -0.16], 0.02, 1.62, P.steel);
    garmentRail(c, r, -length / 2 + 0.1, length / 2 - 0.1, 1.72, -0.12, side > 0 ? 2 : 6);
    physicalSign(c, frame(m, [side * (w / 2 - 0.24), 0, z], -side * Math.PI / 2), title, 'WESTCOSE / MADE ON THE COAST', [0, 2.65, 0.02], 1.8, 0.42, [0, 0, 0], true);
  }
  // The cash wrap: a graphite counter with a pale top, the register, bags and tissue paper.
  const [cx, , cz] = cashWrap.center, [cw, ch, cd] = cashWrap.size;
  block(c.details, m, [cx, ch / 2 - 0.03, cz], [cw, ch - 0.06, cd], P.graphite);
  block(c.details, m, [cx, ch - 0.03, cz], [cw + 0.08, 0.06, cd + 0.1], P.paleTimber);
  for (let i = 0; i < 3; i++) block(c.details, m, [cx - cw / 2 + 0.45 + i * 0.85, ch * 0.5, cz + cd / 2 + 0.006], [0.6, 0.5, 0.012], GARMENTS[i * 2][0]);
  monitor(c, m, [cx + 0.75, ch, cz - 0.1], 0.5, 0, true);
  for (let i = 0; i < 3; i++) block(c.details, m, [cx - 0.78, ch + 0.13, cz - 0.08 + i * 0.07], [0.3, 0.26 - i * 0.03, 0.05], i % 2 ? P.paper : P.bone);
  block(c.details, m, [cx - 0.15, ch + 0.012, cz + 0.18], [0.5, 0.018, 0.36], P.paper);
  physicalSign(c, m, 'THANK YOU', 'TEES / HOODIES / CAPS', [cx - 0.1, ch + 0.33, cz + cd / 2 - 0.05], 1.0, 0.28, [0, 0, 0], false);
  block(c.details, m, [cx - 0.1, ch + 0.16, cz + cd / 2 - 0.1], [0.06, 0.3, 0.06], P.steel);
  // The fitting room in the back corner: a timber booth, a striped curtain and a mirror outside.
  const [fx, , fz] = fitting.center, [fw, fh, fd] = fitting.size;
  block(c.details, m, [fx - fw / 2 + 0.03, fh / 2, fz], [0.06, fh, fd], P.timber);
  block(c.details, m, [fx, fh + 0.03, fz], [fw, 0.06, fd], P.timber);
  block(c.details, m, [fx, fh - 0.08, fz + fd / 2], [fw, 0.04, 0.04], P.steel);
  for (let i = 0; i < 6; i++) block(c.details, m, [fx - fw / 2 + 0.16 + i * (fw - 0.3) / 5, fh / 2 - 0.05, fz + fd / 2 - 0.03], [0.26, fh - 0.25, 0.03], i % 2 ? P.rust : '#B8774F', [0, (i % 2 ? 1 : -1) * 0.25, 0]);
  block(c.details, m, [fx - fw / 2 - 0.01, 1.25, fz], [0.02, 1.52, 0.68], P.steel);
  block(c.glow, m, [fx - fw / 2 - 0.025, 1.25, fz], [0.012, 1.4, 0.58], '#9FB4B8');
  physicalSign(c, m, 'FITTING ROOM', undefined, [fx, fh + 0.22, fz + fd / 2 + 0.01], 1.2, 0.24, [0, 0, 0], true);
  // Two low tables of folded tees either side of the aisle.
  for (const [i, table] of [tableLeft, tableRight].entries()) {
    const [tx, , tz] = table.center, [tw, th, td] = table.size;
    block(c.details, m, [tx, th - 0.05, tz], [tw, 0.1, td], P.paleTimber);
    block(c.details, m, [tx, (th - 0.1) / 2, tz], [tw - 0.2, th - 0.1, td - 0.2], P.steel);
    foldedStacks(c, m, tx, th, tz, tw - 0.1, td - 0.1, i * 3);
  }
  // Mannequins in the front windows face the courtyard.
  mannequin(c, m, mannequinLeft.center[0], mannequinLeft.center[2], GARMENTS[2][0], GARMENTS[2][1]);
  mannequin(c, m, mannequinRight.center[0], mannequinRight.center[2], GARMENTS[3][0], GARMENTS[3][1], true);
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
  physicalSign(c, m, 'WEST COSE MOTEL', CONTENT.about.eyebrow, [0, 3.4, back + 0.027], 4.6, 0.62);
  // The reception counter, its bell and register, and the key board behind it.
  const desk = furniture[0], [x, , z] = desk.center, [dw, dh, dd] = desk.size;
  block(c.details, m, [x, dh / 2 - .03, z], [dw, dh - .06, dd], P.timber);
  block(c.details, m, [x, dh - .03, z], [dw + .1, .06, dd + .1], P.paleTimber);
  for (let i = 0; i < 5; i++) block(c.details, m, [x - dw / 2 + .22 + i * .44, dh * .5, z + dd / 2 + .005], [.3, .6, .012], i % 2 ? '#C2653E' : P.paleTimber);
  monitor(c, m, [x - .5, dh, z - .1], .52, 0, true);
  tube(c.details, m, [x + .35, dh + .04, z + .12], .07, .06, '#C9A66B');
  mug(c, m, [x + .75, dh, z - .05]);
  const keys = frame(m, [x, 0, back + .05]);
  block(c.details, keys, [0, 1.75, 0], [1.4, .8, .05], P.timber);
  for (let i = 0; i < 12; i++) {
    block(c.details, keys, [(i % 6 - 2.5) * .21, 1.95 - Math.floor(i / 6) * .36, .04], [.04, .04, .04], P.steel);
    block(c.details, keys, [(i % 6 - 2.5) * .21, 1.84 - Math.floor(i / 6) * .36, .05], [.06, .14, .02], i % 3 ? '#C2653E' : P.bone);
  }
  // A lounge corner: sofa, low table, a plant and a framed print.
  const sofa = furniture[1], [sx, , sz] = sofa.center, [sw, sh, sd] = sofa.size;
  block(c.details, m, [sx, sh * .32, sz], [sw, sh * .5, sd], '#5B7E8A');
  block(c.details, m, [sx, sh * .7, sz - sd / 2 + .1], [sw, sh * .55, .2], '#4C6E79');
  for (const side of [-1, 1]) block(c.details, m, [sx + side * (sw / 2 - .08), sh * .5, sz], [.16, sh * .45, sd], '#4C6E79');
  block(c.details, m, [sx, .22, sz + 1.05], [1.0, .06, .55], P.paleTimber);
  for (const lx of [-.42, .42]) block(c.details, m, [sx + lx, .1, sz + 1.05], [.05, .2, .45], P.graphite);
  framedStudy(c, m, [sx, 1.9, back + .06], 1.1, .8, 2);
  block(c.details, m, [b.width / 2 - 0.55, 0.24, 0.9], [0.62, 0.48, 0.62], P.timber);
  c.plants.shape(UNIT_LEAF, m, [b.width / 2 - 0.55, 0.99, 0.9], [0.48, 0.87, 0.43], P.leaf, [0.05, 1.2, 0.1]);
  const side = frame(m, [-(b.width / 2 - 0.24), 0, 0], Math.PI / 2);
  physicalSign(c, side, 'A PLACE FOR IDEAS', undefined, [0, 2.12, 0.052], 1.6, 0.55);
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
  const decks = Math.floor((b.width - 1.4) / .74);
  for (let row = 0; row < 3; row++) {
    block(c.details, m, [0, 1.12 + row * .86 + .38, back + .08], [b.width - 1.1, .05, .06], P.steel);
    for (let i = 0; i < decks; i++) {
      const [color, stripe] = DECK_GRAPHICS[(i + row * 4) % DECK_GRAPHICS.length];
      hangingDeck(c, m, [(i - (decks - 1) / 2) * .74, 1.12 + row * .86, back + .16], color, stripe);
    }
  }
  // A mini quarter-pipe display in the front corner, and a sticker-covered pillar.
  const ramp = frame(m, [b.width / 2 - 1.4, 0, b.depth / 2 - 1.5], -Math.PI / 2);
  for (let k = 0; k < 6; k++) block(c.details, ramp, [0, .1 + k * .1, -.45 + k * k * .03], [1.4, .06, .22], P.paleTimber, [-k * .22, 0, 0]);
  block(c.details, ramp, [0, .62, -.02], [1.45, .05, .05], P.steel);
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
  ({ studio, workshop: clothingStore, arcade, about, lab, skateshop })[b.interior](c, b, m, furniture);
}
