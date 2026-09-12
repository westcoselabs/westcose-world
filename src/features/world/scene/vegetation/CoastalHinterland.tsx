'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COASTAL_REGIONS } from '../../data/coastal-regions';
import { RADIUS, SEA_LEVEL } from '../../data/planet';
import { buildCoastalHinterland, hinterlandMatrix } from './coastalHinterlandGeometry';
import { PlanetOcclusion } from './planetOcclusion';

/** Regional instance bounds retain horizon trees while culling fully hidden groves. */
export default function CoastalHinterland() {
  const world = useMemo(() => {
    const built = buildCoastalHinterland();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, side: THREE.DoubleSide });
    const instances: THREE.InstancedMesh[] = [];
    for (const region of COASTAL_REGIONS) for (const species of ['oak', 'cypress'] as const) {
      const anchors = built.layout.trees.filter(a => a.regionId === region.id && a.species === species);
      if (!anchors.length) continue;
      const mesh = new THREE.InstancedMesh(built.trees[species], material, anchors.length);
      anchors.forEach((anchor, i) => mesh.setMatrixAt(i, hinterlandMatrix(anchor)));
      mesh.name = `coastal-hinterland-${region.id}-${species}`;
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      mesh.castShadow = true; mesh.receiveShadow = true; instances.push(mesh);
    }
    const occlusion = new PlanetOcclusion(RADIUS + SEA_LEVEL - 0.25);
    const culling = { treeBatches: instances.length, visibleTreeBatches: instances.length, occludedTreeBatches: 0, innerRadius: occlusion.planetRadius };
    return { ...built, material, instances, occlusion, culling, cameraPosition: new THREE.Vector3(), boundCenter: new THREE.Vector3() };
  }, []);
  const live = useRef<typeof world | null>(null);
  useFrame(({ camera }) => {
    const active = live.current;
    if (!active) return;
    camera.getWorldPosition(active.cameraPosition);
    active.occlusion.setCamera(active.cameraPosition);
    let hidden = 0;
    for (const mesh of active.instances) {
      mesh.updateWorldMatrix(true, false);
      const bound = mesh.boundingSphere;
      if (!bound) { mesh.visible = true; continue; }
      active.boundCenter.copy(bound.center).applyMatrix4(mesh.matrixWorld);
      const radius = bound.radius * mesh.matrixWorld.getMaxScaleOnAxis();
      mesh.visible = !active.occlusion.isSphereHidden(active.boundCenter, radius);
      if (!mesh.visible) hidden++;
    }
    active.culling.occludedTreeBatches = hidden;
    active.culling.visibleTreeBatches = active.instances.length - hidden;
  });
  useEffect(() => {
    live.current = world;
    return () => {
      live.current = null;
      world.instances.forEach(mesh => mesh.dispose());
      world.trees.oak.dispose(); world.trees.cypress.dispose();
      world.sectors.forEach(g => g.dispose()); world.details.dispose(); world.material.dispose();
    };
  }, [world]);
  return <group name="coastal-hinterland" userData={{ hinterland: world.stats, occlusion: world.culling, anchors: world.layout.trees }} dispose={null}>
    {world.instances.map(mesh => <primitive key={mesh.name} object={mesh} />)}
    {world.sectors.map((geometry, i) => <mesh key={i} name={`coastal-ground-${i}`} geometry={geometry} material={world.material} receiveShadow />)}
    <mesh name="coastal-lookouts" geometry={world.details} material={world.material} castShadow receiveShadow />
  </group>;
}
