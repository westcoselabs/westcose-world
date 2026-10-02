/** Every catch as a low-poly, vertex-coloured model in one batch: fish, sharks, whales, the
 * Kraken, a submarine, the Sun and the junk, plus the variant dress-up (a tiny top hat, a tiny
 * WestCose hoodie, gold). Local frame: the head points +Z, the back +Y, length along Z. */
import * as THREE from 'three';
import { SceneryBatch } from '../scene/sceneryGeometry';
import { speciesById, type Species, type VariantId } from './species';

type Triple = [number, number, number];
const BOX = new THREE.BoxGeometry(1, 1, 1), SPHERE = new THREE.SphereGeometry(1, 14, 10), CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 10), TORUS = new THREE.TorusGeometry(1, .2, 6, 16), DOME = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const EYE = '#F4F1E8', PUPIL = '#1E2629', MOUTH = '#3A2A26', TOOTH = '#F4F1E8';
const IDENTITY = new THREE.Matrix4();

export interface CreatureModel { group: THREE.Group; length: number; dispose: () => void }

/** A builder over one batch: shapes in creature space, scaled to the catch's length. */
class Shape {
  constructor(readonly batch: SceneryBatch, readonly s: number) {}
  add(geometry: THREE.BufferGeometry, position: Triple, size: Triple, color: string, rotation: Triple = [0, 0, 0]) {
    const s = this.s;
    this.batch.shape(geometry, IDENTITY, [position[0] * s, position[1] * s, position[2] * s], [size[0] * s, size[1] * s, size[2] * s], color, rotation);
  }
  eye(x: number, y: number, z: number, r: number, side = 1) {
    this.add(SPHERE, [x, y, z], [r, r, r], EYE);
    this.add(SPHERE, [x + side * r * .45, y, z + r * .3], [r * .55, r * .55, r * .55], PUPIL);
  }
}

/** The classic fish: a two-tone body, a forked tail, fins, eyes and a mouth. Unit length 1. */
function fishBody(b: Shape, [top, belly, fin]: readonly string[], height = .32, width = .2, tail = 1) {
  b.add(SPHERE, [0, .02, 0], [width, height, .5], top);
  b.add(SPHERE, [0, -.06, .02], [width * .92, height * .78, .46], belly);
  for (const side of [-1, 1]) b.add(BOX, [0, side * .1 * tail, -.55], [.02, .26 * tail, .16], fin, [side * .55, 0, 0]);
  b.add(BOX, [0, height * .95, -.05], [.02, height * .55, .32], fin, [-.3, 0, 0]);
  for (const side of [-1, 1]) b.add(BOX, [side * width * .9, -.06, .12], [.02, .08, .16], fin, [.3, side * .4, 0]);
  for (const side of [-1, 1]) b.eye(side * width * .62, height * .3, .34, .05 * Math.max(1, height / .32), side);
  b.add(BOX, [0, -.02, .5], [width * .5, .03, .03], MOUTH);
}

function build(b: Shape, species: Species) {
  const [top, belly, fin] = species.look.colors;
  switch (species.look.body) {
    case 'fish': fishBody(b, species.look.colors); break;
    case 'flat':
      b.add(SPHERE, [0, 0, 0], [.42, .08, .5], top);
      b.add(SPHERE, [0, -.03, 0], [.4, .05, .48], belly);
      for (const side of [-1, 1]) b.add(BOX, [side * .4, 0, -.02], [.06, .02, .8], fin, [0, side * .05, 0]);
      b.add(BOX, [0, 0, -.55], [.3, .02, .16], fin);
      for (const x of [-.06, .07]) b.eye(x + .08, .08, .3, .04);
      break;
    case 'crab':
      b.add(SPHERE, [0, 0, 0], [.5, .22, .38], top);
      b.add(SPHERE, [0, -.07, 0], [.46, .14, .34], belly);
      for (const side of [-1, 1]) {
        b.add(BOX, [side * .45, .02, .38], [.12, .1, .3], top, [0, side * .5, 0]);
        b.add(SPHERE, [side * .55, .05, .6], [.16, .12, .14], top);
        b.add(BOX, [side * .62, .1, .7], [.05, .08, .14], fin, [0, side * .4, .3]);
        for (let leg = 0; leg < 3; leg++) b.add(BOX, [side * .55, -.08, -.2 + leg * .18], [.42, .05, .05], fin, [0, side * .3, side * -.5]);
        b.add(CYLINDER, [side * .12, .26, .3], [.025, .14, .025], fin);
        b.eye(side * .12, .35, .3, .05);
      }
      break;
    case 'squid':
      b.add(CONE, [0, 0, -.18], [.18, .64, .18], top, [-Math.PI / 2, 0, 0]);
      for (const side of [-1, 1]) b.add(BOX, [side * .14, 0, -.42], [.18, .02, .16], fin, [0, side * .3, 0]);
      b.add(SPHERE, [0, 0, .16], [.15, .15, .14], belly);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        b.add(CYLINDER, [Math.cos(a) * .07, Math.sin(a) * .07, .4], [.025, .36, .025], belly, [Math.PI / 2 + Math.sin(a) * .2, 0, Math.cos(a) * .2]);
      }
      for (const side of [-1, 1]) b.eye(side * .13, .05, .2, .055, side);
      break;
    case 'octopus':
      b.add(SPHERE, [0, .12, -.1], [.3, .3, .34], top);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        for (let k = 0; k < 4; k++) b.add(SPHERE, [Math.cos(a) * (.18 + k * .1), -.12 - k * .04, Math.sin(a) * (.18 + k * .1) + .08], [.07 - k * .012, .07 - k * .012, .07 - k * .012], k % 2 ? belly : top);
      }
      for (const side of [-1, 1]) b.eye(side * .14, .1, .18, .07, side);
      break;
    case 'shark': case 'hammerhead': {
      b.add(SPHERE, [0, 0, 0], [.13, .16, .5], top);
      b.add(SPHERE, [0, -.05, .04], [.12, .11, .44], belly);
      b.add(BOX, [0, .2, .02], [.02, .22, .16], fin, [-.5, 0, 0]);
      b.add(BOX, [0, .12, -.58], [.02, .3, .12], fin, [-.7, 0, 0]);
      b.add(BOX, [0, -.06, -.56], [.02, .16, .1], fin, [.6, 0, 0]);
      for (const side of [-1, 1]) b.add(BOX, [side * .15, -.08, .1], [.22, .02, .1], fin, [0, side * .5, side * -.2]);
      for (let g = 0; g < 3; g++) for (const side of [-1, 1]) b.add(BOX, [side * .12, .02, .26 - g * .04], [.005, .08, .01], MOUTH);
      if (species.look.body === 'hammerhead') {
        b.add(BOX, [0, .02, .46], [.42, .05, .1], top);
        for (const side of [-1, 1]) b.eye(side * .21, .04, .48, .025, side);
      } else for (const side of [-1, 1]) b.eye(side * .08, .06, .36, .025, side);
      b.add(BOX, [0, -.06, .44], [.12, .03, .05], MOUTH);
      for (let t = 0; t < 5; t++) b.add(CONE, [-.05 + t * .025, -.05, .465], [.008, .025, .008], TOOTH, [Math.PI, 0, 0]);
      break;
    }
    case 'billfish':
      fishBody(b, species.look.colors, .22, .14);
      b.add(CONE, [0, 0, .82], [.03, .62, .03], fin, [Math.PI / 2, 0, 0]);
      b.add(BOX, [0, .3, -.02], [.015, .34, .5], fin, [-.15, 0, 0]);
      break;
    case 'whale': case 'orca': {
      const orca = species.look.body === 'orca';
      b.add(SPHERE, [0, 0, 0], [.16, .15, .5], top);
      b.add(SPHERE, [0, -.05, .05], [.14, .1, .42], belly);
      b.add(BOX, [0, .02, -.55], [.36, .02, .12], fin, [0, 0, 0]);
      b.add(BOX, [0, orca ? .26 : .17, -.1], [.02, orca ? .24 : .05, .1], fin, [-.4, 0, 0]);
      for (const side of [-1, 1]) b.add(BOX, [side * .17, -.07, .15], [.16, .02, .07], fin, [0, side * .4, side * -.3]);
      if (orca) for (const side of [-1, 1]) b.add(SPHERE, [side * .1, .05, .3], [.045, .03, .08], belly);
      else for (let g = 0; g < 6; g++) b.add(BOX, [0, -.12, .3 - g * .05], [.12, .005, .01], fin);
      for (const side of [-1, 1]) b.eye(side * .13, -.01, .3, .018, side);
      break;
    }
    case 'kraken':
      b.add(SPHERE, [0, .25, -.15], [.32, .36, .34], top);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        for (let k = 0; k < 6; k++) {
          const r = .2 + k * .11, curl = k * .25;
          b.add(SPHERE, [Math.cos(a + curl) * r, -.1 - k * .03 + Math.sin(k + i) * .04, Math.sin(a + curl) * r + .05], [.07 - k * .008, .07 - k * .008, .07 - k * .008], k % 2 ? belly : top);
        }
      }
      for (const side of [-1, 1]) { b.add(SPHERE, [side * .15, .25, .14], [.08, .08, .06], '#FFE08A'); b.add(BOX, [side * .15, .25, .2], [.02, .07, .01], PUPIL); }
      break;
    case 'submarine':
      b.add(CYLINDER, [0, 0, 0], [.1, .9, .1], top, [Math.PI / 2, 0, 0]);
      b.add(SPHERE, [0, 0, .45], [.1, .1, .08], top);
      b.add(CONE, [0, 0, -.5], [.1, .12, .1], top, [-Math.PI / 2, 0, 0]);
      b.add(BOX, [0, .13, .1], [.06, .12, .16], belly);
      b.add(CYLINDER, [0, .26, .12], [.008, .14, .008], belly);
      b.add(BOX, [0, .33, .135], [.012, .012, .04], belly);
      for (const side of [-1, 1]) b.add(BOX, [side * .12, 0, -.38], [.12, .01, .05], belly);
      for (let i = 0; i < 4; i++) for (const side of [-1, 1]) b.add(CYLINDER, [side * .098, .02, .25 - i * .14], [.02, .01, .02], fin, [0, 0, Math.PI / 2]);
      b.add(BOX, [0, 0, -.58], [.16, .02, .02], fin);
      break;
    case 'sun':
      b.add(SPHERE, [0, 0, 0], [.42, .42, .42], top);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        b.add(CONE, [Math.cos(a) * .52, Math.sin(a) * .52, 0], [.07, .18, .04], i % 2 ? belly : fin, [0, 0, a - Math.PI / 2]);
      }
      // A smug face: half-closed eyes and a grin.
      for (const side of [-1, 1]) { b.add(BOX, [side * .14, .1, .4], [.1, .025, .02], PUPIL, [0, 0, side * .15]); b.add(SPHERE, [side * .24, -.05, .36], [.06, .035, .02], '#FF7A3D'); }
      b.add(BOX, [0, -.13, .41], [.2, .025, .02], PUPIL);
      for (const side of [-1, 1]) b.add(BOX, [side * .11, -.11, .405], [.05, .025, .02], PUPIL, [0, 0, side * .6]);
      break;
    case 'boot':
      b.add(BOX, [0, .1, -.1], [.36, .7, .4], top);
      b.add(BOX, [0, -.18, .2], [.36, .22, .7], top);
      b.add(BOX, [0, -.3, .1], [.38, .06, .92], belly);
      for (let i = 0; i < 4; i++) b.add(BOX, [0, .3 - i * .12, .1], [.3, .02, .02], fin);
      break;
    case 'sock':
      b.add(CYLINDER, [0, .2, 0], [.14, .6, .14], top);
      b.add(BOX, [0, -.15, .16], [.26, .2, .5], top, [.2, 0, 0]);
      b.add(CYLINDER, [0, .48, 0], [.15, .08, .15], belly);
      b.add(CYLINDER, [0, .34, 0], [.145, .05, .145], fin);
      break;
    case 'cone':
      b.add(CONE, [0, .1, 0], [.3, .8, .3], top);
      b.add(CYLINDER, [0, .14, 0], [.2, .08, .2], belly);
      b.add(BOX, [0, -.32, 0], [.7, .06, .7], fin);
      break;
    case 'duck':
      b.add(SPHERE, [0, 0, 0], [.4, .3, .5], top);
      b.add(SPHERE, [0, .32, .3], [.22, .22, .22], top);
      b.add(BOX, [0, .3, .55], [.16, .06, .14], belly);
      b.add(BOX, [0, .1, -.48], [.08, .14, .1], top, [-.6, 0, 0]);
      for (const side of [-1, 1]) b.eye(side * .12, .4, .44, .04, side);
      break;
    case 'bottle':
      b.add(CYLINDER, [0, 0, 0], [.16, .55, .16], top, [Math.PI / 2, 0, 0]);
      b.add(CYLINDER, [0, 0, .36], [.07, .2, .07], top, [Math.PI / 2, 0, 0]);
      b.add(CYLINDER, [0, 0, .49], [.06, .08, .06], fin, [Math.PI / 2, 0, 0]);
      b.add(CYLINDER, [0, 0, 0], [.06, .4, .06], belly, [Math.PI / 2, 0, 0]);
      break;
    case 'tee':
      b.add(BOX, [0, 0, 0], [.6, .7, .04], top);
      for (const side of [-1, 1]) b.add(BOX, [side * .38, .22, 0], [.26, .22, .04], top, [0, 0, side * -.5]);
      b.add(BOX, [0, .1, .025], [.3, .12, .01], belly);
      b.add(BOX, [0, .33, .02], [.18, .04, .01], fin);
      break;
  }
}

/** The fancy variant's tiny top hat and monocle; the drip variant's tiny WestCose hoodie. */
function dress(b: Shape, species: Species, variant: VariantId) {
  const body = species.look.body, crown = body === 'sun' ? .44 : body === 'kraken' || body === 'octopus' ? .5 : body === 'crab' ? .3 : .3;
  const front = body === 'sun' || body === 'octopus' || body === 'kraken' || body === 'crab' || body === 'duck' ? 0 : .28;
  if (variant === 'fancy') {
    b.add(CYLINDER, [0, crown + .12, front], [.09, .22, .09], '#1E2629');
    b.add(CYLINDER, [0, crown + .02, front], [.15, .02, .15], '#1E2629');
    b.add(CYLINDER, [0, crown + .05, front], [.092, .03, .092], '#A66A45');
    b.add(TORUS, [.12, crown * .4, front + .1], [.045, .045, .045], '#D9A441', [0, Math.PI / 2, 0]);
  } else if (variant === 'drip') {
    b.add(CYLINDER, [0, 0, front * .3], [.24, .32, .24], '#E9DFCE', [Math.PI / 2, 0, 0]);
    b.add(BOX, [0, .05, front * .3 + .02], [.2, .08, .005], '#A66A45');
    b.add(DOME, [0, .12, front * .3 + .14], [.18, .14, .14], '#E9DFCE', [-Math.PI / 2.5, 0, 0]);
  }
}

const GOLD = ['#E4B36E', '#F2D48B', '#B98A3E'] as const;

/** A fresh model of a catch, `length` metres long (Chonky catches are wider, not longer). */
export function createCreature(id: string, variant: VariantId = 'normal'): CreatureModel {
  const species = speciesById(id), length = species.look.length;
  const batch = new SceneryBatch(), shape = new Shape(batch, length);
  const look = variant === 'golden' ? { ...species, look: { ...species.look, colors: GOLD } } : species;
  build(shape, look);
  dress(shape, species, variant);
  const geometry = batch.finish();
  const sun = species.look.body === 'sun';
  const material = variant === 'golden'
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .85, roughness: .25, emissive: '#5A3E10', emissiveIntensity: .25 })
    : sun ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      : new THREE.MeshToonMaterial({ vertexColors: true, emissive: variant === 'shiny' ? '#6FB7C9' : '#000000', emissiveIntensity: variant === 'shiny' ? .45 : 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = !sun;
  const group = new THREE.Group(); group.name = `catch-${id}`;
  group.add(mesh);
  if (variant === 'chonky') mesh.scale.set(1.45, 1.35, 1);
  let sparkle: THREE.Points | null = null;
  if (variant === 'shiny' || variant === 'golden') {
    // A few glints that the controller twinkles.
    const points = new Float32Array(18 * 3);
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, h = (i / 18 - .5) * length * .9;
      points.set([Math.cos(a) * length * .22, Math.sin(a) * length * .16, h], i * 3);
    }
    const sparkleGeometry = new THREE.BufferGeometry();
    sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    sparkle = new THREE.Points(sparkleGeometry, new THREE.PointsMaterial({ color: '#FFF6D8', size: Math.max(.05, length * .05), transparent: true, opacity: .85, depthWrite: false }));
    sparkle.name = 'sparkle';
    group.add(sparkle);
  }
  return {
    group, length,
    dispose: () => {
      geometry.dispose(); material.dispose();
      if (sparkle) { sparkle.geometry.dispose(); (sparkle.material as THREE.Material).dispose(); }
    },
  };
}
