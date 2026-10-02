/** The Pier Pressure angler: the walker's look (bone jacket, rust pack, slate cap, blue shoes)
 * holding a rod that bends with line tension. Built imperatively from a few vertex-coloured
 * batches so the controller poses it in the same frame as the camera. Local frame: +Z faces the
 * sea, +Y up, +X toward the angler's left. */
import * as THREE from 'three';
import { SceneryBatch } from '../scene/sceneryGeometry';

const JACKET = '#eee7d4', CHEST = '#d9d7c9', SKIN = '#c58d6a', CAP = '#253f4b', PACK = '#bf7957', PANTS = '#2c4047', SHOE = '#729eab', SOLE = '#ece9d7';
const GRIP = '#c4ac87', BLANK = '#2b3536', REEL = '#647778', THREAD = '#e5b574';
const BOX = new THREE.BoxGeometry(1, 1, 1), SPHERE = new THREE.SphereGeometry(1, 12, 10), CAPSULE = new THREE.CapsuleGeometry(1, 1, 4, 10);
const DOME = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8);
const IDENTITY = new THREE.Matrix4();
const SEGMENTS = 6, BLANK_LENGTH = 2.3, GRIP_BACK = .32;

export interface AnglerModel {
  group: THREE.Group;
  body: THREE.Group; head: THREE.Group; arms: [THREE.Group, THREE.Group];
  rod: THREE.InstancedMesh; grip: THREE.Mesh;
  dispose: () => void;
}
export interface AnglerPose {
  /** Rod angle above the horizon and across (+ toward the angler's left), radians. */
  pitch: number; yaw: number;
  /** How hard the rod bends toward the line, 0..1. */
  bend: number;
  /** Lean back against the fish, 0..1; sat down after a snap, 0..1; holding a catch up, 0..1. */
  lean: number; sit: number; cheer: number;
}
export const createAnglerPose = (): AnglerPose => ({ pitch: .5, yaw: 0, bend: 0, lean: 0, sit: 0, cheer: 0 });

export function createAnglerModel(): AnglerModel {
  const geometries: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshToonMaterial({ vertexColors: true });
  const baked = (build: (batch: SceneryBatch) => void) => {
    const batch = new SceneryBatch(); build(batch);
    const geometry = batch.finish(); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true;
    return mesh;
  };
  const group = new THREE.Group(); group.name = 'angler';
  const body = new THREE.Group(); group.add(body);
  body.add(baked(b => {
    for (const x of [-.15, .15]) {
      b.shape(BOX, IDENTITY, [x, .63, 0], [.265, .38, .32], PANTS);
      b.shape(CAPSULE, IDENTITY, [x, .3, 0], [.085, .27, .085], SKIN);
      b.shape(BOX, IDENTITY, [x, .12, .055], [.22, .17, .37], SHOE);
      b.shape(BOX, IDENTITY, [x, .035, .055], [.225, .055, .38], SOLE);
    }
    b.shape(CAPSULE, IDENTITY, [0, 1.13, 0], [.285, .36, .285], JACKET);
    b.shape(SPHERE, IDENTITY, [0, 1.41, -.11], [.26, .26, .26], CHEST);
    b.shape(BOX, IDENTITY, [0, 1.04, -.265], [.37, .47, .16], PACK);
    b.shape(BOX, IDENTITY, [0, 1.08, -.355], [.13, .04, .012], SOLE);
  }));
  const head = new THREE.Group(); head.position.set(0, 1.62, .015); body.add(head);
  head.add(baked(b => {
    b.shape(SPHERE, IDENTITY, [0, 0, 0], [.235, .235, .235], SKIN);
    b.shape(DOME, IDENTITY, [0, .14, 0], [.25, .25, .25], CAP);
    b.shape(BOX, IDENTITY, [0, .145, .2], [.38, .045, .25], CAP);
    for (const x of [-.075, .075]) b.shape(SPHERE, IDENTITY, [x, .01, .216], [.019, .019, .019], '#28333a');
  }));
  const arm = (side: 1 | -1) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .33, 1.31, 0);
    shoulder.add(baked(b => {
      b.shape(CAPSULE, IDENTITY, [0, -.2, 0], [.105, .27, .105], JACKET);
      b.shape(SPHERE, IDENTITY, [0, -.41, 0], [.09, .09, .09], SKIN);
    }));
    body.add(shoulder);
    return shoulder;
  };
  const arms: [THREE.Group, THREE.Group] = [arm(1), arm(-1)];

  // The rod: a cork grip and reel in the hands, and a blank of tapering segments that bend.
  const grip = baked(b => {
    b.shape(CYLINDER, IDENTITY, [0, -GRIP_BACK / 2 + .06, 0], [.024, GRIP_BACK + .12, .024], GRIP);
    b.shape(CYLINDER, IDENTITY, [0, -.02, -.045], [.045, .05, .045], REEL, [0, 0, Math.PI / 2]);
    b.shape(BOX, IDENTITY, [0, -.02, -.02], [.02, .05, .03], REEL);
  });
  body.add(grip);
  const blankGeometry = new THREE.CylinderGeometry(1, 1, 1, 6); geometries.push(blankGeometry);
  const blankMaterial = new THREE.MeshToonMaterial({ color: BLANK });
  const rod = new THREE.InstancedMesh(blankGeometry, blankMaterial, SEGMENTS + 1);
  rod.castShadow = true; rod.frustumCulled = false;
  rod.setColorAt(SEGMENTS, new THREE.Color(THREAD));
  for (let i = 0; i < SEGMENTS; i++) rod.setColorAt(i, new THREE.Color(BLANK));
  body.add(rod);
  return {
    group, body, head, arms, rod, grip,
    dispose: () => { geometries.forEach(g => g.dispose()); material.dispose(); blankMaterial.dispose(); rod.dispose(); },
  };
}

const hand = new THREE.Vector3(), direction = new THREE.Vector3(), axis = new THREE.Vector3(), segment = new THREE.Vector3();
const start = new THREE.Vector3(), mid = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
const matrix = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0), bendQuaternion = new THREE.Quaternion();

/** Pose the angler and bend the rod. Returns the rod tip in the angler's local frame. */
export function poseAngler(model: AnglerModel, pose: AnglerPose, tip: THREE.Vector3) {
  const { body, head, arms, rod, grip } = model;
  // Sitting down after a snap; leaning back against a fish; holding a catch up.
  body.position.set(0, -.62 * pose.sit, -.25 * pose.sit);
  body.rotation.set(-.22 * pose.lean - .35 * pose.sit, 0, 0);
  head.rotation.set(.15 - .25 * pose.cheer + .2 * pose.lean, pose.yaw * .4, 0);
  const raise = 1.1 + .35 * pose.cheer + .25 * pose.pitch;
  arms[0].rotation.set(-raise, 0, -.6 + .25 * pose.cheer);
  arms[1].rotation.set(-raise, 0, .6 - .25 * pose.cheer);
  // Hands meet in front of the chest; the rod leaves them along pitch and yaw.
  hand.set(0, 1.16 + .12 * pose.cheer + .06 * pose.pitch, .3);
  direction.set(Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), Math.cos(pose.yaw) * Math.cos(pose.pitch)).normalize();
  grip.position.copy(hand);
  grip.quaternion.setFromUnitVectors(Y, direction);
  // Each segment turns a little further down toward the line as the rod loads up.
  axis.crossVectors(direction, Y).normalize();
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  start.copy(hand).addScaledVector(direction, .06);
  const length = BLANK_LENGTH / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    bendQuaternion.setFromAxisAngle(axis, -1.15 * pose.bend * ((i + 1) / SEGMENTS) ** 1.6);
    segment.copy(direction).applyQuaternion(bendQuaternion);
    mid.copy(start).addScaledVector(segment, length / 2);
    quaternion.setFromUnitVectors(Y, segment);
    const radius = .02 * (1 - i / SEGMENTS) + .006;
    rod.setMatrixAt(i, matrix.compose(mid, quaternion, scale.set(radius, length, radius)));
    start.addScaledVector(segment, length);
  }
  // The thread wrap and the tip guide.
  rod.setMatrixAt(SEGMENTS, matrix.compose(start, quaternion, scale.set(.012, .03, .012)));
  rod.instanceMatrix.needsUpdate = true;
  return tip.copy(start).applyMatrix4(body.matrix.compose(body.position, body.quaternion.setFromEuler(body.rotation), body.scale));
}
