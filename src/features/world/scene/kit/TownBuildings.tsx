'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWN_BUILDINGS } from '../../data/town-layout';
import { activeInteriorAt, APRON_LENGTH, buildingApronPoint, buildingApronWidth } from '../../data/building-shapes';
import { heightAt, RADIUS, SEA_LEVEL } from '../../data/planet';
import { mapCoordinates, mapDirection, mapFrame } from '../../data/world-map';
import type { InteriorId, TownBuilding } from '../../data/town-types';
import type { WorldRuntimeState } from '../../runtime/types';
import { addTownInterior } from '../interiors/rooms';
import { addTownBuilding } from './buildings';
import { block, createKitContext, physicalSign, type KitContext, type PhysicalSign } from './context';
import { TOWN_PALETTE as P } from './materials';
import { SignAtlas } from './SignAtlas';
import { SURFACE } from '../materials/surface-types';

function surfaceFrame(x: number, z: number) {
  const direction = mapDirection(x, z);
  return mapFrame(x, z, Math.max(SEA_LEVEL, heightAt(direction))).matrix;
}

function apron(context: KitContext, building: TownBuilding) {
  if (!building.interior) return;
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], indices: number[] = [], uvs:number[]=[];
  const across = 14, length = 14, width = buildingApronWidth(building);
  const ground = (direction: { x: number; y: number; z: number }) => RADIUS + Math.max(SEA_LEVEL, heightAt(direction));
  for (let z = 0; z <= length; z++) for (let x = 0; x <= across; x++) {
    const p = buildingApronPoint(building, (x / across - 0.5) * width, z / length * APRON_LENGTH, ground);
    p.addScaledVector(p.clone().normalize(), 0.013);
    positions.push(p.x, p.y, p.z);
    const coordinates=mapCoordinates(p);uvs.push(coordinates.x,coordinates.z);
    if (x < across && z < length) {
      const a = z * (across + 1) + x;
      indices.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('surfaceUv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('surfaceKind',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3).fill(SURFACE.paving),1));
  geometry.setAttribute('surfaceHeight',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3),1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  context.structure.add(geometry, new THREE.Matrix4(), P.concrete); geometry.dispose();
}

function townSigns(c: KitContext) {
  physicalSign(c, surfaceFrame(0, 17.4), 'WESTCOSE', 'COURTYARD / ARRIVAL', [0, 2.7, 0.091], 5.9, 1.08);
  const coast = surfaceFrame(0, -15);
  physicalSign(c, coast, 'BOARDWALK', 'BEACH / PIER', [0, 1.35, 0.23], 1.9, 0.36);
  physicalSign(c, coast, 'BOARDWALK', 'BEACH / PIER', [0, 1.35, -0.23], 1.9, 0.36, [0, Math.PI, 0]);
  for (const data of [
    { x: 0, z: 109, top: 'SKI RESORT', bottom: 'TRAILS 1 / 2 / 3' },
  ]) {
    const m = surfaceFrame(data.x, data.z);
    if(data.top==='SKI RESORT')m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    block(c.details, m, [0, 0.94, 0], [0.085, 1.88, 0.085], P.steel);
    block(c.details, m, [0, 1.82, 0], [2.1, 0.6, 0.13], P.graphite);
    physicalSign(c, m, data.top, data.bottom, [0, 1.82, 0.073], 1.96, 0.47, [0, 0, 0], true);
  }
}

function buildTown(extraSigns: PhysicalSign[]) {
  const context = createKitContext();
  for (const building of TOWN_BUILDINGS) {
    const matrix = addTownBuilding(context, building);
    addTownInterior(context, building, matrix);
    apron(context, building);
  }
  for(const batch of [context.structure,context.details,context.plants,context.glow])batch.setSurfaceFrame(null);
  townSigns(context);
  context.signs.push(...extraSigns);
  return {
    structure: context.structure.finish(), details: context.details.finish(),
    plants: context.plants.finish(), glow: context.glow.finish(),
    roofs: Array.from(context.roofs, ([id, batch]) => ({ id, geometry: batch.finish() })), signs: context.signs,
  };
}
const NO_SIGNS: PhysicalSign[] = [];
const tintEmission: THREE.MeshStandardMaterial['onBeforeCompile'] = shader => {
  shader.fragmentShader=shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;',`vec3 totalEmissiveRadiance = emissive;
    #ifdef USE_COLOR
    totalEmissiveRadiance *= vColor.rgb;
    #endif
  `);
};
const glowProgram=()=> 'westcose-tinted-window-emission-v2';

/** Authored shells, doorways and five rooms; scene data remains the source of truth. */
export default function TownBuildings({ runtime, extraSigns = NO_SIGNS }: { runtime?: WorldRuntimeState; extraSigns?: PhysicalSign[] }) {
  const town = useMemo(() => buildTown(extraSigns), [extraSigns]);
  const roofMeshes = useRef(new Map<InteriorId, THREE.Mesh>());
  const hiddenInterior = useRef<InteriorId | null>(null);
  useFrame(() => {
    const inside = runtime && runtime.mode !== 'overview' && runtime.mode !== 'intro' ? activeInteriorAt(runtime.position) : null;
    hiddenInterior.current = inside;
    for (const [id, mesh] of roofMeshes.current) mesh.visible = id !== inside;
  });
  useEffect(() => () => {
    town.structure.dispose(); town.details.dispose(); town.plants.dispose(); town.glow.dispose();
    town.roofs.forEach(roof => roof.geometry.dispose());
  }, [town]);
  return <group name="WestCose modular buildings">
    <mesh geometry={town.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.86} /></mesh>
    <mesh geometry={town.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.82} /></mesh>
    <mesh geometry={town.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <mesh geometry={town.glow}><meshStandardMaterial vertexColors roughness={0.23} emissive={P.amber} emissiveIntensity={0.48} onBeforeCompile={tintEmission} customProgramCacheKey={glowProgram} /></mesh>
    {town.roofs.map(roof => <mesh key={roof.id} geometry={roof.geometry} castShadow receiveShadow ref={mesh => { if (mesh) roofMeshes.current.set(roof.id, mesh); else roofMeshes.current.delete(roof.id); }}><meshStandardMaterial vertexColors roughness={0.84} /></mesh>)}
    <SignAtlas signs={town.signs} hiddenInterior={hiddenInterior} />
  </group>;
}
