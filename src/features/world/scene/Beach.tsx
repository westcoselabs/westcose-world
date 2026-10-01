'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL, mapDirection, mapFrame, mapPoint } from '../data/world-map';
import { groundSurfaceAt, townSurfaceAt, BEACH_DUNES } from '../data/town-surfaces';
import { BEACH_PROPS, type BeachProp } from '../data/town-props';
import type { WorldRuntimeState } from '../runtime/types';
import { block, createKitContext, physicalSign, tube, UNIT_LEAF, type KitContext } from './kit/context';
import { TOWN_PALETTE as P } from './kit/materials';
import { SignAtlas } from './kit/SignAtlas';
import { variation } from './sceneryGeometry';

const CONE8 = new THREE.ConeGeometry(1, 1, 8);
const HIP = new THREE.ConeGeometry(1, 1, 4);
const LOG = new THREE.CylinderGeometry(1, 1, 1, 7);
const BLADE = new THREE.ConeGeometry(1, 1, 3);

/** Where the public beach meets the sea, by chart x: the first dry-to-wet crossing. */
function waterlineAt(x: number) {
  let z = -24;
  for (; z > -48; z -= .25) if (groundSurfaceAt(x, z).height < MAP_SEA_LEVEL) break;
  let dry = z + .25, wet = z;
  for (let i = 0; i < 8; i++) { const mid = (dry + wet) / 2; if (groundSurfaceAt(x, mid).height < MAP_SEA_LEVEL) wet = mid; else dry = mid; }
  return (dry + wet) / 2;
}

/** The surf strip: draped over the wet sand and floating on the shallows, it carries the
 * running swash, the foam lines rolling in and the turquoise of shallow water. */
function surfGeometry() {
  const x0 = -28.5, x1 = 37.5, step = .6, across = [-3.2, -2.2, -1.4, -.8, -.4, 0, .4, .9, 1.6, 2.5, 3.6, 5, 6.6, 8.4, 10.5];
  const positions: number[] = [], shore: number[] = [], along: number[] = [], indices: number[] = [];
  const columns = Math.round((x1 - x0) / step);
  const lines = Array.from({ length: columns + 1 }, (_, i) => { const x = x0 + i * step; return { x, z: waterlineAt(x) }; });
  // Smooth the found line so a single noisy sample never kinks the foam.
  const smoothZ = lines.map((line, i) => (lines[Math.max(0, i - 1)].z + line.z * 2 + lines[Math.min(lines.length - 1, i + 1)].z) / 4);
  lines.forEach((line, i) => {
    for (const s of across) {
      const x = line.x, z = smoothZ[i] - s, ground = Math.max(MAP_SEA_LEVEL, groundSurfaceAt(x, z).height);
      const p = mapDirection(x, z).multiplyScalar(MAP_RADIUS + ground + (s < 0 ? .03 : .022));
      positions.push(p.x, p.y, p.z); shore.push(s); along.push(x);
    }
  });
  const n = across.length;
  for (let i = 0; i < columns; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + n;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('shore', new THREE.Float32BufferAttribute(shore, 1));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setIndex(indices);
  // Faces point away from the planet centre for the winding check; normals are unused.
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

const surfVertex = /* glsl */`
  attribute float shore;
  attribute float along;
  varying float vShore;
  varying float vAlong;
  #include <fog_pars_vertex>
  void main() {
    vShore = shore; vAlong = along;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const surfFragment = /* glsl */`
  uniform float time;
  varying float vShore;
  varying float vAlong;
  #include <fog_pars_fragment>
  void main() {
    float s = vShore;
    float wobble = sin(vAlong * .23 + time * .3) * .35 + sin(vAlong * .61 - time * .17) * .2;
    // The swash runs up the sand and drains back, out of step along the beach.
    float swash = -1.9 * (.5 + .5 * sin(time * .75 + vAlong * .09 + wobble));
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    if (s < 0.0) {
      float wet = smoothstep(swash - .25, swash + .05, s);
      float edge = 1.0 - smoothstep(0.0, .22, abs(s - swash));
      color = mix(vec3(.42, .55, .52), vec3(.96, .96, .92), edge);
      alpha = wet * .32 + edge * .7;
      alpha *= smoothstep(-3.2, -2.4, s);
    } else {
      float depth = smoothstep(0.0, 10.0, s);
      vec3 shallow = mix(vec3(.36, .69, .66), vec3(.09, .28, .34), depth);
      float phase = s * .42 + time * .23 + wobble * .15;
      float crest = smoothstep(.82, .97, fract(phase)) * (1.0 - smoothstep(1.5, 8.0, s));
      float lace = smoothstep(.55, 1.0, sin(vAlong * 2.3 + s * 3.1 + time * .8) * .5 + .5) * crest;
      float shoreFoam = 1.0 - smoothstep(0.0, .9, s);
      color = mix(shallow, vec3(.95, .96, .93), clamp(crest * .8 + lace * .3 + shoreFoam * .7, 0.0, 1.0));
      alpha = mix(.62, 0.0, smoothstep(5.5, 10.5, s)) + crest * .3 + shoreFoam * .25;
    }
    // Fade the strip out at both ends of the public beach.
    alpha *= smoothstep(-28.5, -24.5, vAlong) * (1.0 - smoothstep(33.5, 37.5, vAlong));
    gl_FragColor = vec4(color, clamp(alpha, 0.0, .95));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function lifeguardTower(c: KitContext, prop: Extract<BeachProp, { kind: 'lifeguard' }>, ground: number) {
  const f = mapFrame(prop.x, prop.z, ground).matrix.multiply(new THREE.Matrix4().makeRotationY(prop.yaw));
  const deck = 1.9, white = '#EDE6D6';
  for (const sx of [-.95, .95]) for (const sz of [-.95, .95]) block(c.details, f, [sx, deck / 2 - .2, sz], [.14, deck + .4, .14], '#8B7A62');
  for (const sz of [-.95, .95]) block(c.details, f, [0, .9, sz], [1.9, .08, .08], '#8B7A62', [0, 0, .7]);
  block(c.structure, f, [0, deck, 0], [2.3, .14, 2.3], '#A08A6C');
  // The hut, its shutter windows facing the sea, and a hipped roof.
  block(c.structure, f, [0, deck + .85, .15], [1.7, 1.55, 1.5], white);
  block(c.details, f, [0, deck + 1.05, .91], [1.3, .5, .03], '#2E4A57');
  block(c.details, f, [0, deck + 1.36, .95], [1.5, .07, .12], prop.color);
  for (const side of [-1, 1]) block(c.details, f, [side * .86, deck + 1.05, .15], [.03, .5, .9], '#2E4A57');
  c.structure.shape(HIP, f, [0, deck + 1.95, .15], [1.45, .7, 1.35], prop.color, [0, Math.PI / 4, 0]);
  block(c.details, f, [0, deck + .55, .95], [1.72, .18, .02], prop.color);
  physicalSign(c, f, 'LIFEGUARD', 'WESTCOSE BEACH', [0, deck + .55, .965], 1.6, .18, [0, 0, 0], false, prop.color, undefined);
  // Deck rail on the sea side, a ramp down the land side and the flag.
  for (const x of [-1.1, 1.1]) block(c.details, f, [x, deck + .5, .6], [.06, .9, 1.1], white);
  block(c.details, f, [0, deck + .95, 1.12], [2.24, .06, .06], white);
  block(c.details, f, [.35, deck / 2, -2.15], [.9, .07, 3.1], '#A08A6C', [-.57, 0, 0]);
  for (const side of [-1, 1]) block(c.details, f, [.35 + side * .42, deck / 2 + .45, -2.15], [.04, .04, 3.1], white, [-.57, 0, 0]);
  tube(c.details, f, [-1.05, deck + 1.8, -.8], .03, 3.6, '#5A6767');
  block(c.details, f, [-.75, deck + 3.35, -.8], [.6, .38, .02], prop.color);
  block(c.details, f, [.95, deck + .95, -1.0], [.38, 1.6, .1], '#C4553F', [0, 0, -.12]);
}

function umbrella(c: KitContext, prop: Extract<BeachProp, { kind: 'umbrella' }>, ground: number, seed: number) {
  const f = mapFrame(prop.x, prop.z, ground).matrix.multiply(new THREE.Matrix4().makeRotationY(prop.yaw));
  tube(c.details, f, [0, 1.2, 0], .035, 2.4, '#EDE6D6', [.08, 0, 0]);
  c.structure.shape(CONE8, f, [0, 2.25, .09], [1.25, .45, 1.25], prop.color, [.08, 0, 0]);
  c.structure.shape(CONE8, f, [0, 2.27, .09], [.9, .34, .9], '#EDE6D6', [.08, Math.PI / 8, 0]);
  // A towel and a lounger in its shade.
  block(c.details, f, [-.55, .02, .25], [.8, .02, 1.7], ['#C4553F', '#5B7E8A', '#D9A441', '#7FA5AE'][seed % 4]);
  block(c.details, f, [-.6, .03, .25], [.8, .005, .12], P.bone);
  const lounger = new THREE.Matrix4().makeTranslation(.75, 0, .1);
  const l = f.clone().multiply(lounger);
  block(c.details, l, [0, .28, .1], [.62, .05, 1.2], '#EDE6D6');
  block(c.details, l, [0, .5, -.65], [.62, .05, .55], '#EDE6D6', [-.7, 0, 0]);
  for (const sx of [-.27, .27]) for (const sz of [-.4, .55]) block(c.details, l, [sx, .14, sz], [.04, .28, .04], '#8C939A');
  if (seed % 2) block(c.details, f, [.2, .2, -.75], [.5, .36, .34], '#5B7E8A');
}

function volleyball(c: KitContext, prop: Extract<BeachProp, { kind: 'volleyball' }>, ground: number) {
  const f = mapFrame(prop.x, prop.z, ground).matrix.multiply(new THREE.Matrix4().makeRotationY(prop.yaw));
  for (const side of [-1, 1]) tube(c.details, f, [side * 4.2, 1.25, 0], .06, 2.5, '#5A6767');
  block(c.details, f, [0, 2.3, 0], [8.3, .06, .02], '#EDE6D6');
  block(c.details, f, [0, 1.75, 0], [8.3, .03, .02], '#EDE6D6');
  for (let i = 0; i < 26; i++) block(c.details, f, [-4 + i * .32, 2.03, 0], [.012, .55, .012], '#3A4646');
  for (const [w, d, x, z] of [[8, .07, 0, 4], [8, .07, 0, -4], [.07, 8, 4, 0], [.07, 8, -4, 0]] as const) block(c.details, f, [x, .015, z], [w, .01, d], '#EDE6D6');
  c.details.shape(UNIT_LEAF, f, [1.6, .14, 1.8], [.14, .14, .14], '#EDE6D6');
}

function firePit(c: KitContext, x: number, z: number, ground: number) {
  const f = mapFrame(x, z, ground).matrix;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    c.structure.shape(UNIT_LEAF, f, [Math.cos(a) * .62, .14, Math.sin(a) * .62], [.22, .18, .2], i % 2 ? '#8C8A80' : '#A3A094', [0, a, 0]);
  }
  block(c.details, f, [0, .03, 0], [.9, .04, .9], '#3B3632');
  for (let i = 0; i < 3; i++) c.details.shape(LOG, f, [0, .16, 0], [.07, .9, .07], '#6B5A44', [Math.PI / 2, i * 1.05, .2]);
  block(c.glow, f, [0, .1, 0], [.35, .08, .35], '#F08A4B');
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + .4;
    c.details.shape(LOG, f, [Math.cos(a) * 1.7, .2, Math.sin(a) * 1.7], [.2, 1.5, .2], '#8B7358', [Math.PI / 2, a + Math.PI / 2, 0]);
  }
}

function boardRack(c: KitContext, x: number, z: number, ground: number, yaw: number) {
  const f = mapFrame(x, z, ground).matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
  for (const side of [-1, 1]) block(c.details, f, [side * 1.2, .7, 0], [.1, 1.4, .4], P.timber);
  block(c.details, f, [0, .45, 0], [2.5, .08, .4], P.timber);
  block(c.details, f, [0, 1.3, 0], [2.5, .08, .4], P.timber);
  const boards = [['#E8DCC2', '#C2653E'], ['#7FA5AE', P.bone], ['#D9A441', P.graphite], ['#C4553F', P.bone], ['#EDE6D6', '#2E4A57']];
  boards.forEach(([color, stripe], i) => {
    const b = f.clone().multiply(new THREE.Matrix4().makeTranslation(-.96 + i * .48, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ((i - 2) * .03));
    block(c.details, b, [0, 1.15, .05], [.42, 2.3, .06], color);
    block(c.details, b, [0, 1.2, .085], [.05, 2.0, .01], stripe);
  });
}

function bin(c: KitContext, x: number, z: number, ground: number) {
  const f = mapFrame(x, z, ground).matrix;
  tube(c.details, f, [0, .5, 0], .27, 1, '#5B7E8A');
  tube(c.details, f, [0, 1.02, 0], .3, .07, '#3A4646');
  for (let i = 0; i < 6; i++) block(c.details, f, [Math.cos(i) * .27, .5, Math.sin(i) * .27], [.04, .9, .04], '#4C6E79', [0, -i, 0]);
}

function shower(c: KitContext, x: number, z: number, ground: number) {
  const f = mapFrame(x, z, ground).matrix;
  block(c.details, f, [0, .02, 0], [.9, .04, .9], '#8C939A');
  tube(c.details, f, [0, 1.25, 0], .05, 2.5, '#9DA6A8');
  block(c.details, f, [0, 2.45, .25], [.05, .05, .5], '#9DA6A8');
  c.details.shape(CONE8, f, [0, 2.38, .5], [.12, .1, .12], '#9DA6A8', [Math.PI, 0, 0]);
}

function beachPalm(c: KitContext, x: number, z: number, ground: number, seed: number) {
  const f = mapFrame(x, z, ground).matrix;
  const height = 6 + (seed % 3) * .55, lean = ((seed % 5) - 2) * .045;
  let px = 0, py = 0;
  for (let k = 0; k < 7; k++) {
    const h = height / 7;
    tube(c.plants, f, [px, py + h / 2, 0], .2 - k * .014, h + .04, k % 2 ? '#8B7358' : '#7E684F', [0, 0, -lean * (k + 1)]);
    px += Math.sin(lean * (k + 1)) * h; py += Math.cos(lean * (k + 1)) * h;
  }
  const crown = f.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, 0));
  for (let b = 0; b < 9; b++) {
    const frond = crown.clone().multiply(new THREE.Matrix4().makeRotationY(b / 9 * Math.PI * 2 + seed));
    block(c.plants, frond, [0, .05, .9], [.5, .05, 1.9], b % 2 ? '#5E7F4E' : '#77965E', [.35, 0, 0]);
    block(c.plants, frond, [0, -.48, 2.05], [.38, .05, 1.1], b % 2 ? '#77965E' : '#5E7F4E', [.95, 0, 0]);
  }
}

/** Marram tufts on the dune hummocks and a few sea-worn logs and stones. */
function duneGrass(c: KitContext) {
  BEACH_DUNES.forEach(([dx, dz, hx, hz], index) => {
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996 + index, r = Math.sqrt(variation(index * 31 + i)) * .85;
      const x = dx + Math.cos(a) * hx * r, z = dz + Math.sin(a) * hz * r, ground = townSurfaceAt(x, z).height;
      const f = mapFrame(x, z, ground).matrix;
      for (let k = 0; k < 4; k++) c.plants.shape(BLADE, f, [Math.cos(k * 1.7) * .08, .28, Math.sin(k * 1.7) * .08], [.05, .58 + variation(i + k) * .3, .05], k % 2 ? '#8E9A62' : '#A3A86E', [Math.cos(k * 1.7) * .35, 0, Math.sin(k * 1.7) * .35]);
    }
  });
  for (const [x, z, yaw, length] of [[-27.4, -29.2, .5, 2.2], [29.6, -27.4, -.3, 2.8], [-17.8, -29.8, 1.2, 1.6]] as const) {
    const f = mapFrame(x, z, townSurfaceAt(x, z).height).matrix;
    c.details.shape(LOG, f, [0, .1, 0], [.14, length, .14], '#A8977E', [Math.PI / 2, yaw, 0]);
  }
  for (const [x, z, s] of [[-29.6, -27.5, .7], [-30.4, -24.6, .5], [-28.8, -29.6, .45]] as const) {
    const f = mapFrame(x, z, townSurfaceAt(x, z).height).matrix;
    c.structure.shape(UNIT_LEAF, f, [0, s * .12, 0], [s, s * .45, s * .85], '#8C8A80', [.2, x, .1]);
  }
}

function buildBeach() {
  const c = createKitContext();
  BEACH_PROPS.forEach((prop, i) => {
    const ground = townSurfaceAt(prop.x, prop.z).height;
    switch (prop.kind) {
      case 'lifeguard': lifeguardTower(c, prop, ground); break;
      case 'umbrella': umbrella(c, prop, ground, i); break;
      case 'volleyball': volleyball(c, prop, ground); break;
      case 'firepit': firePit(c, prop.x, prop.z, ground); break;
      case 'boards': boardRack(c, prop.x, prop.z, ground, prop.yaw); break;
      case 'bin': bin(c, prop.x, prop.z, ground); break;
      case 'shower': shower(c, prop.x, prop.z, ground); break;
      case 'palm': beachPalm(c, prop.x, prop.z, ground, i * 7 + 3); break;
    }
  });
  duneGrass(c);
  // A sign at the head of the west ramp.
  const sign = mapFrame(-21.6, -18.4, townSurfaceAt(-21.6, -18.4).height).matrix;
  for (const x of [-.75, .75]) tube(c.details, sign, [x, .75, 0], .05, 1.5, '#5A6767');
  physicalSign(c, sign, 'WESTCOSE BEACH', 'SWIM NEAR A LIFEGUARD / NO GLASS', [0, 1.4, .03], 1.9, .5, [0, Math.PI, 0], true, '#394F51');
  return { structure: c.structure.finish(), details: c.details.finish(), plants: c.plants.finish(), glow: c.glow.finish(), signs: c.signs };
}

/** The public beach: its living waterline and the everyday kit of a Californian beach. */
export default function Beach({ runtime }: { runtime: WorldRuntimeState }) {
  const beach = useMemo(() => buildBeach(), []);
  const surf = useMemo(() => surfGeometry(), []);
  const uniforms = useMemo(() => THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]), []);
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, dt) => {
    if (material.current && !runtime.reducedMotion && runtime.mode !== 'paused') material.current.uniforms.time.value += Math.min(dt, .05);
  });
  useEffect(() => () => { for (const g of [beach.structure, beach.details, beach.plants, beach.glow, surf]) g.dispose(); }, [beach, surf]);
  return <group name="beach">
    <mesh name="surf" geometry={surf} renderOrder={2}>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={surfVertex} fragmentShader={surfFragment} transparent depthWrite={false} fog polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
    <mesh geometry={beach.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.9} /></mesh>
    <mesh geometry={beach.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.85} /></mesh>
    <mesh geometry={beach.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <mesh geometry={beach.glow}><meshStandardMaterial vertexColors roughness={.4} emissive="#F08A4B" emissiveIntensity={.9} /></mesh>
    <SignAtlas signs={beach.signs} />
  </group>;
}
