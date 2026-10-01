import * as THREE from 'three';
import { block, type KitContext } from './context';
import { TOWN_PALETTE as P } from './materials';

/** Shared openings for the building kit: framed windows and closed doors. */
export function windowModule(c: KitContext, m: THREE.Matrix4, x: number, y: number, z: number, width: number, height: number, trim: string, warm = false, shutters = false) {
  // A dark reveal behind a proud frame gives the glass actual depth.
  block(c.details, m, [x, y, z], [width + 0.22, height + 0.22, 0.066], P.graphite);
  block(c.glow, m, [x, y, z + 0.044], [width, height, 0.022], warm ? P.warmGlass : P.glass);
  for (const side of [-1, 1]) {
    block(c.details, m, [x + side * (width / 2 + 0.055), y, z + 0.085], [0.11, height + 0.21, 0.135], trim);
    block(c.details, m, [x, y + side * (height / 2 + 0.055), z + 0.085], [width + 0.2, 0.11, 0.135], trim);
  }
  block(c.details, m, [x, y + height / 2 + 0.18, z + 0.055], [width + 0.38, 0.1, 0.22], P.concrete);
  block(c.details, m, [x, y - height / 2 - 0.165, z + 0.13], [width + 0.42, 0.15, 0.37], trim);
  block(c.details, m, [x, y - height / 2 - 0.12, z + 0.315], [width + 0.43, 0.065, 0.065], P.concrete);
  block(c.details, m, [x, y, z + 0.069], [0.045, height, 0.03], trim);
  if (height > 1.15) block(c.details, m, [x, y - height * 0.12, z + 0.07], [width, 0.041, 0.031], trim);
  if (width > 1.7) for (const sx of [-width / 4, width / 4]) block(c.details, m, [x + sx, y, z + 0.069], [0.037, height, 0.03], trim);
  if (warm && width > 0.8) {
    for (const side of [-1, 1]) for (let fold = 0; fold < 3; fold++) {
      block(c.details, m, [x + side * (width * 0.36 + fold * width * 0.045), y + height * 0.015, z + 0.062], [width * 0.055, height * (0.89 - fold * 0.025), 0.021], fold % 2 ? P.paper : P.paleTimber);
    }
  }
  if (shutters) for (const side of [-1, 1]) {
    block(c.details, m, [x + side * (width / 2 + 0.27), y, z], [0.3, height + 0.1, 0.08], P.blue);
    for (let j = 0; j < 6; j++) block(c.details, m, [x + side * (width / 2 + 0.27), y - height * 0.42 + j * height * 0.168, z + 0.044], [0.25, 0.024, 0.023], P.steel);
    for (const vertical of [-1, 1]) block(c.details, m, [x + side * (width / 2 + 0.18), y + vertical * height * 0.32, z + 0.058], [0.13, 0.055, 0.028], P.graphite);
  }
}

export function closedDoor(c: KitContext, m: THREE.Matrix4, x: number, z: number, width: number, color: string, glazed = true) {
  block(c.details, m, [x, 1.17, z], [width + 0.18, 2.4, 0.12], P.graphite);
  block(c.details, m, [x, 1.14, z + 0.07], [width, 2.28, 0.045], color);
  block(c.details, m, [x, 0.47, z + 0.099], [width * 0.77, 0.68, 0.022], P.steel);
  block(c.details, m, [x, 0.47, z + 0.115], [width * 0.64, 0.54, 0.018], color);
  if (glazed) windowModule(c, m, x, 1.62, z + 0.099, width * 0.69, 0.69, color, true);
  block(c.details, m, [x + width * 0.32, 1.04, z + 0.12], [0.035, 0.23, 0.045], P.bone);
}

