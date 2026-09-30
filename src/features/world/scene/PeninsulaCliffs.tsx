'use client';

import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { peninsulaCaveFloor, peninsulaCaveWedges } from '../data/peninsula-cave';
import { peninsulaCliffWedges } from '../data/peninsula-cliffs';

/** True low rock prisms around a short pentagonal cave, not decorated tunnel boxes. */
export default function PeninsulaCliffs() {
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const surfaces = [
      ...peninsulaCaveWedges.map(wedge => ({ ...wedge, triangles: wedge.liningTriangles })),
      ...peninsulaCliffWedges,
      { ...peninsulaCaveFloor, color: '#D8BD8B' },
    ];
    for (const wedge of surfaces) {
      const color = new Color(wedge.color);
      for (const triangle of wedge.triangles) {
        for (const index of triangle) {
          const point = wedge.vertices[index];
          positions.push(point.x, point.y, point.z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
    const mesh = new BufferGeometry();
    mesh.setAttribute('position', new Float32BufferAttribute(positions, 3));
    mesh.setAttribute('color', new Float32BufferAttribute(colors, 3));
    mesh.computeVertexNormals();
    mesh.computeBoundingSphere();
    return mesh;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name="peninsula-rock-edge-and-cave" geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial vertexColors roughness={1} flatShading />
  </mesh>;
}
