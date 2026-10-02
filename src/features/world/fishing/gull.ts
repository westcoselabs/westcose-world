/** Gary, the pier's gull, and the friends he calls for big fish. Gary is a few vertex-coloured
 * pieces so his wings flap; the flock is one instanced mesh. Local frame: Gary faces +Z, +Y up. */
import * as THREE from 'three';
import { SceneryBatch } from '../scene/sceneryGeometry';

const WHITE = '#F1EFE6', GREY = '#9AA4A3', WINGTIP = '#2B3536', BEAK = '#E9B44C', LEG = '#E08A4B', EYE = '#1E2629';
const BOX = new THREE.BoxGeometry(1, 1, 1), SPHERE = new THREE.SphereGeometry(1, 10, 8), CONE = new THREE.ConeGeometry(1, 1, 6);
const IDENTITY = new THREE.Matrix4();
export const FLOCK_SIZE = 14;

export interface GullModel {
  group: THREE.Group; head: THREE.Group; wings: [THREE.Group, THREE.Group];
  flock: THREE.InstancedMesh;
  dispose: () => void;
}

function wing(b: SceneryBatch, side: number) {
  b.shape(BOX, IDENTITY, [side * .16, 0, -.02], [.3, .025, .16], GREY);
  b.shape(BOX, IDENTITY, [side * .36, 0, -.05], [.14, .02, .12], WINGTIP);
}

export function createGull(): GullModel {
  const geometries: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshToonMaterial({ vertexColors: true });
  const baked = (build: (batch: SceneryBatch) => void) => {
    const batch = new SceneryBatch(); build(batch);
    const geometry = batch.finish(); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true;
    return mesh;
  };
  const group = new THREE.Group(); group.name = 'gary';
  group.add(baked(b => {
    b.shape(SPHERE, IDENTITY, [0, .16, 0], [.11, .1, .2], WHITE);
    b.shape(BOX, IDENTITY, [0, .2, -.06], [.16, .05, .24], GREY);
    b.shape(BOX, IDENTITY, [0, .17, -.22], [.1, .03, .12], WINGTIP, [.25, 0, 0]);
    for (const x of [-.04, .04]) b.shape(BOX, IDENTITY, [x, .04, 0], [.015, .1, .015], LEG);
    for (const x of [-.04, .04]) b.shape(BOX, IDENTITY, [x, 0, .03], [.04, .01, .06], LEG);
  }));
  const head = new THREE.Group(); head.position.set(0, .27, .16); group.add(head);
  head.add(baked(b => {
    b.shape(SPHERE, IDENTITY, [0, 0, 0], [.07, .065, .075], WHITE);
    b.shape(CONE, IDENTITY, [0, -.01, .1], [.022, .08, .018], BEAK, [Math.PI / 2, 0, 0]);
    b.shape(SPHERE, IDENTITY, [0, -.025, .115], [.012, .012, .012], '#C4553F');
    for (const x of [-.045, .045]) b.shape(SPHERE, IDENTITY, [x, .015, .035], [.012, .012, .012], EYE);
  }));
  const wings = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .08, .2, -.02);
    pivot.add(baked(b => wing(b, side)));
    group.add(pivot);
    return pivot;
  }) as [THREE.Group, THREE.Group];

  // The flock: a gull with spread wings, one draw call for every friend.
  const silhouette = new SceneryBatch();
  silhouette.shape(SPHERE, IDENTITY, [0, 0, 0], [.11, .09, .2], WHITE);
  silhouette.shape(SPHERE, IDENTITY, [0, .05, .18], [.065, .06, .07], WHITE);
  silhouette.shape(CONE, IDENTITY, [0, .04, .27], [.02, .07, .016], BEAK, [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) wing(silhouette, side);
  const flockGeometry = silhouette.finish(); geometries.push(flockGeometry);
  const flock = new THREE.InstancedMesh(flockGeometry, material, FLOCK_SIZE);
  flock.frustumCulled = false; flock.count = 0;
  return { group, head, wings, flock, dispose: () => { geometries.forEach(g => g.dispose()); material.dispose(); flock.dispose(); } };
}

/** Wings folded back along the body at 0, spread and beating at 1; the head turns toward
 * `look` (radians). */
export function poseGull(model: GullModel, flap: number, phase: number, look: number) {
  const beat = flap > .01 ? Math.sin(phase * 14) * .8 * flap : 0;
  model.wings.forEach((wing, i) => { const side = i === 0 ? -1 : 1; wing.rotation.set(0, side * 1.35 * (1 - flap), side * beat); });
  model.head.rotation.set(0, look, 0);
}
