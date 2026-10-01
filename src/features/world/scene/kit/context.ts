import * as THREE from 'three';
import type { InteriorId } from '../../data/town-types';
import { SceneryBatch } from '../sceneryGeometry';

export type Triple = [number, number, number];
export type PhysicalSign = {
  title: string; subtitle?: string; width: number; height: number;
  matrix: THREE.Matrix4; dark?: boolean; background?: string; cutaway?: InteriorId;
  /** Lettering colours, when not the default bone-on-dark or graphite-on-light. */
  color?: string; subtitleColor?: string;
};
export type KitContext = {
  structure: SceneryBatch; details: SceneryBatch; plants: SceneryBatch; glow: SceneryBatch;
  roofs: Map<InteriorId, SceneryBatch>; signs: PhysicalSign[];
  /** Lit neon signs: one glowing atlas of their own. */
  neon: PhysicalSign[];
};
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);
export const UNIT_LEAF = new THREE.IcosahedronGeometry(1, 1);
const gable = new THREE.BufferGeometry();
gable.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,0,1,-.5,-.5,0,.5,.5,0,.5,0,1,.5],3));
gable.setIndex([0,2,1,3,4,5,0,1,3,1,4,3,0,3,2,3,5,2,1,2,4,2,5,4]);
export const UNIT_GABLE = gable.toNonIndexed();
UNIT_GABLE.computeVertexNormals();
gable.dispose();

export function createKitContext(): KitContext {
  return { structure: new SceneryBatch(), details: new SceneryBatch(), plants: new SceneryBatch(), glow: new SceneryBatch(), roofs: new Map(), signs: [], neon: [] };
}
export function block(batch: SceneryBatch, parent: THREE.Matrix4, position: Triple, size: Triple, color: string, rotation: Triple = [0, 0, 0]) {
  batch.shape(UNIT_BOX, parent, position, size, color, rotation);
}
export function tube(batch: SceneryBatch, parent: THREE.Matrix4, position: Triple, radius: number, height: number, color: string, rotation: Triple = [0, 0, 0]) {
  batch.shape(UNIT_CYLINDER, parent, position, [radius, height, radius], color, rotation);
}
export function physicalSign(context: KitContext, parent: THREE.Matrix4, title: string, subtitle: string | undefined, position: Triple, width: number, height: number, rotation: Triple = [0, 0, 0], dark = false, background?: string, cutaway?: InteriorId) {
  const local = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
  context.signs.push({ title, subtitle, matrix: parent.clone().multiply(local), width, height, dark, background, cutaway });
}
/** A neon sign: bright lettering on a dark ground, drawn by the glowing sign atlas. */
export function neonSign(context: KitContext, parent: THREE.Matrix4, title: string, subtitle: string | undefined, position: Triple, width: number, height: number, color: string, rotation: Triple = [0, 0, 0], background = '#1E2A2C', subtitleColor?: string) {
  const local = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
  context.neon.push({ title, subtitle, matrix: parent.clone().multiply(local), width, height, dark: true, background, color, subtitleColor });
}
export function frame(parent: THREE.Matrix4, position: Triple, yaw = 0) {
  return parent.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
}
export function idSeed(id: string) {
  return Array.from(id).reduce((seed, char) => ((seed * 31 + char.charCodeAt(0)) >>> 0), 7);
}
