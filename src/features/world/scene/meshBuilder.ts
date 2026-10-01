import * as THREE from 'three';

/** Flat-shaded, vertex-coloured triangle soup for procedural kit pieces (streets, stairs,
 * park surfaces). Callers pass world-space corners; winding follows `outward` when given. */
export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private color = new THREE.Color();
  private ab = new THREE.Vector3();
  private ac = new THREE.Vector3();
  private n = new THREE.Vector3();

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: string | THREE.Color, outward?: THREE.Vector3, smooth?: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]) {
    this.n.crossVectors(this.ab.subVectors(b, a), this.ac.subVectors(c, a));
    if (this.n.lengthSq() < 1e-14) return;
    if (outward && this.n.dot(outward) < 0) { const t = b; b = c; c = t; this.n.negate(); if (smooth) smooth = [smooth[0], smooth[2], smooth[1]]; }
    this.n.normalize();
    if (typeof color === 'string') this.color.set(color); else this.color.copy(color);
    const corners = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = corners[i], normal = smooth ? smooth[i] : this.n;
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: string | THREE.Color, outward?: THREE.Vector3) {
    this.triangle(a, b, c, color, outward);
    this.triangle(a, c, d, color, outward);
  }

  get empty() { return this.positions.length === 0; }

  finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Deterministic slab-to-slab tint so paving and concrete read as individual pours. */
export function tint(base: string, seed: number, amount = .045) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  const k = 1 + (value - Math.floor(value) - .5) * 2 * amount;
  return new THREE.Color(base).multiplyScalar(k);
}
