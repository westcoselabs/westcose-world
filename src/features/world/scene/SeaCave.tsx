'use client';

import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import { buildSeaCaveMesh } from '../data/sea-cave-mesh';

/** The sea caves' rock with its designed light baked in, and the beams through the window.
 * The caves sit on the planet's dark side, so the rock is unlit and casts no shadows. */
export default function SeaCave() {
  const geometry = useMemo(() => {
    const built = buildSeaCaveMesh();
    const rock = new BufferGeometry();
    rock.setAttribute('position', new Float32BufferAttribute(built.rock.positions, 3));
    rock.setAttribute('color', new Float32BufferAttribute(built.rock.colors, 3));
    rock.computeBoundingSphere();
    const shafts = new BufferGeometry();
    shafts.setAttribute('position', new Float32BufferAttribute(built.shafts.positions, 3));
    shafts.setAttribute('color', new Float32BufferAttribute(built.shafts.colors, 4));
    shafts.computeBoundingSphere();
    return { rock, shafts };
  }, []);
  useEffect(() => () => { geometry.rock.dispose(); geometry.shafts.dispose(); }, [geometry]);
  return <group name="sea-cave">
    <mesh name="sea-cave-rock" geometry={geometry.rock}><meshBasicMaterial vertexColors /></mesh>
    <mesh name="sea-cave-shafts" geometry={geometry.shafts} renderOrder={2}>
      <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} fog={false} />
    </mesh>
  </group>;
}
