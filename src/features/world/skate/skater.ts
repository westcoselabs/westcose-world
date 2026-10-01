/** A low-poly skater in the walker's toon style (bone shirt, rust pack, slate cap, blue
 * shoes) on a skateboard. Built imperatively so the controller poses it in the same frame
 * as the camera. Local frame: +Z the board nose, +Y the board normal, +X the board's left
 * edge. A regular skater leads with the left foot and faces the toe edge (-X). */
import * as THREE from 'three';
import type { SkaterState } from './physics';
import { flipPose } from './physics';
import { GRINDS, type GrabId } from './tricks';

const SHIRT = '#eee7d4', SKIN = '#c58d6a', CAP = '#253f4b', SHORTS = '#2c4047', SHOE = '#729eab', SOLE = '#ece9d7', PACK = '#bf7957';
const GRIP = '#2a2f31', WOOD = '#c9ae86', GRAPHIC = '#bf5f3f', TRUCK = '#9aa4a3', WHEEL = '#efe6cf';
const THIGH = .42, SHIN = .42, UPPER_ARM = .3, FOREARM = .3, DECK = .1;

export interface SkaterModel {
  group: THREE.Group;
  board: THREE.Group;
  body: THREE.Group;
  shadow: THREE.Mesh;
  parts: {
    thighs: THREE.Mesh[]; shins: THREE.Mesh[]; shoes: THREE.Group[]; upperArms: THREE.Mesh[]; forearms: THREE.Mesh[]; hands: THREE.Mesh[];
    hips: THREE.Mesh; torso: THREE.Group; head: THREE.Group;
  };
  dispose: () => void;
}

export function createSkaterModel(): SkaterModel {
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.Material>();
  const material = (color: string) => { let m = materials.get(color); if (!m) { m = new THREE.MeshToonMaterial({ color }); materials.set(color, m); } return m; };
  const mesh = (geometry: THREE.BufferGeometry, color: string, position: [number, number, number] = [0, 0, 0], rotation?: [number, number, number]) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material(color));
    m.position.set(...position); if (rotation) m.rotation.set(...rotation);
    m.castShadow = true;
    return m;
  };
  const group = new THREE.Group(); group.name = 'skater';

  // Board: deck with kicked nose and tail, grip on top, graphic underneath, trucks and wheels.
  const board = new THREE.Group(); board.position.y = DECK;
  board.add(mesh(new THREE.BoxGeometry(.21, .022, .62), WOOD));
  board.add(mesh(new THREE.BoxGeometry(.2, .006, .6), GRIP, [0, .014, 0]));
  board.add(mesh(new THREE.BoxGeometry(.2, .004, .6), GRAPHIC, [0, -.013, 0]));
  for (const end of [1, -1]) {
    const kick = new THREE.Group(); kick.position.set(0, 0, end * .31); kick.rotation.x = -end * .38; board.add(kick);
    kick.add(mesh(new THREE.BoxGeometry(.21, .022, .16), WOOD, [0, 0, end * .07]));
    kick.add(mesh(new THREE.BoxGeometry(.2, .006, .15), GRIP, [0, .014, end * .07]));
    board.add(mesh(new THREE.BoxGeometry(.05, .045, .05), TRUCK, [0, -.035, end * .22]));
    board.add(mesh(new THREE.BoxGeometry(.2, .018, .035), TRUCK, [0, -.06, end * .22]));
    for (const side of [1, -1]) board.add(mesh(new THREE.CylinderGeometry(.032, .032, .035, 10), WHEEL, [side * .115, -.065, end * .22], [0, 0, Math.PI / 2]));
  }
  group.add(board);

  const body = new THREE.Group(); group.add(body);
  const hips = mesh(new THREE.BoxGeometry(.3, .24, .42), SHORTS); body.add(hips);
  const thighs = [0, 1].map(() => { const m = mesh(new THREE.BoxGeometry(.17, THIGH, .17), SHORTS); body.add(m); return m; });
  const shins = [0, 1].map(() => { const m = mesh(new THREE.CapsuleGeometry(.075, SHIN - .15, 4, 8), SKIN); body.add(m); return m; });
  const shoes = [0, 1].map(() => {
    const shoe = new THREE.Group();
    shoe.add(mesh(new THREE.BoxGeometry(.3, .12, .16), SHOE, [-.04, .06, 0]));
    shoe.add(mesh(new THREE.BoxGeometry(.31, .045, .17), SOLE, [-.04, .01, 0]));
    body.add(shoe); return shoe;
  });
  const torso = new THREE.Group(); body.add(torso);
  torso.add(mesh(new THREE.CapsuleGeometry(.24, .3, 5, 10), SHIRT, [0, .3, 0]));
  torso.add(mesh(new THREE.BoxGeometry(.16, .42, .34), PACK, [.24, .3, 0]));
  torso.add(mesh(new THREE.BoxGeometry(.02, .05, .12), SOLE, [.33, .32, 0]));
  const head = new THREE.Group(); head.position.set(0, .78, 0); torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(.2, 12, 10), SKIN));
  head.add(mesh(new THREE.SphereGeometry(.215, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), CAP, [0, .04, 0]));
  head.add(mesh(new THREE.BoxGeometry(.2, .035, .3), CAP, [-.17, .06, 0]));
  for (const z of [-.065, .065]) head.add(mesh(new THREE.SphereGeometry(.018, 6, 6), '#28333a', [-.19, .01, z]));
  const upperArms = [0, 1].map(() => { const m = mesh(new THREE.CapsuleGeometry(.075, UPPER_ARM - .12, 4, 8), SHIRT); body.add(m); return m; });
  const forearms = [0, 1].map(() => { const m = mesh(new THREE.CapsuleGeometry(.065, FOREARM - .1, 4, 8), SKIN); body.add(m); return m; });
  const hands = [0, 1].map(() => { const m = mesh(new THREE.SphereGeometry(.07, 8, 8), SKIN); body.add(m); return m; });

  const shadowGeometry = new THREE.CircleGeometry(.55, 24), shadowMaterial = new THREE.MeshBasicMaterial({ color: '#1d3236', transparent: true, opacity: .3, depthWrite: false });
  geometries.push(shadowGeometry); materials.set('shadow', shadowMaterial);
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.name = 'skater-shadow'; shadow.renderOrder = 1;
  return {
    group, board, body, shadow,
    parts: { thighs, shins, shoes, upperArms, forearms, hands, hips, torso, head },
    dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}

const a = new THREE.Vector3(), d = new THREE.Vector3(), bend = new THREE.Vector3();
const axisX = new THREE.Vector3(), axisY = new THREE.Vector3(), axisZ = new THREE.Vector3(), limb = new THREE.Matrix4();
const NOSE = new THREE.Vector3(0, 0, 1);
/** Two bones from `root` toward `end`, the joint pushed toward `hint`. A target beyond
 * the limb's reach is pulled in along the same line, so hands and feet never detach. */
function twoBone(root: THREE.Vector3, end: THREE.Vector3, upper: number, lower: number, hint: THREE.Vector3, joint: THREE.Vector3) {
  d.subVectors(end, root);
  let length = d.length();
  if (length < 1e-5) { d.set(0, -1, 0); length = 1e-5; } else d.divideScalar(length);
  const reach = upper + lower - .004;
  if (length > reach) { length = reach; end.copy(root).addScaledVector(d, reach); }
  const along = (upper * upper - lower * lower + length * length) / (2 * length);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  bend.copy(hint).addScaledVector(d, -hint.dot(d));
  if (bend.lengthSq() < 1e-6) bend.set(-1, 0, 0).addScaledVector(d, d.x);
  bend.normalize();
  return joint.copy(root).addScaledVector(d, along).addScaledVector(bend, out);
}
/** Lay a limb segment between two points. Its roll is fixed against the board's nose
 * axis, so a box thigh never spins about itself as the leg swings. */
function bone(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  mesh.position.addVectors(from, to).multiplyScalar(.5);
  axisY.subVectors(to, from);
  if (axisY.lengthSq() < 1e-8) return;
  axisY.normalize();
  axisZ.copy(NOSE).addScaledVector(axisY, -NOSE.dot(axisY));
  if (axisZ.lengthSq() < 1e-6) axisZ.set(1, 0, 0).addScaledVector(axisY, -axisY.x);
  axisZ.normalize();
  axisX.crossVectors(axisY, axisZ);
  mesh.quaternion.setFromRotationMatrix(limb.makeBasis(axisX, axisY, axisZ));
}

export type SkaterPose = { crouch: number; push: number; pushPhase: number; grab: number; grabId: GrabId | null; manual: number; tumble: number; lean: number; flipRoll: number; flipYaw: number; flipPitch: number; across: number; grindTilt: number };
export const createSkaterPose = (): SkaterPose => ({ crouch: 0, push: 0, pushPhase: 0, grab: 0, grabId: null, manual: 0, tumble: 0, lean: 0, flipRoll: 0, flipYaw: 0, flipPitch: 0, across: 0, grindTilt: 0 });
const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const basis = new THREE.Matrix4(), right = new THREE.Vector3();
const hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3(), shoulder = new THREE.Vector3(), hand = new THREE.Vector3(), elbow = new THREE.Vector3();
const kneeHint = new THREE.Vector3(-1, 0, 0), elbowHint = new THREE.Vector3(.4, -1, 0);

/** Place and pose the skater from the physics state, once per rendered frame. */
export function poseSkater(model: SkaterModel, s: SkaterState, pose: SkaterPose, dt: number, reduced: boolean) {
  const grinding = s.mode === 'grind' && s.grind;
  const facing = s.fakie ? -1 : 1;
  const speed = s.velocity.length();
  pose.crouch = damp(pose.crouch, s.mode === 'bail' ? 0 : Math.max(s.crouch, grinding ? .55 : 0), 14, dt);
  pose.push = damp(pose.push, s.pushing ? 1 : 0, 9, dt);
  pose.pushPhase = s.pushing || pose.push > .05 ? (pose.pushPhase + dt * 2.4) % 1 : 0;
  const grabbing = s.mode === 'air' && s.air.grab;
  pose.grab = damp(pose.grab, grabbing ? 1 : 0, 18, dt);
  if (grabbing) pose.grabId = s.air.grab;
  const manual = s.manual ? (s.manual.id === 'nose' ? -1 : 1) : 0;
  pose.manual = damp(pose.manual, manual * (.3 + (s.manual ? s.manual.balance * .12 : 0)), 12, dt);
  pose.tumble = s.mode === 'bail' ? pose.tumble + dt : 0;
  pose.lean = damp(pose.lean, s.mode === 'ground' ? 0 : grinding ? (s.grind!.balance * .5) : 0, 10, dt);
  const flip = flipPose(s);
  pose.flipRoll = flip ? flip.roll : damp(pose.flipRoll, 0, 30, dt);
  pose.flipYaw = flip ? flip.yaw : damp(pose.flipYaw, 0, 30, dt);
  pose.flipPitch = flip ? flip.pitch : damp(pose.flipPitch, 0, 30, dt);
  if (!flip && Math.abs(pose.flipRoll) > 3) pose.flipRoll = 0;
  const grindSpec = grinding ? GRINDS[s.grind!.trick] : null;
  pose.across = damp(pose.across, grindSpec?.across ? 1 : 0, 14, dt);
  pose.grindTilt = damp(pose.grindTilt, grindSpec ? grindSpec.tilt : 0, 14, dt);

  right.crossVectors(s.boardUp, s.heading).normalize();
  basis.makeBasis(right, s.boardUp, s.heading);
  model.group.quaternion.setFromRotationMatrix(basis);
  model.group.position.copy(s.position);

  // Board: flips spin it under the feet; manuals and grinds tip it onto a truck.
  const board = model.board;
  board.rotation.set(pose.manual * .9 + pose.grindTilt - pose.flipPitch, pose.flipYaw, pose.flipRoll);
  board.position.set(0, DECK + (flip ? .22 * Math.sin(Math.min(1, Math.abs(pose.flipRoll + pose.flipPitch + pose.flipYaw) / 6.3) * Math.PI) : 0), 0);

  // Body: hips over the board, knees toward the toe edge, feet on the bolts.
  const P = model.parts, crouch = Math.max(pose.crouch, pose.grab * .95);
  const hipY = .98 - .36 * crouch + (reduced ? 0 : Math.sin(performance.now() * .006) * .006 * Math.min(1, speed / 6));
  hip.set(.02, hipY, 0);
  P.hips.position.copy(hip); P.hips.rotation.set(0, 0, 0);
  const deckY = DECK + .02;
  for (let i = 0; i < 2; i++) {
    const front = i === 0 ? 1 : -1;
    const hipPoint = a.set(hip.x, hip.y - .08, front * .1);
    foot.set(0, deckY, front * .21);
    if (front < 0 && pose.push > .01) {
      // Pushing: the back foot swings down to the ground and kicks back.
      const phase = pose.pushPhase, kick = Math.sin(phase * Math.PI * 2);
      foot.set(-.06, deckY + (-.12 - deckY) * pose.push * (.6 + .4 * Math.max(0, -kick)), -.25 - pose.push * (.25 + .2 * kick));
    }
    if (pose.manual !== 0) foot.y += front * pose.manual * .18;
    if (flip) foot.y += .16;
    twoBone(hipPoint, foot, THIGH, SHIN, kneeHint.set(-1, 0, front * .3), knee);
    bone(P.thighs[i], hipPoint, knee); bone(P.shins[i], knee, foot);
    P.shoes[i].position.copy(foot); P.shoes[i].rotation.set(0, 0, 0);
  }
  // Torso leans over the knees as the rider crouches; the head looks down the board.
  const torso = P.torso;
  torso.position.set(hip.x, hip.y + .08, 0);
  torso.rotation.set(pose.lean * .4, 0, .12 + crouch * .55 + pose.grab * .25);
  P.head.rotation.set(0, Math.PI / 2 * facing * .85, -crouch * .35);
  torso.updateMatrix();
  for (let i = 0; i < 2; i++) {
    const front = i === 0 ? 1 : -1;
    shoulder.set(0, .52, front * .25).applyMatrix4(torso.matrix);
    // Arms out along the board for balance; tucked in the air; reaching for grabs.
    hand.set(-.12 - crouch * .1, hip.y + .12 + (1 - crouch) * .15, front * (.62 - crouch * .15));
    if (s.mode === 'air' && pose.grab < .1) hand.set(-.25, hip.y + .35, front * .45);
    if (pose.grab > .01 && pose.grabId) {
      const id = pose.grabId, reach = grabTarget(id, front);
      if (reach) hand.lerp(reach, pose.grab);
    }
    twoBone(shoulder, hand, UPPER_ARM, FOREARM, elbowHint.set(.3, -.6, front), elbow);
    bone(P.upperArms[i], shoulder, elbow); bone(P.forearms[i], elbow, hand);
    P.hands[i].position.copy(hand);
  }

  // Bail: the rider tumbles and the board shoots out.
  if (s.mode === 'bail') {
    const t = pose.tumble;
    model.body.rotation.set(0, 0, reduced ? 1.3 : Math.min(1.35, t * 4.5));
    model.body.position.set(reduced ? .3 : Math.min(.45, t * 1.5), reduced ? -.4 : -Math.min(.55, t * 1.8), 0);
    board.position.set(0, DECK, reduced ? .6 : Math.min(1.2, t * 3));
    board.rotation.set(0, 0, reduced ? 3 : t * 9);
  } else { model.body.rotation.set(0, 0, 0); model.body.position.set(0, 0, 0); }
}

const target = new THREE.Vector3();
function grabTarget(id: GrabId, front: number) {
  const deck = DECK + .02;
  switch (id) {
    case 'indy': return front < 0 ? target.set(-.1, deck, .02) : null;
    case 'melon': return front > 0 ? target.set(.1, deck, -.02) : null;
    case 'method': return front > 0 ? target.set(.11, deck, .05) : null;
    case 'nosegrab': return front > 0 ? target.set(0, deck + .05, .4) : null;
    case 'tailgrab': return front < 0 ? target.set(0, deck + .05, -.4) : null;
    case 'madonna': return front > 0 ? target.set(-.1, deck, .3) : null;
    case 'benihana': return front < 0 ? target.set(.1, deck, -.3) : null;
  }
}

/** Keep the blob shadow on the surface below the skater, fading with height. */
export function placeSkaterShadow(model: SkaterModel, ground: THREE.Vector3, normal: THREE.Vector3, height: number) {
  const shadow = model.shadow;
  shadow.position.copy(ground).addScaledVector(normal, .03);
  shadow.quaternion.setFromUnitVectors(Z, normal);
  const fade = Math.max(0, 1 - height / 6);
  (shadow.material as THREE.MeshBasicMaterial).opacity = .32 * fade;
  shadow.scale.setScalar(1 + Math.min(height, 6) * .08);
  shadow.visible = fade > .02;
}
const Z = new THREE.Vector3(0, 0, 1);
