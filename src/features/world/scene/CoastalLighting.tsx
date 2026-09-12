'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BackSide, Color, DirectionalLight, FogExp2, Mesh, PMREMGenerator, PointLight,
  Scene, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { WorldRuntimeState } from '../runtime/types';
import { LANTERN_ANCHORS, SUNSET_DIRECTION, type LanternAnchor } from './lighting-anchors';
import { MAP_MAX_HEIGHT, MAP_RADIUS } from '../data/world-map';

// The town faces +Z. A fixed western sun gives long shadows without rotating
// the light with the visitor or changing the planet's day side during travel.
const SUN = new Vector3(...SUNSET_DIRECTION).normalize();
const SUN_RIGHT = new Vector3().crossVectors(new Vector3(0, 1, 0), SUN).normalize();
const SUN_UP = new Vector3().crossVectors(SUN, SUN_RIGHT).normalize();
const SHADOW_SIZE = 2048;
const HAZE = '#AEC8D4';
const LANTERN_SLOTS = [0, 1, 2] as const;

const skyVertex = /* glsl */`
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragment = /* glsl */`
  uniform vec3 skyUp;
  uniform vec3 sunDirection;
  uniform vec3 zenithColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform vec3 sunColor;
  uniform float sunStrength;
  uniform float zenithHeight;
  varying vec3 vDirection;
  void main() {
    vec3 ray = normalize(vDirection);
    float altitude = dot(ray, skyUp);
    vec3 sky = mix(horizonColor, zenithColor, smoothstep(0.0, zenithHeight, altitude));
    sky = mix(sky, groundColor, smoothstep(0.0, 0.58, -altitude));
    float sunFacing = max(dot(ray, sunDirection), 0.0);
    sky += sunColor * (pow(sunFacing, 24.0) * 0.10 + pow(sunFacing, 180.0) * sunStrength);
    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function skyUniforms(reflection = false) {
  return {
    skyUp: { value: new Vector3(0, 0, 1) },
    sunDirection: { value: SUN.clone() },
    zenithColor: { value: new Color(reflection ? '#668AA5' : '#729DBA') },
    horizonColor: { value: new Color(reflection ? '#B9CCD4' : '#C3D8DF') },
    groundColor: { value: new Color(reflection ? '#37454e' : '#77838b') },
    sunColor: { value: new Color('#ffb566') },
    sunStrength: { value: reflection ? 1.8 : 0.13 },
    zenithHeight: { value: reflection ? 0.55 : 0.24 },
  };
}

/** One shadow pass, a small baked environment and three reused lantern lights. */
export default function CoastalLighting({ runtime, reduced }: { runtime: WorldRuntimeState; reduced: boolean }) {
  const runtimeRef = useRef(runtime);
  const sun = useRef<DirectionalLight>(null);
  const haze = useRef<FogExp2>(null);
  const sky = useRef<Mesh>(null);
  const skyMaterial = useRef<ShaderMaterial>(null);
  const scratch = useRef({ focus: new Vector3(), halfExtent: -1 });
  const lanternLights = useRef<Array<PointLight | null>>([null, null, null]);
  const lanterns = useRef({
    elapsed: 1, interior: runtime.interior,
    visitor: new Vector3(), offset: new Vector3(),
    ranked: [] as Array<{ anchor: LanternAnchor; score: number }>,
    slots: LANTERN_SLOTS.map(() => ({ anchor: null as LanternAnchor | null, target: null as LanternAnchor | null })),
  });
  const uniforms = useMemo(() => skyUniforms(), []);
  const { gl, scene } = useThree();
  const sceneRef = useRef(scene);

  useEffect(() => {
    const targetScene = sceneRef.current;
    const previousEnvironment = targetScene.environment;
    const previousIntensity = targetScene.environmentIntensity;
    const environmentScene = new Scene();
    const geometry = new SphereGeometry(20, 24, 16);
    const material = new ShaderMaterial({
      uniforms: skyUniforms(true), vertexShader: skyVertex, fragmentShader: skyFragment,
      side: BackSide, depthWrite: false,
    });
    environmentScene.add(new Mesh(geometry, material));
    const generator = new PMREMGenerator(gl);
    // r185 supports a small explicit cube size. This happens once per mount,
    // never during movement; no downloaded HDR or extra realtime light pass.
    const environment = generator.fromScene(environmentScene, 0.035, 0.1, 40, { size: 128 });
    targetScene.environment = environment.texture;
    targetScene.environmentIntensity = 0.24;
    generator.dispose();
    geometry.dispose();
    material.dispose();
    return () => {
      if (targetScene.environment === environment.texture) {
        targetScene.environment = previousEnvironment;
        targetScene.environmentIntensity = previousIntensity;
      }
      environment.dispose();
    };
  }, [gl]);

  useFrame(({ camera }, delta) => {
    const state = runtimeRef.current;
    const overview = Math.max(0, Math.min(1, state.overviewTransition));
    const work = scratch.current;
    const light = sun.current;
    if (light) {
      // Keep contact resolution while walking; include the high mountain in overview.
      const halfExtent = 24 + overview * (MAP_RADIUS + MAP_MAX_HEIGHT + 2 - 24);
      work.focus.set(state.position.x, state.position.y, state.position.z).multiplyScalar(1 - overview);
      const texel = halfExtent * 2 / SHADOW_SIZE;
      const right = work.focus.dot(SUN_RIGHT), up = work.focus.dot(SUN_UP);
      work.focus.addScaledVector(SUN_RIGHT, Math.round(right / texel) * texel - right);
      work.focus.addScaledVector(SUN_UP, Math.round(up / texel) * texel - up);
      light.position.copy(work.focus).addScaledVector(SUN, 110);
      light.target.position.copy(work.focus);
      // DirectionalLight's default target is not a scene child.
      light.target.updateMatrixWorld();
      if (Math.abs(halfExtent - work.halfExtent) > 0.005) {
        const shadowCamera = light.shadow.camera;
        shadowCamera.left = shadowCamera.bottom = -halfExtent;
        shadowCamera.right = shadowCamera.top = halfExtent;
        shadowCamera.updateProjectionMatrix();
        work.halfExtent = halfExtent;
      }
    }
    if (sky.current) sky.current.position.copy(camera.position);
    if (skyMaterial.current) skyMaterial.current.uniforms.skyUp.value.copy(camera.up).normalize();
    if (haze.current) haze.current.density = reduced ? 0 : 0.003 * (1 - overview) + 0.00085 * overview;

    const pools = lanterns.current;
    const roomChanged = pools.interior !== state.interior;
    pools.elapsed += delta;
    if (roomChanged || pools.elapsed >= 0.2) {
      pools.elapsed = 0;
      pools.interior = state.interior;
      pools.visitor.set(state.position.x, state.position.y, state.position.z);
      pools.ranked.length = 0;
      for (const anchor of LANTERN_ANCHORS) {
        // Interior lanterns only light their active room. Exterior candidates
        // must face the visitor, avoiding a light selected through a rear wall.
        if (anchor.interior !== state.interior) continue;
        pools.offset.copy(pools.visitor).sub(anchor.position);
        if (anchor.outward && pools.offset.dot(anchor.outward) < -0.7) continue;
        const score = pools.offset.lengthSq();
        if (score > 18 * 18) continue;
        const insertAt = pools.ranked.findIndex(candidate => score < candidate.score);
        pools.ranked.splice(insertAt < 0 ? pools.ranked.length : insertAt, 0, { anchor, score });
        if (pools.ranked.length > LANTERN_SLOTS.length) pools.ranked.pop();
      }
      // Keep matching anchors in their existing slots; changing nearest order
      // must not move bright point lights back and forth across the courtyard.
      for (const slot of pools.slots) {
        slot.target = pools.ranked.some(candidate => candidate.anchor === slot.anchor) ? slot.anchor : null;
      }
      for (const candidate of pools.ranked) {
        if (pools.slots.some(slot => slot.target === candidate.anchor)) continue;
        const free = pools.slots.find(slot => slot.target === null);
        if (free) free.target = candidate.anchor;
      }
    }
    for (const index of LANTERN_SLOTS) {
      const point = lanternLights.current[index], slot = pools.slots[index];
      if (!point) continue;
      const immediate = reduced || roomChanged || state.mode === 'reading' || state.mode === 'paused';
      if (slot.anchor !== slot.target) {
        point.intensity *= immediate ? 0 : Math.exp(-Math.min(delta, 0.1) * 14);
        if (point.intensity < 0.08) {
          slot.anchor = slot.target;
          if (slot.anchor) {
            point.position.copy(slot.anchor.position);
            point.distance = slot.anchor.range;
          }
        }
      }
      const desired = slot.anchor && slot.anchor === slot.target ? slot.anchor.intensity * (1 - overview) : 0;
      point.intensity += (desired - point.intensity) * (immediate ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 8));
    }
  });

  return <>
    <color attach="background" args={[HAZE]} />
    <fogExp2 ref={haze} attach="fog" args={[HAZE, reduced ? 0 : 0.00065]} />
    {/* The globe has no single global ground/up direction. Neutral ambient
        bounce keeps its opposite hemisphere legible under the fixed sunset. */}
    <ambientLight color="#dce4e8" intensity={0.95} />
    <hemisphereLight position={[0, 0, 1]} args={['#9bb4cc', '#aaa193', 0.55]} />
    <directionalLight
      ref={sun} color="#fff1d9" intensity={2.2} castShadow={!reduced}
      position={[-53, 95, 21]} shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
      shadow-camera-near={1} shadow-camera-far={220}
      shadow-camera-left={-50} shadow-camera-right={50}
      shadow-camera-top={50} shadow-camera-bottom={-50}
      shadow-normalBias={0.035} shadow-bias={-0.00008} shadow-radius={1.65}
    />
    <directionalLight position={[50, -38, -80]} intensity={0.9} color="#b4cddd" />
    {LANTERN_SLOTS.map(index => <pointLight key={index} ref={light => { lanternLights.current[index] = light; }} color="#ffbd79" intensity={0} distance={8.2} decay={2} castShadow={false} />)}
    <mesh ref={sky} scale={300} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 20]} />
      <shaderMaterial
        ref={skyMaterial} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment}
        side={BackSide} depthWrite={false} depthTest={false} toneMapped={false} fog={false}
      />
    </mesh>
  </>;
}
