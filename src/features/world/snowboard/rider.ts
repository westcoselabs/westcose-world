/** A low-poly rider on a board, in the walker's toon style (bone jacket, rust pack, slate
 * beanie). Built imperatively so the controller poses it in the same frame as the camera.
 * Local frame: +Z the board nose, +Y the base normal, +X the board's left edge. A regular
 * rider leads with the left foot and faces -X (the toe edge). */
import * as THREE from 'three';
import type { BoardState, GrabId } from './physics';

const JACKET = '#eee7d4', PACK = '#bf7957', SKIN = '#c58d6a', BEANIE = '#253f4b', PANTS = '#2c4047', BOOT = '#28333a', BOARD = '#e4b36e', BOARD_BASE = '#334c48';
const material = (color: string) => new THREE.MeshToonMaterial({ color });

export interface RiderModel {
  group: THREE.Group;
  board: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  frontArm: THREE.Group;
  backArm: THREE.Group;
  frontLeg: THREE.Mesh;
  backLeg: THREE.Mesh;
  shadow: THREE.Mesh;
  dispose: () => void;
}

export function createRiderModel(): RiderModel {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const mesh = (geometry: THREE.BufferGeometry, color: string, position: [number, number, number], rotation?: [number, number, number]) => {
    const m = material(color); geometries.push(geometry); materials.push(m);
    const result = new THREE.Mesh(geometry, m);
    result.position.set(...position); if (rotation) result.rotation.set(...rotation);
    result.castShadow = true;
    return result;
  };
  const group = new THREE.Group(); group.name = 'snowboard-rider';
  const board = new THREE.Group();
  board.add(mesh(new THREE.BoxGeometry(.29, .035, 1.18), BOARD, [0, .02, 0]));
  board.add(mesh(new THREE.BoxGeometry(.29, .012, 1.2), BOARD_BASE, [0, 0, 0]));
  for (const end of [1, -1]) board.add(mesh(new THREE.BoxGeometry(.27, .035, .26), BOARD, [0, .07, end * .69], [end * -.42, 0, 0]));
  for (const z of [.25, -.25]) board.add(mesh(new THREE.BoxGeometry(.24, .07, .14), BOOT, [0, .07, z]));
  group.add(board);

  const body = new THREE.Group(); board.add(body);
  const hips = new THREE.Group(); hips.position.set(0, .92, 0); body.add(hips);
  const frontLeg = mesh(new THREE.BoxGeometry(.2, 1, .2), PANTS, [0, 0, .25]);
  const backLeg = mesh(new THREE.BoxGeometry(.2, 1, .2), PANTS, [0, 0, -.25]);
  body.add(frontLeg, backLeg);
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(mesh(new THREE.CapsuleGeometry(.24, .34, 4, 10), JACKET, [0, .3, 0]));
  torso.add(mesh(new THREE.BoxGeometry(.16, .42, .34), PACK, [.22, .3, 0]));
  const head = new THREE.Group(); head.position.set(0, .74, 0); torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(.2, 12, 10), SKIN, [0, 0, 0]));
  head.add(mesh(new THREE.SphereGeometry(.215, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), BEANIE, [0, .03, 0]));
  head.add(mesh(new THREE.BoxGeometry(.06, .07, .3), BOOT, [-.18, .02, 0]));
  const arm = (side: 1 | -1) => {
    const shoulder = new THREE.Group(); shoulder.position.set(0, .5, side * .27);
    shoulder.add(mesh(new THREE.CapsuleGeometry(.075, .36, 4, 8), JACKET, [0, -.24, 0]));
    shoulder.add(mesh(new THREE.SphereGeometry(.075, 8, 8), SKIN, [0, -.47, 0]));
    torso.add(shoulder);
    return shoulder;
  };
  const frontArm = arm(1), backArm = arm(-1);

  const shadowGeometry = new THREE.CircleGeometry(.62, 24), shadowMaterial = new THREE.MeshBasicMaterial({ color: '#1d3236', transparent: true, opacity: .3, depthWrite: false });
  geometries.push(shadowGeometry); materials.push(shadowMaterial);
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.name = 'snowboard-shadow'; shadow.renderOrder = 1;
  return {
    group, board, body, hips, torso, head, frontArm, backArm, frontLeg, backLeg, shadow,
    dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}

const basis = new THREE.Matrix4(), right = new THREE.Vector3();
const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
export type RiderPose = { lean: number; crouch: number; tuck: number; grab: number; grabId: GrabId | null; tumble: number; stop: number; stopSide: number };
export const createPose = (): RiderPose => ({ lean: 0, crouch: 0, tuck: 0, grab: 0, grabId: null, tumble: 0, stop: 0, stopSide: 1 });

/** Place and pose the rider from the physics state (called once per rendered frame). */
export function poseRider(model: RiderModel, board: BoardState, pose: RiderPose, dt: number, reduced: boolean) {
  const facing = board.switchStance ? -1 : 1;
  pose.lean = damp(pose.lean, board.airborne || board.crashed ? 0 : board.edge * .85 * facing, 12, dt);
  pose.crouch = damp(pose.crouch, board.crouch, 14, dt);
  pose.tuck = damp(pose.tuck, board.tucking && !board.airborne ? 1 : 0, 8, dt);
  pose.grab = damp(pose.grab, board.grab ? 1 : 0, 16, dt);
  if (board.grab) pose.grabId = board.grab;
  pose.tumble = board.crashed ? pose.tumble + dt : 0;
  // Hockey stop: swing the board across the line, toward the side being steered.
  const stopping = board.braking && !board.airborne && !board.crashed && board.velocity.length() > 1;
  if (stopping && pose.stop < .05 && Math.abs(board.edge) > .02) pose.stopSide = board.edge > 0 ? 1 : -1;
  pose.stop = damp(pose.stop, stopping ? 1 : 0, 9, dt);

  right.crossVectors(board.boardUp, board.heading).normalize();
  basis.makeBasis(right, board.boardUp, board.heading);
  model.group.quaternion.setFromRotationMatrix(basis);
  model.group.position.copy(board.position);

  // Edge: the board tilts onto its edge and the body leans into the turn; a hockey stop
  // turns the board across the travel line and leans the rider back against it.
  model.board.rotation.set(0, -pose.stop * pose.stopSide * facing * 1.05, pose.lean * .55 - pose.stop * .25);
  model.body.rotation.set(0, 0, pose.lean * .5 - pose.stop * .2);
  const crouch = Math.max(pose.crouch, pose.tuck * .8, pose.grab);
  const hip = .92 - .34 * crouch;
  model.hips.position.y = hip;
  for (const leg of [model.frontLeg, model.backLeg]) { leg.scale.y = hip - .06; leg.position.y = .06 + (hip - .06) / 2; }
  const grab = pose.grab, id = pose.grabId;
  // The chest faces the toe edge (-X); lean forward over the knees as the rider crouches.
  model.torso.rotation.set(0, 0, .25 + crouch * .5 + grab * .3);
  model.head.rotation.set(0, Math.PI * .42 * facing, -crouch * .4);
  // Arms: out along the board for balance (front arm toward the nose), tucked in front of
  // the chest for speed, or reaching down to an edge for a grab.
  const balance = 1 - Math.max(pose.tuck, grab);
  model.frontArm.rotation.set(-balance * 1.05, 0, -pose.tuck * 1.1);
  model.backArm.rotation.set(balance * 1.05, 0, -pose.tuck * .9);
  if (grab > .01 && id) {
    // Indy: back hand to the toe edge. Melon and method: front hand to the heel edge.
    const reach = id === 'indy' ? model.backArm : model.frontArm;
    reach.rotation.set(reach.rotation.x * (1 - grab), 0, reach.rotation.z * (1 - grab) + grab * (id === 'indy' ? -.35 : .7));
    if (id === 'method') model.frontLeg.rotation.x = grab * .25;
  } else model.frontLeg.rotation.x = 0;
  const wobble = reduced ? 0 : Math.sin(performance.now() * .018) * .02 * Math.min(1, board.velocity.length() / 20) * (board.airborne ? 0 : 1);
  model.board.position.y = wobble;
  if (board.crashed) {
    // Tumble, then settle flat until the respawn.
    const t = pose.tumble;
    model.body.rotation.set(reduced ? 1.35 : Math.min(1.35, t * 4) + (reduced ? 0 : Math.max(0, .6 - t) * Math.sin(t * 18) * .4), 0, reduced ? 0 : Math.min(t, .6) * 5);
    model.board.rotation.set(0, 0, reduced ? .4 : Math.min(t * 3, 1.2));
  }
}

/** Keep the blob shadow on the snow below the rider, fading with height. */
export function placeShadow(model: RiderModel, groundPoint: THREE.Vector3, groundNormal: THREE.Vector3, height: number) {
  const shadow = model.shadow;
  shadow.position.copy(groundPoint).addScaledVector(groundNormal, .04);
  shadow.quaternion.setFromUnitVectors(Z_AXIS, groundNormal);
  const fade = Math.max(0, 1 - height / 7);
  (shadow.material as THREE.MeshBasicMaterial).opacity = .34 * fade;
  shadow.scale.setScalar(1 + Math.min(height, 7) * .07);
  shadow.visible = fade > .02;
}
const Z_AXIS = new THREE.Vector3(0, 0, 1);
