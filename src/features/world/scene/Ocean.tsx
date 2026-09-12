'use client';
import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {RADIUS,SEA_LEVEL} from '../data/planet';
import {SUNSET_DIRECTION} from './lighting-anchors';
const waterVertex = `
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition=viewMatrix*world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const waterFragment = `
  uniform float time;
  uniform vec3 sunlightDirection;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vNormal);
    float ripple = sin(vWorld.x * 1.8 + vWorld.z * 0.55 + time * 0.28) * sin(vWorld.y * 1.6 - vWorld.z * 0.9 - time * 0.17);
    float fine = sin(vWorld.x * 5.7 + vWorld.y * 3.8 + time * 0.36) * sin(vWorld.z * 4.4 - vWorld.y * 2.1 - time * 0.22);
    float facing = max(dot(n, normalize(cameraPosition - vWorld)), 0.0);
    vec3 sunlight=normalize(sunlightDirection);
    float light = 0.48 + 0.30 * max(dot(n, sunlight), 0.0);
    vec3 water = mix(vec3(0.028, 0.065, 0.105), vec3(0.11, 0.18, 0.24), pow(1.0 - facing, 2.0));
    water += ripple * 0.003; water += smoothstep(0.88, 0.98, fine) * 0.017;
    vec3 waveNormal=normalize(n+vec3(cos(vWorld.x*1.8+time*.28),sin(vWorld.y*1.6-time*.17),cos(vWorld.z*1.1))*.014);
    float glint=pow(max(dot(waveNormal,normalize(sunlight+normalize(cameraPosition-vWorld))),0.0),180.0);
    water+=vec3(1.0,.53,.23)*glint*.65;
    gl_FragColor = vec4(water * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
export default function Ocean() {
  const material = useRef<THREE.ShaderMaterial>(null), uniforms = useMemo(() => THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{ time: { value: 0 }, sunlightDirection: { value: new THREE.Vector3(...SUNSET_DIRECTION).normalize() } }]), []);
  useFrame((_, dt) => { if (material.current) material.current.uniforms.time.value += Math.min(dt, 0.05); });
  return <mesh><sphereGeometry args={[RADIUS + SEA_LEVEL, 128, 80]} /><shaderMaterial ref={material} uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment} fog /></mesh>;
}
