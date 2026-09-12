'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldRuntimeState } from '../../runtime/types';
import { buildCoastalVegetation } from './vegetationGeometry';

/** Authored planting follows the sphere and stays clear of routes and all five room entrances. */
export default function CoastalVegetation({runtime}:{runtime?:WorldRuntimeState}){
  const world=useMemo(()=>buildCoastalVegetation(),[]);
  const leaves=useRef<THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>>(null);
  const foliageMaterial=useMemo(()=>{
    const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.79,metalness:0});
    const wind={value:0};
    material.userData.coastalWind=wind;
    material.onBeforeCompile=shader=>{
      shader.uniforms.coastalWindTime=wind;
      shader.vertexShader=`uniform float coastalWindTime;\nattribute float foliageWeight;\n${shader.vertexShader}`.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        vec3 radialUp=normalize(position);
        vec3 breeze=vec3(1.0,0.12,0.3);
        breeze=breeze-radialUp*dot(breeze,radialUp);
        breeze/=max(length(breeze),0.001);
        float flutter=sin(coastalWindTime*1.35+dot(position,vec3(0.71,0.38,0.25)));
        flutter+=0.32*sin(coastalWindTime*2.1+position.y*2.3);
        transformed+=breeze*flutter*0.035*foliageWeight;
      `);
    };
    material.customProgramCacheKey=()=> 'westcose-coastal-leaves-v1';
    return material;
  },[]);
  useFrame((_,dt)=>{
    if(leaves.current&&!runtime?.reducedMotion&&runtime?.mode!=='paused'&&runtime?.mode!=='reading')
      leaves.current.material.userData.coastalWind.value+=Math.min(dt,.05);
  });
  useEffect(()=>()=>{
    world.wood.dispose();world.foliage.dispose();world.litter.dispose();foliageMaterial.dispose();
  },[world,foliageMaterial]);
  return <group name="coastal-vegetation" userData={{vegetation:world.stats}}>
    <mesh geometry={world.wood} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.96}/></mesh>
    <mesh ref={leaves} geometry={world.foliage} material={foliageMaterial} castShadow receiveShadow/>
    <mesh geometry={world.litter} receiveShadow><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={1}/></mesh>
  </group>;
}
