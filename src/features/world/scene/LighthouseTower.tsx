'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHTHOUSE_FRAME } from '../data/concept-landmarks';
import { HATCH_SWEEP, LIGHTHOUSE_TOWER, STAIR_END_AZIMUTH, STAIR_RISE, STAIR_SWEEP, stairAt, towerRadiusAt } from '../data/lighthouse-tower';
import { block, createKitContext, tube, UNIT_BOX, type Triple } from './kit/context';

const T = LIGHTHOUSE_TOWER;
const DEG = Math.PI / 180;
const BONE = '#E4DBCB', RED = '#B76D56', STONE = '#9C978A', IRON = '#4F5B5C', GLASS_FRAME = '#5C6869';
/** Shaft bands: [from, to, colour] in metres above the terrace. */
const BANDS: [number, number, string][] = [[0, 5.5, BONE], [5.5, 8.5, RED], [8.5, 12.5, BONE], [12.5, 15.5, RED], [15.5, T.gallery, BONE]];
const TREADS = Math.round(STAIR_RISE / T.stair.tread);

/** Tower-local position at an azimuth (degrees, anticlockwise from east), radius and height. */
const at = (azimuth: number, radius: number, height: number): Triple => [Math.cos(azimuth * DEG) * radius, height, -Math.sin(azimuth * DEG) * radius];
/** Yaw that turns a box's local +x to point radially outward at an azimuth. */
const radialYaw = (azimuth: number): Triple => [0, azimuth * DEG, 0];

function buildTower() {
  const kit = createKitContext(), frame = LIGHTHOUSE_FRAME;
  const geometries: THREE.BufferGeometry[] = [];
  const frustum = (bottom: number, top: number, from: number, to: number, sides = T.sides) => {
    const geometry = new THREE.CylinderGeometry(top, bottom, to - from, sides, 1, false, Math.PI / sides);
    geometries.push(geometry);
    return geometry;
  };
  const place = (y: number) => frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, y, 0));

  // Plinth and shaft, in bands.
  kit.structure.add(frustum(T.baseRadius + .25, T.baseRadius + .15, 0, .55), place(.275 - .25), STONE);
  for (const [from, to, color] of BANDS) kit.structure.add(frustum(towerRadiusAt(from), towerRadiusAt(to), from, to), place((from + to) / 2), color);
  // A door facing the trail and narrow windows following the climb.
  block(kit.details, frame, at(T.stair.start + 32, T.baseRadius - .04, 1.2), [.08, 2.2, 1.05], '#5A4A3C', radialYaw(T.stair.start + 32));
  for (let k = 1; k <= 6; k++) {
    const f = k / 7, h = f * STAIR_RISE + 1.6, azimuth = T.stair.start + T.stair.spin * f * STAIR_SWEEP + 80;
    block(kit.details, frame, at(azimuth, towerRadiusAt(h) - .03, h), [.07, .9, .45], '#3E4A4C', radialYaw(azimuth));
  }

  // The stair: treads on a helical slab, a masonry base below its low end, and its rail.
  const baseHeight = T.stair.headroom + T.stair.slab;
  for (let k = 0; k < TREADS; k++) {
    const a = stairAt(k / TREADS), b = stairAt((k + 1) / TREADS), mid = (a.azimuth + b.azimuth) / 2;
    const top = (a.height + b.height) / 2, inner = towerRadiusAt(top) - .05, outer = inner + T.stair.width + .05, r = (inner + outer) / 2;
    const depth = Math.abs(b.azimuth - a.azimuth) * DEG * outer + .05;
    const bottom = top < baseHeight ? -.2 : top - .18 - T.stair.slab;
    block(kit.structure, frame, at(mid, r, (top + bottom) / 2), [outer - inner, top - bottom, depth], top < baseHeight ? STONE : '#B9B3A6', radialYaw(mid));
    // A darker nose line reads each step.
    block(kit.details, frame, at(mid, r, top + .01), [outer - inner, .025, .05], '#8C8679', radialYaw(mid));
    if (k % 2 === 0) tube(kit.details, frame, at(mid, outer - .07, top + .52), .028, 1.04, IRON);
  }
  // Handrail: short straight runs between rail posts.
  for (let k = 0; k < TREADS; k += 2) {
    const a = stairAt(k / TREADS), b = stairAt(Math.min(1, (k + 2) / TREADS));
    const pa = new THREE.Vector3(...at(a.azimuth, a.outer - .07, a.height + 1.04)), pb = new THREE.Vector3(...at(b.azimuth, b.outer - .07, b.height + 1.04));
    const length = pa.distanceTo(pb), center = pa.clone().add(pb).multiplyScalar(.5), direction = pb.clone().sub(pa).normalize();
    const rail = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction), new THREE.Vector3(length + .03, .05, .05));
    kit.details.add(UNIT_BOX, frame.clone().multiply(rail), IRON);
  }

  // The balcony: a ring of slab segments, open over the hatch, with its rail.
  const segments = 40, slabTop = T.gallery, inner = towerRadiusAt(T.gallery) - .05;
  const hatched = (azimuth: number) => { const offset = ((azimuth - STAIR_END_AZIMUTH) * -T.stair.spin % 360 + 360) % 360; return offset <= HATCH_SWEEP; };
  for (let k = 0; k < segments; k++) {
    const azimuth = k / segments * 360 + 360 / segments / 2;
    if (hatched(azimuth)) continue;
    const r = (inner + T.balcony.outer) / 2, depth = 2 * Math.PI * T.balcony.outer / segments + .06;
    block(kit.structure, frame, at(azimuth, r, slabTop - T.balcony.slab / 2), [T.balcony.outer - inner, T.balcony.slab, depth], '#6E7A7A', radialYaw(azimuth));
    tube(kit.details, frame, at(azimuth, T.balcony.rail, slabTop + T.balcony.railHeight / 2), .032, T.balcony.railHeight, IRON);
    for (const y of [T.balcony.railHeight, T.balcony.railHeight * .5]) block(kit.details, frame, at(azimuth, T.balcony.rail, slabTop + y), [.045, .045, depth], IRON, radialYaw(azimuth));
  }
  // Guard rails along both edges of the hatch.
  for (const edge of [STAIR_END_AZIMUTH, STAIR_END_AZIMUTH - T.stair.spin * HATCH_SWEEP]) {
    const r = (inner + T.balcony.outer) / 2;
    for (const y of [T.balcony.railHeight, T.balcony.railHeight * .5]) block(kit.details, frame, at(edge, r, slabTop + y), [T.balcony.outer - inner, .045, .045], IRON, radialYaw(edge));
    tube(kit.details, frame, at(edge, inner + .25, slabTop + T.balcony.railHeight / 2), .032, T.balcony.railHeight, IRON);
  }

  // Lantern room frame, roof and finial (the glass is its own material).
  kit.structure.add(frustum(T.lantern.radius + .12, T.lantern.radius + .12, 0, .35, 16), place(T.gallery + .175), GLASS_FRAME);
  for (let k = 0; k < 8; k++) tube(kit.details, frame, at(k * 45 + 22.5, T.lantern.radius, (T.gallery + T.lantern.top) / 2), .05, T.lantern.top - T.gallery, GLASS_FRAME);
  kit.structure.add(frustum(T.lantern.radius + .2, T.lantern.radius + .2, 0, .2, 16), place(T.lantern.top + .1), GLASS_FRAME);
  const roof = new THREE.ConeGeometry(T.lantern.radius + .3, T.roof - T.lantern.top - .2, 16);
  geometries.push(roof);
  kit.structure.add(roof, place((T.lantern.top + .2 + T.roof) / 2), '#3F4A4B');
  tube(kit.details, frame, [0, (T.roof + T.finial) / 2, 0], .04, T.finial - T.roof, IRON);

  const glass = new THREE.CylinderGeometry(T.lantern.radius - .02, T.lantern.radius - .02, T.lantern.top - T.gallery - .45, 16, 1, true);
  glass.translate(0, (T.gallery + .35 + T.lantern.top - .1) / 2, 0);
  glass.applyMatrix4(frame);
  const lamp = new THREE.SphereGeometry(.42, 12, 8);
  lamp.translate(0, (T.gallery + T.lantern.top) / 2 + .1, 0);
  lamp.applyMatrix4(frame);

  const result = { structure: kit.structure.finish(), details: kit.details.finish(), glass, lamp };
  for (const geometry of geometries) geometry.dispose();
  return result;
}

/** Two soft additive beams that sweep slowly round the lantern. */
function buildBeam() {
  const length = 24, radius = 1.5;
  const geometry = new THREE.ConeGeometry(radius, length, 12, 10, true);
  // Apex just outside the glass, widening outward along -x.
  geometry.rotateZ(-Math.PI / 2);
  geometry.translate(-length / 2 - T.lantern.radius - .3, 0, 0);
  const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < count; i++) {
    // Bright at the lamp, fading to nothing at the far end.
    // Fades in from its start and out toward its far end, so it never reads as a solid wedge.
    const t = Math.min(1, Math.max(0, (-position.getX(i) - T.lantern.radius - .3) / length)), glow = .075 * Math.min(1, t / .12) * (1 - t) ** 1.8;
    colors[i * 3] = glow; colors[i * 3 + 1] = glow * .92; colors[i * 3 + 2] = glow * .7;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mirrored = geometry.clone().rotateY(Math.PI);
  const both = new THREE.BufferGeometry();
  const merged = [geometry, mirrored].map(g => g.toNonIndexed());
  both.setAttribute('position', new THREE.Float32BufferAttribute([...merged[0].getAttribute('position').array, ...merged[1].getAttribute('position').array], 3));
  both.setAttribute('color', new THREE.Float32BufferAttribute([...merged[0].getAttribute('color').array, ...merged[1].getAttribute('color').array], 3));
  for (const g of [geometry, mirrored, ...merged]) g.dispose();
  return both;
}

/** The climbable lighthouse on the cape: shaft, spiral stair, balcony, lantern and beam. */
export default function LighthouseTower({ reduced }: { reduced: boolean }) {
  const tower = useMemo(() => buildTower(), []);
  const beam = useMemo(() => buildBeam(), []);
  const beamGroup = useRef<THREE.Group>(null);
  const beamBase = useMemo(() => {
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    LIGHTHOUSE_FRAME.clone().multiply(new THREE.Matrix4().makeTranslation(0, (T.gallery + T.lantern.top) / 2 + .1, 0)).decompose(position, quaternion, scale);
    return { position, quaternion };
  }, []);
  useEffect(() => () => { tower.structure.dispose(); tower.details.dispose(); tower.glass.dispose(); tower.lamp.dispose(); beam.dispose(); }, [tower, beam]);
  useFrame(({ clock }) => {
    const group = beamGroup.current;
    if (!group) return;
    const spin = reduced ? .6 : clock.elapsedTime * .35;
    group.position.copy(beamBase.position);
    group.quaternion.copy(beamBase.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  });
  return <group name="lighthouse-tower">
    <mesh geometry={tower.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={tower.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.85} /></mesh>
    <mesh geometry={tower.glass}><meshStandardMaterial color="#E9D9A6" emissive="#FFD27A" emissiveIntensity={.55} transparent opacity={.55} roughness={.2} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <mesh geometry={tower.lamp}><meshBasicMaterial color="#FFE7B0" toneMapped={false} /></mesh>
    <group ref={beamGroup}>
      <mesh geometry={beam} renderOrder={3}><meshBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
    </group>
  </group>;
}
