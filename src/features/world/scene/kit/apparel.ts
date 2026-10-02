import * as THREE from 'three';
import { block, frame, tube, UNIT_CYLINDER, UNIT_LEAF, type KitContext, type Triple } from './context';
import { TOWN_PALETTE as P } from './materials';

/** Clothing for the WestCose Shop: garments on hangers, rails and rolling racks, folded stacks,
 * caps and mannequins. Batched blocks only; colliders live with the room's furniture. */
export const GARMENTS: readonly (readonly [cloth: string, print: string])[] = [
  [P.bone, P.rust], [P.graphite, P.bone], [P.blue, P.bone], [P.rust, P.bone], ['#D9A441', P.graphite],
  ['#4F8A7E', P.bone], [P.paper, P.blue], ['#7C93A6', P.graphite], ['#C4553F', '#F1E3C4'],
];

/** A tee or a hoodie on a hanger, face out along +Z, hanging from its hook at `position`. */
export function hangingGarment(c: KitContext, m: THREE.Matrix4, position: Triple, cloth: string, print: string, hoodie = false) {
  const g = frame(m, position);
  tube(c.details, g, [0, -.03, 0], .007, .06, P.steel);
  block(c.details, g, [0, -.07, 0], [.38, .022, .022], P.paleTimber);
  const length = hoodie ? .7 : .58;
  block(c.details, g, [0, -.08 - length / 2, .015], [.42, length, .035], cloth);
  for (const side of [-1, 1]) {
    if (hoodie) block(c.details, g, [side * .25, -.4, .015], [.1, .58, .035], cloth, [0, 0, side * .08]);
    else block(c.details, g, [side * .27, -.15, .015], [.17, .16, .035], cloth, [0, 0, side * .55]);
  }
  if (hoodie) {
    block(c.details, g, [0, -.11, -.01], [.24, .15, .05], cloth);
    block(c.details, g, [0, -.6, .036], [.26, .13, .008], print);
  } else block(c.details, g, [0, -.28, .035], [.17, .09, .006], print);
}

/** A straight rail of face-out garments between x0 and x1, `offset` varying the colours. */
export function garmentRail(c: KitContext, m: THREE.Matrix4, x0: number, x1: number, y: number, z: number, offset = 0) {
  block(c.details, m, [(x0 + x1) / 2, y, z], [x1 - x0, .035, .035], P.steel);
  for (const x of [x0, x1]) block(c.details, m, [x, y, z - .07], [.04, .04, .16], P.steel);
  const count = Math.max(1, Math.floor((x1 - x0) / .5));
  for (let i = 0; i < count; i++) {
    const [cloth, print] = GARMENTS[(i + offset) % GARMENTS.length];
    hangingGarment(c, m, [x0 + (i + .5) * (x1 - x0) / count, y, z + .04], cloth, print, (i + offset) % 3 === 2);
  }
}

/** A free-standing rolling rack facing +Z: two uprights on feet, a top bar and its garments. */
export function rollingRack(c: KitContext, m: THREE.Matrix4, x: number, z: number, length: number, offset = 0) {
  const rack = frame(m, [x, 0, z]);
  for (const end of [-1, 1]) {
    tube(c.details, rack, [end * length / 2, .72, -.04], .018, 1.44, P.steel);
    block(c.details, rack, [end * length / 2, .03, -.04], [.05, .05, .52], P.steel);
    for (const foot of [-1, 1]) tube(c.details, rack, [end * length / 2, .03, -.04 + foot * .24], .03, .04, P.graphite, [0, 0, Math.PI / 2]);
  }
  garmentRail(c, rack, -length / 2, length / 2, 1.44, -.04, offset);
}

/** Folded tees stacked in rows on a tabletop at `top`, the stack spread across `width`. */
export function foldedStacks(c: KitContext, m: THREE.Matrix4, x: number, top: number, z: number, width: number, depth: number, offset = 0) {
  const across = Math.max(1, Math.floor((width - .1) / .5)), rows = depth > .7 ? 2 : 1;
  for (let row = 0; row < rows; row++) for (let i = 0; i < across; i++) {
    const height = 2 + (i + row + offset) % 3;
    for (let k = 0; k < height; k++) {
      const [cloth] = GARMENTS[(i * 2 + row + k + offset) % GARMENTS.length];
      block(c.details, m, [x - width / 2 + (i + .5) * width / across, top + .035 + k * .07, z + (rows > 1 ? (row ? .22 : -.22) : 0)], [.4, .065, .32], cloth);
    }
  }
}

/** Caps hung in a row on pegs, brims out along +Z. */
export function capRow(c: KitContext, m: THREE.Matrix4, x0: number, x1: number, y: number, z: number, offset = 0) {
  const count = Math.max(1, Math.floor((x1 - x0) / .42));
  for (let i = 0; i < count; i++) {
    const x = x0 + (i + .5) * (x1 - x0) / count, [cloth, print] = GARMENTS[(i * 3 + offset) % GARMENTS.length];
    tube(c.details, m, [x, y + .1, z + .05], .012, .1, P.steel, [Math.PI / 2, 0, 0]);
    c.details.shape(UNIT_CYLINDER, m, [x, y, z + .1], [.13, .09, .13], cloth, [Math.PI / 2, 0, 0]);
    block(c.details, m, [x, y - .1, z + .19], [.22, .02, .14], cloth, [-.25, 0, 0]);
    block(c.details, m, [x, y + .01, z + .19], [.07, .04, .006], print);
  }
}

/** A dress form on a round plinth, wearing a tee or a hoodie, facing +Z. */
export function mannequin(c: KitContext, m: THREE.Matrix4, x: number, z: number, cloth: string, print: string, hoodie = false) {
  const f = frame(m, [x, 0, z]);
  c.details.shape(UNIT_CYLINDER, f, [0, .07, 0], [.3, .14, .3], P.graphite);
  tube(c.details, f, [0, .45, 0], .025, .62, P.steel);
  for (const side of [-1, 1]) block(c.details, f, [side * .09, .62, 0], [.13, .5, .15], P.graphite);
  block(c.details, f, [0, 1.12, 0], [.44, .56, .25], cloth);
  for (const side of [-1, 1]) block(c.details, f, [side * .28, hoodie ? 1.02 : 1.23, 0], [.13, hoodie ? .5 : .2, .14], cloth, [0, 0, side * (hoodie ? .12 : .4)]);
  block(c.details, f, [0, 1.15, .128], [.2, .14, .006], print);
  if (hoodie) block(c.details, f, [0, 1.42, -.06], [.26, .14, .14], cloth);
  tube(c.details, f, [0, 1.45, 0], .045, .1, P.paper);
  c.details.shape(UNIT_LEAF, f, [0, 1.62, 0], [.13, .16, .13], P.paper);
}
