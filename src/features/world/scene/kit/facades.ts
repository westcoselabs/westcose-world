import * as THREE from 'three';
import type { TownBuilding } from '../../data/town-types';
import { MOTEL, MOTEL_POSTS, MOTEL_STAIR } from '../../data/town-props';
import { WALK_LEVEL } from '../../data/downtown-layout';
import { mapFrame } from '../../data/world-map';
import type { SceneryBatch } from '../sceneryGeometry';
import { rollingRack } from './apparel';
import { block, frame, neonSign, physicalSign, tube, UNIT_LEAF, type KitContext } from './context';
import { TOWN_PALETTE as P } from './materials';
import { windowModule } from './openings';

/** Bespoke fronts for the courtyard halls and the motel, after the WestCose references:
 * sun-faded stucco, black steel shopfronts, timber canopies and gooseneck lamps. */
const STEEL = '#2B3536', DARK_TIMBER = '#5E4A37', FASCIA = '#47392C', DOOR = '#C2653E';
const DISC = new THREE.CylinderGeometry(1, 1, 1, 20);
const CONE = new THREE.ConeGeometry(1, 1, 8, 1, true);
const RING = new THREE.TorusGeometry(1, .16, 6, 20, Math.PI * 1.25);

type Facade = { c: KitContext; b: TownBuilding; m: THREE.Matrix4; over: SceneryBatch; fz: number };

/** Glazed shopfront bays between two x's: steel frame, kick plate, transom and lit glass. */
function storefront(c: KitContext, m: THREE.Matrix4, x0: number, x1: number, z: number, top: number, transom = 2.5) {
  const width = x1 - x0;
  if (width < .4) return;
  const bays = Math.max(1, Math.round(width / 1.15)), bay = width / bays;
  block(c.details, m, [(x0 + x1) / 2, .25, z + .03], [width + .06, .5, .12], STEEL);
  block(c.details, m, [(x0 + x1) / 2, top + .05, z + .04], [width + .1, .1, .15], STEEL);
  block(c.details, m, [(x0 + x1) / 2, transom, z + .045], [width, .07, .13], STEEL);
  for (let i = 0; i <= bays; i++) block(c.details, m, [x0 + i * bay, (top + .5) / 2, z + .04], [.08, top - .5, .14], STEEL);
  for (let i = 0; i < bays; i++) {
    const x = x0 + (i + .5) * bay;
    block(c.glow, m, [x, (.5 + transom) / 2, z + .01], [bay - .08, transom - .53, .02], P.warmGlass);
    block(c.glow, m, [x, (transom + top) / 2, z + .01], [bay - .08, top - transom - .08, .02], '#C9A66B');
  }
}

/** A swan-neck lamp washing light down a sign. */
function gooseneck(c: KitContext, batch: SceneryBatch, m: THREE.Matrix4, x: number, y: number, z: number) {
  block(batch, m, [x, y, z + .04], [.16, .22, .08], STEEL);
  tube(batch, m, [x, y + .1, z + .3], .03, .5, STEEL, [Math.PI / 2, 0, 0]);
  tube(batch, m, [x, y + .02, z + .55], .03, .2, STEEL);
  batch.shape(CONE, m, [x, y - .12, z + .58], [.2, .2, .2], STEEL);
  block(c.glow, m, [x, y - .21, z + .58], [.2, .02, .2], P.amber);
}

/** Timber soffit canopy with a dark fascia and downlights. */
function timberCanopy(c: KitContext, batch: SceneryBatch, m: THREE.Matrix4, x0: number, x1: number, y: number, depth: number, z: number, lights = true) {
  const w = x1 - x0;
  block(batch, m, [(x0 + x1) / 2, y, z + depth / 2], [w, .28, depth], DARK_TIMBER);
  for (let i = 0; i < Math.ceil(w / .3); i++) block(batch, m, [x0 + .15 + i * .3, y - .145, z + depth / 2], [.24, .012, depth - .05], P.timber);
  block(batch, m, [(x0 + x1) / 2, y + .02, z + depth + .02], [w + .05, .34, .07], FASCIA);
  for (const side of [-1, 1]) block(batch, m, [(x0 + x1) / 2 + side * (w / 2 - .1), y + .55, z + depth * .55], [.05, .05, Math.hypot(depth * .9, 1.1)], STEEL, [-Math.atan2(1.1, depth * .9), 0, 0]);
  if (lights) for (let i = 0; i < Math.max(2, Math.round(w / 1.6)); i++) block(c.glow, m, [x0 + (i + .5) * w / Math.max(2, Math.round(w / 1.6)), y - .155, z + depth * .5], [.15, .015, .15], P.amber);
}

function pottedPlant(c: KitContext, m: THREE.Matrix4, x: number, z: number, scale = 1) {
  block(c.details, m, [x, .26 * scale, z], [.5 * scale, .52 * scale, .5 * scale], '#B9B4A6');
  block(c.details, m, [x, .53 * scale, z], [.42 * scale, .03, .42 * scale], P.soil);
  c.plants.shape(UNIT_LEAF, m, [x, .9 * scale, z], [.34 * scale, .5 * scale, .32 * scale], '#5F7E4E', [.1, x, .2]);
  c.plants.shape(UNIT_LEAF, m, [x + .08, 1.12 * scale, z - .04], [.22 * scale, .34 * scale, .2 * scale], '#78935C', [.3, z, .1]);
}

/** A sidewalk A-frame: two timber boards leaning together, a chalk sign on the front one. */
function aFrame(c: KitContext, m: THREE.Matrix4, x: number, z: number, title: string, subtitle: string) {
  const f = frame(m, [x, 0, z]);
  for (const side of [-1, 1]) block(c.details, f, [0, .5, side * .16], [.62, 1.02, .04], DARK_TIMBER, [-side * .3, 0, 0]);
  block(c.details, f, [0, .55, .185], [.52, .66, .012], '#2F3B3D', [-.3, 0, 0]);
  physicalSign(c, f, title, subtitle, [0, .62, .2], .5, .3, [-.3, 0, 0], true, '#2F3B3D');
}

function surfboard(c: KitContext, m: THREE.Matrix4, x: number, z: number, lean: number, color: string, stripe: string) {
  const board = frame(m, [x, 0, z]).multiply(new THREE.Matrix4().makeRotationX(lean));
  block(c.details, board, [0, 1.05, 0], [.5, 2.1, .07], color);
  block(c.details, board, [0, 2.08, 0], [.32, .14, .07], color);
  block(c.details, board, [0, 1.1, .04], [.06, 1.9, .01], stripe);
}

/** A painted sun-and-wave mural on a wall frame facing +Z. */
function mural(c: KitContext, wall: THREE.Matrix4, x: number, y: number, size: number) {
  c.details.shape(DISC, wall, [x - size * .2, y + size * .18, .02], [size * .42, .02, size * .42], '#C2653E', [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) block(c.details, wall, [x - size * .2, y + size * (.02 + i * .1), .045], [size * .86, size * .035, .01], '#E3D6BF');
  c.details.shape(RING, wall, [x + size * .18, y + size * .02, .06], [size * .48, size * .48, .4], '#2E4A57', [0, 0, -.6]);
  c.details.shape(RING, wall, [x + size * .3, y - size * .08, .07], [size * .28, size * .28, .3], '#3F6371', [0, 0, -.2]);
  block(c.details, wall, [x + size * .05, y - size * .34, .05], [size * 1.1, size * .16, .02], '#2E4A57');
}

/** A side wall facing the street: display windows, a mural and a painted sign. */
function streetSide(k: Facade, side: number, title: string, subtitle: string) {
  const { c, b, m } = k, d = b.depth, h = b.height;
  const wall = frame(m, [side * (b.width / 2 + .03), 0, 0], side * Math.PI / 2);
  for (const x of [-d * .25, d * .25]) storefront(c, wall, x - d * .17, x + d * .17, .02, 2.8, 2.15);
  mural(c, wall, d * .18, h - 2.25, 2.4);
  physicalSign(c, wall, title, subtitle, [-d * .22, h - 2.05, .06], d * .42, 1.05, [0, 0, 0], false, b.color);
  timberCanopy(c, c.details, wall, -d * .45, d * .45, 3.05, .9, .02);
}

function gallery(k: Facade) {
  const { c, b, m, over, fz } = k, w = b.width, h = b.height;
  const left = b.entryOffset - b.entryWidth / 2, right = b.entryOffset + b.entryWidth / 2;
  // Tall steel door frame with a glazed transom over the open double doors.
  for (const x of [left - .08, right + .08]) block(c.details, m, [x, 1.72, fz + .045], [.16, 3.44, .17], STEEL);
  block(over, m, [b.entryOffset, 3.3, fz + .045], [b.entryWidth + .32, .2, .17], STEEL);
  block(c.glow, m, [b.entryOffset, 3.0, fz + .02], [b.entryWidth - .1, .48, .02], '#C9A66B');
  storefront(c, m, -w / 2 + .75, left - .3, fz + .02, 3.4);
  storefront(c, m, right + .3, w / 2 - .75, fz + .02, 3.4);
  timberCanopy(c, over, m, -w / 2 + .45, w / 2 - .45, 3.72, 1.4, fz);
  // The name across the upper front, washed by three swan-neck lamps.
  block(over, m, [0, 5.42, fz + .02], [7.7, 1.62, .08], '#DCD2BF');
  physicalSign(c, m, b.sign ?? '', b.subtitle, [0, 5.42, fz + .07], 7.4, 1.42, [0, 0, 0], false, '#DCD2BF', b.interior);
  for (const x of [-2.6, 0, 2.6]) gooseneck(c, over, m, x, 6.65, fz);
  // A blade banner off the corner nearest Main St.
  const blade = frame(m, [-w / 2 + .15, 0, fz + .05], -Math.PI / 2);
  block(c.details, blade, [-.45, 6.55, 0], [.95, .07, .07], STEEL);
  block(c.details, blade, [-.75, 5.05, 0], [.62, 2.7, .06], '#2F3B3D');
  for (const face of [1, -1]) physicalSign(c, blade, 'STUDIO ROW', 'GALLERY / OPEN', [-.75, 5.05, face * .035], 2.5, .56, [0, face > 0 ? 0 : Math.PI, face * -Math.PI / 2], true, '#2F3B3D');
  for (const side of [-1, 1]) pottedPlant(c, m, b.entryOffset + side * (b.entryWidth / 2 + .55), fz + .32, 1.15);
  streetSide(k, -1, 'STUDIO ROW GALLERY', 'ENTRANCE ON THE COURTYARD');
  // The quieter Palm Ave end keeps two framed windows.
  const back = frame(m, [b.width / 2 + .03, 0, 0], Math.PI / 2);
  for (const x of [-b.depth * .22, b.depth * .22]) windowModule(c, back, x, 2.1, .02, 1.3, 1.6, b.trim);
}

function shop(k: Facade) {
  const { c, b, m, over, fz } = k, w = b.width;
  const left = b.entryOffset - b.entryWidth / 2, right = b.entryOffset + b.entryWidth / 2;
  // The doorway reads as a raised roller door: heavy portal, guide rails and the drum.
  for (const x of [left - .12, right + .12]) {
    block(c.details, m, [x, 1.6, fz + .05], [.24, 3.2, .2], b.accent);
    block(c.details, m, [x + (x < b.entryOffset ? .14 : -.14), 1.5, fz + .06], [.06, 3, .1], STEEL);
  }
  block(over, m, [b.entryOffset, 3.05, fz + .2], [b.entryWidth + .5, .42, .42], '#4A5A5C');
  for (let i = 0; i < 4; i++) block(over, m, [b.entryOffset, 2.88 + i * .1, fz + .43], [b.entryWidth + .3, .025, .02], '#2B3536');
  storefront(c, m, -w / 2 + .75, left - .35, fz + .02, 3.2);
  storefront(c, m, right + .35, w / 2 - .75, fz + .02, 3.2);
  // A steel awning in the shop colour on brackets.
  block(over, m, [0, 3.62, fz + .7], [w - .9, .1, 1.45], b.accent, [.12, 0, 0]);
  block(over, m, [0, 3.48, fz + 1.4], [w - .9, .22, .05], P.bone);
  for (const x of [-w / 2 + .7, -w / 6, w / 6, w / 2 - .7]) block(over, m, [x, 3.3, fz + .55], [.05, .05, 1.2], STEEL, [-.55, 0, 0]);
  block(over, m, [0, 5.2, fz + .02], [7.6, 1.55, .08], '#2B3B44');
  physicalSign(c, m, b.sign ?? '', b.subtitle, [0, 5.2, fz + .07], 7.3, 1.36, [0, 0, 0], true, '#2B3B44', b.interior);
  for (const x of [-2.6, 0, 2.6]) gooseneck(c, over, m, x, 6.35, fz);
  // A rolling rack of tees and a chalk A-frame out front, clear of the doorway.
  rollingRack(c, m, -w / 2 + 1.75, fz + .55, 1.6, 1);
  aFrame(c, m, w / 2 - 2.2, fz + .7, 'NEW DROP', 'TEES / HOODIES / CAPS');
  pottedPlant(c, m, w / 2 - 1.1, fz + .3, 1.1);
  streetSide(k, 1, 'WESTCOSE SHOP', 'CLOTHING / ENTER FROM THE COURTYARD');
  const back = frame(m, [-b.width / 2 - .03, 0, 0], -Math.PI / 2);
  for (const x of [-b.depth * .22, b.depth * .22]) windowModule(c, back, x, 2.1, .02, 1.3, 1.4, b.trim);
}

function motelLobby(k: Facade) {
  const { c, b, m, over, fz } = k, w = b.width;
  const left = b.entryOffset - b.entryWidth / 2, right = b.entryOffset + b.entryWidth / 2;
  for (const x of [left - .07, right + .07]) block(c.details, m, [x, 1.4, fz + .045], [.14, 2.8, .16], STEEL);
  storefront(c, m, right + .3, w / 2 - .7, fz + .02, 2.95, 2.3);
  // The deep timber canopy reads BUILT BY THE SEA along its fascia.
  timberCanopy(c, over, m, -w / 2 + .1, w / 2 - .1, 3.18, 1.75, fz);
  physicalSign(c, m, 'BUILT BY THE SEA', undefined, [0, 3.2, fz + 1.82], 4.2, .3, [0, 0, 0], true, FASCIA, b.interior);
  block(over, m, [0, 4.02, fz + .02], [w - .5, .82, .08], '#E3D6BF');
  physicalSign(c, m, b.sign ?? '', b.subtitle, [0, 4.02, fz + .07], w - .8, .7, [0, 0, 0], false, '#E3D6BF', b.interior);
  neonSign(c, m, 'OFFICE', undefined, [left - .55, 2.2, fz + .09], .62, .2, '#F08A4B', [0, 0, 0]);
  surfboard(c, m, w / 2 - .32, fz + .3, -.08, '#C2653E', '#E9DFCE');
  surfboard(c, m, w / 2 - .62, fz + .32, -.1, '#E9DFCE', '#2E4A57');
  // The Pier St side: a framed window and the check-in sign.
  const side = frame(m, [b.width / 2 + .03, 0, 0], Math.PI / 2);
  windowModule(c, side, .4, 1.7, .02, 1.6, 1.25, b.trim, true);
  physicalSign(c, side, 'CHECK IN', 'WEST COSE MOTEL / LOBBY', [.4, 3.4, .05], 2.6, .5, [0, 0, 0], true, '#394F51');
}

function motelRooms(k: Facade) {
  const { c, b, m, fz } = k, w = b.width, h = b.height, d = b.depth;
  const { upper, walkway, doors } = MOTEL.rooms, bay = w / doors;
  const roomDoor = (x: number, y: number, label: string) => {
    block(c.details, m, [x, y + 1.17, fz + .01], [1.1, 2.4, .08], STEEL);
    block(c.details, m, [x, y + 1.14, fz + .05], [.94, 2.28, .05], DOOR);
    for (const py of [.6, 1.7]) block(c.details, m, [x, y + py, fz + .08], [.7, .5, .02], '#AE5733');
    block(c.details, m, [x + .32, y + 1.1, fz + .09], [.05, .14, .05], P.bone);
    block(c.details, m, [x, y + 1.85, fz + .085], [.34, .18, .01], '#1E2A2C');
    physicalSign(c, m, label, undefined, [x, y + 1.85, fz + .092], .3, .15, [0, 0, 0], true, '#1E2A2C');
    // A barn sconce over each door.
    block(c.details, m, [x + .72, y + 2.45, fz + .04], [.12, .18, .06], STEEL);
    c.details.shape(CONE, m, [x + .72, y + 2.42, fz + .26], [.16, .14, .16], STEEL);
    block(c.glow, m, [x + .72, y + 2.34, fz + .26], [.14, .02, .14], P.amber);
  };
  for (const floor of [0, 1]) for (let i = 0; i < doors; i++) {
    const x = w / 2 - bay * (i + .5), y = floor * upper;
    roomDoor(x - .62, y, `${floor + 1}0${i + 1}`);
    windowModule(c, m, x + .78, y + 1.5, fz + .01, 1.15, 1.05, P.bone, (i + floor) % 2 === 0);
    if (floor === 0) pottedPlant(c, m, x + .78, fz + .35, .85);
  }
  // The upper walkway, its railing, and the roof run out over it on posts.
  const x0 = MOTEL_STAIR.x0 - .05, x1 = w / 2, slabZ = d / 2 + walkway / 2;
  block(c.structure, m, [(x0 + x1) / 2, upper - .1, slabZ], [x1 - x0, .2, walkway + .05], P.concrete);
  block(c.details, m, [(x0 + x1) / 2, upper - .2, d / 2 + walkway], [x1 - x0, .24, .08], '#5E5A52');
  for (let i = 0; i < Math.round((x1 - x0) / 1.4); i++) block(c.glow, m, [x0 + .7 + i * 1.4, upper - .21, slabZ], [.14, .02, .14], P.amber);
  const railZ = d / 2 + walkway - .06, railTop = upper + 1.02;
  block(c.details, m, [(x0 + x1) / 2, railTop, railZ], [x1 - x0, .06, .06], STEEL);
  block(c.details, m, [(x0 + x1) / 2, upper + .1, railZ], [x1 - x0, .05, .05], STEEL);
  for (let x = x0 + .1; x < x1; x += .16) block(c.details, m, [x, upper + .56, railZ], [.022, .92, .022], STEEL);
  block(c.structure, m, [(x0 + x1) / 2, h - .08, slabZ], [x1 - x0 + .2, .16, walkway + .3], DARK_TIMBER);
  block(c.details, m, [(x0 + x1) / 2, h - .05, d / 2 + walkway + .14], [x1 - x0 + .22, .3, .06], FASCIA);
  for (let i = 0; i < Math.round((x1 - x0) / 1.6); i++) block(c.glow, m, [x0 + .8 + i * 1.6, h - .17, slabZ], [.13, .02, .13], P.amber);
  for (const [x, , z] of MOTEL_POSTS) tube(c.details, m, [x, h / 2, z], .075, h, STEEL);
  // The stair climbs the alley end to the walkway landing.
  const s = MOTEL_STAIR, run = (s.topZ - s.footZ) / s.steps, rise = upper / s.steps;
  for (let i = 0; i < s.steps; i++) {
    const z = s.footZ + run * (i + .5), y = rise * (i + 1);
    block(c.details, m, [(s.x0 + s.x1) / 2, y - .03, z], [s.x1 - s.x0 - .1, .06, run + .04], '#6B5A44');
  }
  const stringer = Math.atan2(upper, s.topZ - s.footZ), length = Math.hypot(upper, s.topZ - s.footZ);
  for (const x of [s.x0 + .04, s.x1 - .04]) {
    block(c.details, m, [x, upper / 2 - .1, (s.footZ + s.topZ) / 2], [.06, .26, length], STEEL, [-stringer, 0, 0]);
    block(c.details, m, [x, upper / 2 + .85, (s.footZ + s.topZ) / 2], [.05, .05, length], STEEL, [-stringer, 0, 0]);
  }
  for (let i = 0; i <= 4; i++) {
    const z = s.footZ + (s.topZ - s.footZ) * i / 4, y = upper * i / 4;
    block(c.details, m, [s.x0 + .04, y + .45, z], [.04, .9, .04], STEEL);
  }
  block(c.details, m, [(s.x0 + s.x1) / 2, upper + .55, s.topZ + walkway - .06], [s.x1 - s.x0, .05, .05], STEEL);
  // A tall mural on the alley end wall, above the stair.
  const end = frame(m, [-w / 2 - .03, 0, 0], -Math.PI / 2);
  block(c.details, end, [0, h - 1.7, .015], [d - .4, 3, .02], '#E6DAC4');
  mural(c, end, .2, h - 1.5, 2.6);
  physicalSign(c, end, 'WEST COSE MOTEL', 'GOOD DAYS / SALTY PEOPLE', [-.15, h - 3.0, .05], 3.8, .62, [0, 0, 0], false, '#E6DAC4');
  // Small bathroom windows and air conditioners on the beach side.
  const back = frame(m, [0, 0, -d / 2 - .03], Math.PI);
  for (const floor of [0, 1]) for (let i = 0; i < doors; i++) {
    const x = -w / 2 + bay * (i + .5);
    windowModule(c, back, x, floor * upper + 2.05, .02, .7, .5, P.bone);
    block(c.details, back, [x + .9, floor * upper + 1.1, .2], [.7, .45, .4], '#B8B4AA');
  }
}

/** Draws a building's bespoke front and returns true, or false for an archetype default. */
export function heroFacade(c: KitContext, b: TownBuilding, m: THREE.Matrix4, over: SceneryBatch) {
  if (!b.facade) return false;
  const k = { c, b, m, over, fz: b.depth / 2 + .035 };
  ({ gallery, shop, 'motel-lobby': motelLobby, 'motel-rooms': motelRooms })[b.facade](k);
  return true;
}

/** The motel's neon pylon on the Pier St corner: a starburst over WEST COSE / MOTEL /
 * NO VACANCY, turned to face both the courtyard and the beach. */
export function motelPylon(c: KitContext) {
  const { x, z, height } = MOTEL.pylon;
  const f = mapFrame(x, z, WALK_LEVEL - .05).matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
  block(c.structure, f, [0, .25, 0], [1.3, .5, 1.3], '#B9B4A6');
  block(c.details, f, [0, .52, 0], [1.15, .04, 1.15], P.soil);
  for (let i = 0; i < 4; i++) c.plants.shape(UNIT_LEAF, f, [Math.cos(i * 1.6) * .35, .78, Math.sin(i * 1.6) * .35], [.26, .32, .24], '#5F7E4E', [.2, i, 0]);
  block(c.structure, f, [0, height / 2, 0], [.42, height, .42], '#24302F');
  const panel = (y: number, width: number, panelHeight: number, color: string, offset = 0) => {
    block(c.structure, f, [offset, y, 0], [width, panelHeight, .32], '#1E2A2C');
    for (const sy of [-1, 1]) block(c.glow, f, [offset, y + sy * (panelHeight / 2 - .05), 0], [width - .06, .05, .36], color);
    for (const sx of [-1, 1]) block(c.glow, f, [offset + sx * (width / 2 - .05), y, 0], [.05, panelHeight - .06, .36], color);
  };
  // The sign cabinet hangs off the pylon over the Pier St sidewalk, the post along its edge.
  const off = (width: number) => -(width / 2 + .22);
  panel(8.15, 3.1, 1.05, '#E9DFCE', off(3.1));
  panel(6.85, 3.4, 1.45, '#F08A4B', off(3.4));
  panel(5.8, 2.6, .6, '#7FC6CF', off(2.6));
  panel(5.1, 1.9, .55, '#C2653E', off(1.9));
  for (const y of [5.1, 7.6]) block(c.details, f, [-.18, y, 0], [.4, .12, .12], '#24302F');
  for (const face of [1, -1]) {
    const r: [number, number, number] = [0, face > 0 ? 0 : Math.PI, 0];
    neonSign(c, f, 'WEST COSE', undefined, [off(3.1), 8.15, face * .17], 2.9, .82, '#F4E9D2', r, '#1E2A2C');
    neonSign(c, f, 'MOTEL', undefined, [off(3.4), 6.85, face * .17], 3.2, 1.22, '#FF8A4C', r, '#1E2A2C');
    neonSign(c, f, 'NO VACANCY', undefined, [off(2.6), 5.8, face * .17], 2.45, .48, '#FF5A4E', r, '#1E2A2C');
    neonSign(c, f, 'COASTAL MISFITS', 'EST. 2018', [off(1.9), 5.1, face * .17], 1.8, .44, '#E9DFCE', r, '#1E2A2C');
  }
  // The starburst: crossed glowing blades over the top of the pylon.
  for (let i = 0; i < 4; i++) {
    block(c.glow, f, [0, height + .3, 0], [.16, 1.5, .16], '#FF8A4C', [0, 0, i * Math.PI / 4]);
    block(c.structure, f, [0, height + .3, 0], [.22, .9, .22], '#C2653E', [0, 0, i * Math.PI / 4 + Math.PI / 8]);
  }
}
