'use client';

import { useEffect,useMemo,useRef } from 'react';
import { DoubleSide } from 'three';
import type { InteriorId } from '../data/town-types';
import { buildPierGeometry } from './pierGeometry';
import { SignAtlas } from './kit/SignAtlas';

/** A timber pier with one shared curved deck, structure and matching guardrail volumes. */
export default function Pier(){
  const pier=useMemo(()=>buildPierGeometry(),[]);
  const hiddenInterior=useRef<InteriorId|null>(null);
  useEffect(()=>()=>{pier.geometry.dispose();pier.lights.dispose();},[pier]);
  return <group name="WestCose Pier" userData={{pier:pier.stats}}>
    <mesh geometry={pier.geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.88} side={DoubleSide}/></mesh>
    <mesh geometry={pier.lights}><meshStandardMaterial color="#D5B77D" emissive="#E5B574" emissiveIntensity={.6} roughness={.35}/></mesh>
    <SignAtlas signs={pier.signs} hiddenInterior={hiddenInterior}/>
  </group>;
}
