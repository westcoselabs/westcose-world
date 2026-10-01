'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PhysicalSign } from './context';
import type { InteriorId } from '../../data/town-types';
import { TOWN_PALETTE as P } from './materials';

/** All physical signs share one texture/material and one draw call. */
const INTERIOR_INDEX: Record<InteriorId, number> = { studio: 1, workshop: 2, arcade: 3, about: 4, lab: 5, skateshop: 6 };
export function SignAtlas({ signs, hiddenInterior }: { signs: PhysicalSign[]; hiddenInterior?: RefObject<InteriorId | null> }) {
  const hiddenUniform = useRef({ value: 0 });
  useFrame(() => { hiddenUniform.current.value = hiddenInterior?.current ? INTERIOR_INDEX[hiddenInterior.current] : 0; });
  const { texture, geometry } = useMemo(() => {
    const columns = 4, cellWidth = 512, cellHeight = 128;
    const rows = Math.max(1, Math.ceil(signs.length / columns));
    const canvas = document.createElement('canvas');
    canvas.width = columns * cellWidth;
    canvas.height = THREE.MathUtils.ceilPowerOfTwo(rows * cellHeight);
    const ctx = canvas.getContext('2d')!;
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [], cutaways: number[] = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
    signs.forEach((sign, i) => {
      const x = (i % columns) * cellWidth, y = Math.floor(i / columns) * cellHeight;
      ctx.fillStyle = sign.background ?? (sign.dark ? P.graphite : P.bone);
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.fillStyle = sign.dark ? P.bone : P.graphite;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${sign.subtitle ? 59 : 76}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      ctx.fillText(sign.title, x + cellWidth / 2, y + (sign.subtitle ? 50 : 65), cellWidth - 35);
      if (sign.subtitle) {
        ctx.font = '600 17px "DM Sans", Arial, sans-serif';
        ctx.fillText(sign.subtitle, x + cellWidth / 2, y + 102, cellWidth - 45);
      }
      const halfW = sign.width / 2, halfH = sign.height / 2;
      const corners = [[-halfW, halfH], [halfW, halfH], [-halfW, -halfH], [halfW, -halfH]];
      normalMatrix.getNormalMatrix(sign.matrix);
      normal.set(0, 0, 1).applyMatrix3(normalMatrix).normalize();
      corners.forEach(([px, py]) => {
        point.set(px, py, 0).applyMatrix4(sign.matrix);
        positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
        cutaways.push(sign.cutaway ? INTERIOR_INDEX[sign.cutaway] : 0);
      });
      const left = (x + 1) / canvas.width, right = (x + cellWidth - 1) / canvas.width;
      const top = 1 - (y + 1) / canvas.height, bottom = 1 - (y + cellHeight - 1) / canvas.height;
      uvs.push(left, top, right, top, left, bottom, right, bottom);
      const start = i * 4; indices.push(start, start + 2, start + 1, start + 2, start + 3, start + 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('cutawayId', new THREE.Float32BufferAttribute(cutaways, 1));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return { texture, geometry };
  }, [signs]);
  useEffect(() => () => { texture.dispose(); geometry.dispose(); }, [texture, geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial map={texture} roughness={1} emissive={P.bone} emissiveIntensity={0.055} onBeforeCompile={shader => {
    shader.uniforms.hiddenInterior = hiddenUniform.current;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cutawayId;\nvarying float vCutawayId;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutawayId = cutawayId;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float hiddenInterior;\nvarying float vCutawayId;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (hiddenInterior > 0.5 && abs(vCutawayId - hiddenInterior) < 0.1) discard;');
  }} /></mesh>;
}
