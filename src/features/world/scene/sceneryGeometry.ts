import * as THREE from 'three';
import { architecturalSurface } from './materials/surface-types';

type Triple = [number, number, number];
export type SurfaceMapping = { heightFrame?:THREE.Matrix4; kind?:number };

/** Bake the small architectural kit into one vertex-coloured mesh per material. */
export class SceneryBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private surfaceUvs: number[] = [];
  private surfaceKinds: number[] = [];
  private surfaceHeights: number[] = [];
  private transform = new THREE.Matrix4();
  private normalTransform = new THREE.Matrix3();
  private point = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private color = new THREE.Color();
  private heightPoint = new THREE.Vector3();
  private surfaceFrameInverse:THREE.Matrix4|null = null;

  constructor(surfaceFrame?:THREE.Matrix4) {
    if(surfaceFrame)this.setSurfaceFrame(surfaceFrame);
  }

  /** Explicit local ground frame; nested details retain their height above the same building floor. */
  setSurfaceFrame(frame:THREE.Matrix4|null) {
    this.surfaceFrameInverse=frame?frame.clone().invert():null;
    return this;
  }

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: string, mapping?:SurfaceMapping) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    this.normalTransform.getNormalMatrix(matrix);
    this.color.set(color);
    const sx=new THREE.Vector3().setFromMatrixColumn(matrix,0).length();
    const sy=new THREE.Vector3().setFromMatrixColumn(matrix,1).length();
    const sz=new THREE.Vector3().setFromMatrixColumn(matrix,2).length();
    const kind=mapping?.kind??architecturalSurface(color);
    const heightInverse=mapping?.heightFrame?mapping.heightFrame.clone().invert():this.surfaceFrameInverse;
    const offset=(matrix.elements[12]*.37+matrix.elements[13]*.51+matrix.elements[14]*.23)%97;
    const sourceUv=geometry.getAttribute('surfaceUv'),sourceKind=geometry.getAttribute('surfaceKind'),sourceHeight=geometry.getAttribute('surfaceHeight');
    for (let i = 0; i < (index?.count ?? position.count); i++) {
      const j = index ? index.getX(i) : i;
      this.point.fromBufferAttribute(position, j).applyMatrix4(matrix);
      this.normal.fromBufferAttribute(normal, j).applyMatrix3(this.normalTransform).normalize();
      this.positions.push(this.point.x, this.point.y, this.point.z);
      this.normals.push(this.normal.x, this.normal.y, this.normal.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      // Project each primitive in physical metres before batching. A long wall
      // retains the same texture scale as a small sill, including rotated shells.
      const nx=Math.abs(normal.getX(j)),ny=Math.abs(normal.getY(j)),nz=Math.abs(normal.getZ(j));
      if(sourceUv)this.surfaceUvs.push(sourceUv.getX(j),sourceUv.getY(j));
      else if(ny>=nx&&ny>=nz)this.surfaceUvs.push(position.getX(j)*sx+offset,position.getZ(j)*sz+offset);
      else if(nx>nz)this.surfaceUvs.push(position.getZ(j)*sz+offset,position.getY(j)*sy+offset);
      else this.surfaceUvs.push(position.getX(j)*sx+offset,position.getY(j)*sy+offset);
      this.surfaceKinds.push(sourceKind?sourceKind.getX(j):kind);
      // World-space geometry must supply a frame or source attribute. Without one,
      // use a neutral height instead of treating every upper trim edge as ground.
      this.surfaceHeights.push(sourceHeight?sourceHeight.getX(j):heightInverse?Math.max(0,this.heightPoint.copy(this.point).applyMatrix4(heightInverse).y):1);
    }
  }

  shape(geometry: THREE.BufferGeometry, parent: THREE.Matrix4, position: Triple, scale: Triple, color: string, rotation: Triple = [0, 0, 0], mapping?:SurfaceMapping) {
    this.transform.compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    this.transform.premultiply(parent);
    this.add(geometry, this.transform, color, {...mapping,heightFrame:mapping?.heightFrame??(this.surfaceFrameInverse?undefined:parent)});
  }

  finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('surfaceUv',new THREE.Float32BufferAttribute(this.surfaceUvs,2));
    geometry.setAttribute('surfaceKind',new THREE.Float32BufferAttribute(this.surfaceKinds,1));
    geometry.setAttribute('surfaceHeight',new THREE.Float32BufferAttribute(this.surfaceHeights,1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Stateless seeded variation keeps the planet identical across visits. */
export function variation(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
