'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP_RADIUS, MAP_SUMMIT, mapDirection, mapFrame } from '../data/world-map';
import { MOUNTAIN_LAYOUT } from '../data/mountain-layout';
import { groundSurfaceAt } from '../data/town-surfaces';
import { FEATURE_MESH_MARGIN, SKI_RUNS, detailedFeatures, featureSpan, runFeatureOffset, runPointAt, runWidthAt, type Difficulty, type SkiRun } from '../data/ski-runs';
import { SKI_LIFT, SKI_OBSTACLES } from '../data/ski-obstacles';
import { block, createKitContext, physicalSign, tube, type KitContext, type Triple } from './kit/context';
import { SignAtlas } from './kit/SignAtlas';
import type { SceneryBatch } from './sceneryGeometry';

const CONE = new THREE.ConeGeometry(1, 1, 7);
const DISC = new THREE.CylinderGeometry(1, 1, 1, 18);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 6);
const ROCK = new RoundedBoxGeometry(1, 1, 1, 1, .14);
ROCK.computeVertexNormals();

export const DIFFICULTY_COLOR: Record<Difficulty, string> = { green: '#2F9E44', blue: '#1C7ED6', black: '#1F2426', 'double-black': '#1F2426' };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { green: 'BEGINNER', blue: 'INTERMEDIATE', black: 'ADVANCED', 'double-black': 'EXPERT' };
const GROOMED = new THREE.Color('#D3E2E0'), BANK = new THREE.Color('#E6EDE6'), KICKER = new THREE.Color('#BCD3D8'), FACE = new THREE.Color('#9DB1B3');

const heightAt = (x: number, z: number) => groundSurfaceAt(x, z).height;
/** A frame on the terrain whose local +Z faces the given east/north direction. */
function facingFrame(x: number, z: number, east: number, north: number, lift = 0) {
  const frame = mapFrame(x, z, heightAt(x, z) + lift).matrix.clone();
  return frame.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(east, -north)));
}
function beam(batch: SceneryBatch, from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string) {
  const direction = to.clone().sub(from), length = direction.length();
  if (length < 1e-5) return;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
  batch.add(CYLINDER, new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(.5), quaternion, new THREE.Vector3(radius, length, radius)), color);
}

/** Standard North American trail symbol on a white backing plate. */
export function difficultySymbol(batch: SceneryBatch, frame: THREE.Matrix4, position: Triple, difficulty: Difficulty, size: number) {
  block(batch, frame, position, [size * (difficulty === 'double-black' ? 2.3 : 1.4), size * 1.4, .05], '#F4F1E8');
  const color = DIFFICULTY_COLOR[difficulty], front: Triple = [position[0], position[1], position[2] + .035];
  if (difficulty === 'green') batch.shape(DISC, frame, front, [size * .5, .03, size * .5], color, [Math.PI / 2, 0, 0]);
  else if (difficulty === 'blue') block(batch, frame, front, [size * .82, size * .82, .03], color);
  else if (difficulty === 'black') block(batch, frame, front, [size * .6, size * .6, .03], color, [0, 0, Math.PI / 4]);
  else for (const dx of [-.42, .42]) block(batch, frame, [front[0] + dx * size, front[1], front[2]], [size * .52, size * .52, .03], color, [0, 0, Math.PI / 4]);
}

function addTreesAndRocks(kit: KitContext) {
  for (const obstacle of SKI_OBSTACLES) {
    const frame = mapFrame(obstacle.x, obstacle.z, obstacle.ground).matrix;
    const size = obstacle.size, spin = (obstacle.x * 7.3 + obstacle.z * 3.1) % (Math.PI * 2);
    if (obstacle.kind === 'tree') {
      const frosted = obstacle.ground > 18;
      tube(kit.plants, frame, [0, .75 * size, 0], .16 * size, 1.5 * size, '#7C6A52');
      kit.plants.shape(CONE, frame, [0, 2.4 * size, 0], [1.15 * size, 3.2 * size, 1.15 * size], frosted ? '#6F8C7E' : '#557A60', [0, spin, 0]);
      kit.plants.shape(CONE, frame, [0, 3.7 * size, 0], [.75 * size, 2 * size, .75 * size], frosted ? '#DDE6E0' : '#628767', [0, spin + .4, 0]);
    } else if (obstacle.kind === 'rock') {
      kit.structure.shape(ROCK, frame, [0, .32 * size, 0], [1.3 * size, .9 * size, 1.05 * size], '#7F8A86', [.12, spin, -.08]);
    }
  }
}

function addLift(kit: KitContext) {
  const { bottom, top, towerHeight } = SKI_LIFT;
  const stations = [bottom, top].map(point => ({ ...point, frame: mapFrame(point.x, point.z, heightAt(point.x, point.z)) }));
  for (const [index, station] of stations.entries()) {
    block(kit.structure, station.frame.matrix, [0, 1.3, 0], [3.2, 2.6, 2.6], index === 0 ? '#A66A45' : '#5B7E8A');
    block(kit.details, station.frame.matrix, [0, 2.75, 0], [3.8, .3, 3.2], '#39474A');
    tube(kit.structure, station.frame.matrix, [0, towerHeight / 2 + 1.2, 0], .2, towerHeight - 2.4, '#687878');
  }
  const towers = [
    { x: bottom.x, z: bottom.z },
    ...SKI_OBSTACLES.filter(obstacle => obstacle.kind === 'pylon').map(obstacle => ({ x: obstacle.x, z: obstacle.z })),
    { x: top.x, z: top.z },
  ].sort((a, b) => a.z - b.z);
  const heads = towers.map(tower => {
    const frame = mapFrame(tower.x, tower.z, heightAt(tower.x, tower.z));
    tube(kit.structure, frame.matrix, [0, towerHeight / 2, 0], .14, towerHeight, '#687878');
    block(kit.details, frame.matrix, [0, towerHeight - .1, 0], [2.4, .16, .24], '#56696A');
    return frame;
  });
  for (let i = 1; i < heads.length; i++) {
    const a = heads[i - 1], b = heads[i];
    for (const side of [-1, 1]) {
      const start = a.position.clone().addScaledVector(a.up, towerHeight - .15).addScaledVector(a.east, side * 1);
      const end = b.position.clone().addScaledVector(b.up, towerHeight - .15).addScaledVector(b.east, side * 1);
      beam(kit.details, start, end, .035, '#485A5F');
      const chairs = Math.max(1, Math.round(start.distanceTo(end) / 9));
      for (let c = 0; c < chairs; c++) {
        const hook = start.clone().lerp(end, (c + .5) / chairs), up = hook.clone().normalize(), seat = hook.clone().addScaledVector(up, -1.2);
        beam(kit.details, hook, seat, .035, '#576A6D');
        const matrix = new THREE.Matrix4().compose(seat, a.quaternion, new THREE.Vector3(1, 1, 1));
        block(kit.details, matrix, [0, 0, 0], [1, .12, .5], side < 0 ? '#A88967' : '#8C7157');
        block(kit.details, matrix, [0, .28, -.23], [1, .46, .08], side < 0 ? '#A88967' : '#8C7157');
      }
    }
  }
}

function runSign(kit: KitContext, run: SkiRun, s: number, lateral: number, title: string, subtitle: string, width: number) {
  const point = runPointAt(run, s, lateral), frame = facingFrame(point.x, point.z, -point.tangent.east, -point.tangent.north);
  tube(kit.details, frame, [-width * .38, .9, 0], .05, 1.8, '#485958');
  tube(kit.details, frame, [width * .38, .9, 0], .05, 1.8, '#485958');
  physicalSign(kit, frame, title, subtitle, [0, 1.55, .06], width, .72, [0, 0, 0], true, '#394F51');
  difficultySymbol(kit.details, frame, [0, 2.25, .04], run.difficulty, .32);
}

function addRunDressing(kit: KitContext, run: SkiRun) {
  const halfAt = (s: number) => runWidthAt(run, s) / 2;
  // Start arch across the gate: two posts, a banner and the trail symbol.
  const start = runPointAt(run, 2), startFrame = facingFrame(start.x, start.z, -start.tangent.east, -start.tangent.north);
  const span = Math.min(run.width, 9) / 2 + .4;
  for (const side of [-1, 1]) tube(kit.structure, startFrame, [side * span, 1.6, 0], .09, 3.2, '#39474A');
  block(kit.structure, startFrame, [0, 3.15, 0], [span * 2 + .3, .16, .16], '#39474A');
  physicalSign(kit, startFrame, `${run.number} · ${run.name.toUpperCase()}`, `${run.rating.toUpperCase()} · ${DIFFICULTY_LABEL[run.difficulty]}`, [0, 2.65, .1], Math.min(span * 2 - .4, 5.2), .8, [0, 0, 0], true, '#263C3A');
  difficultySymbol(kit.details, startFrame, [0, 3.55, .02], run.difficulty, .38);
  // Finish arch at the run-out.
  const finish = runPointAt(run, run.length - 3), finishFrame = facingFrame(finish.x, finish.z, -finish.tangent.east, -finish.tangent.north);
  const finishSpan = Math.min(run.width, 9) / 2 + .6;
  for (const side of [-1, 1]) tube(kit.structure, finishFrame, [side * finishSpan, 1.7, 0], .1, 3.4, '#A66A45');
  physicalSign(kit, finishFrame, 'FINISH', run.name.toUpperCase(), [0, 3, .08], finishSpan * 2 - .2, .8, [0, 0, 0], false, '#E9DFCE');
  // Trail markers on the skier's-right edge.
  for (let s = 30; s < run.length - 25; s += 55) {
    const marker = runPointAt(run, s, -(halfAt(s) + .9)), frame = facingFrame(marker.x, marker.z, -marker.tangent.east, -marker.tangent.north);
    tube(kit.details, frame, [0, .8, 0], .045, 1.6, '#485958');
    difficultySymbol(kit.details, frame, [0, 1.55, .04], run.difficulty, .26);
  }
  // Orange warning poles well before every jump and drop.
  for (const feature of run.features) {
    if (feature.kind !== 'kicker' && feature.kind !== 'drop') continue;
    const [a] = featureSpan(feature), s = Math.max(4, a - 30);
    for (const side of [-1, 1]) {
      const pole = runPointAt(run, s, side * (halfAt(s) + .6)), frame = mapFrame(pole.x, pole.z, heightAt(pole.x, pole.z)).matrix;
      tube(kit.details, frame, [0, .9, 0], .04, 1.8, '#E8590C');
      block(kit.details, frame, [0, 1.7, 0], [.34, .22, .03], '#F76707');
    }
    runSign(kit, run, s, -(halfAt(s) + 2.2), feature.kind === 'kicker' ? 'JUMP AHEAD' : 'DROP AHEAD', feature.kind === 'kicker' ? `${feature.lip.toFixed(1)} M LIP` : `${feature.height.toFixed(1)} M DROP`, 2.2);
  }
  // Slalom gates: pole pairs with flag panels, alternating colours.
  for (const [index, gate] of run.gates.entries()) {
    const color = index % 2 ? '#1C7ED6' : '#E03131';
    for (const side of [-1, 1]) {
      const pole = runPointAt(run, gate.s, gate.offset + side * 2.1), frame = facingFrame(pole.x, pole.z, -pole.tangent.east, -pole.tangent.north);
      tube(kit.details, frame, [0, .95, 0], .035, 1.9, color);
      block(kit.details, frame, [side * -.28, 1.45, 0], [.52, .62, .02], color);
    }
  }
}

/** Detailed kicker, mogul and drop surfaces sampled from the same height function as physics. */
function addFeatureMeshes(target: { positions: number[]; colors: number[]; indices: number[] }) {
  const color = new THREE.Color();
  for (const run of SKI_RUNS) {
    for (const feature of detailedFeatures(run)) {
      const [a, b] = featureSpan(feature), { outer } = FEATURE_MESH_MARGIN;
      const half = run.width / 2 + outer, ds = .3, dl = .35;
      const rows = Math.ceil((b - a + outer * 2) / ds), cols = Math.ceil(half * 2 / dl);
      const base = target.positions.length / 3;
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
        const s = a - outer + i * ds, lateral = -half + j * dl, point = runPointAt(run, s, lateral);
        const h = heightAt(point.x, point.z), d = mapDirection(point.x, point.z).multiplyScalar(MAP_RADIUS + h + .02);
        target.positions.push(d.x, d.y, d.z);
        const inside = Math.abs(lateral) <= runWidthAt(run, s) / 2;
        const offset = runFeatureOffset(run, s, lateral);
        color.copy(inside ? GROOMED : BANK);
        if (feature.kind === 'kicker' && offset > .05) color.lerp(KICKER, Math.min(1, offset / feature.lip));
        if (feature.kind === 'moguls') color.lerp(offset > 0 ? BANK : KICKER, Math.min(1, Math.abs(offset) / feature.amplitude) * .6);
        if (feature.kind === 'drop') { const face = Math.abs(s - feature.s) < feature.face; if (face) color.lerp(FACE, .7); }
        target.colors.push(color.r, color.g, color.b);
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const p = base + i * (cols + 1) + j, q = p + cols + 1;
        target.indices.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
  }
}

export function buildSkiMountain() {
  const kit = createKitContext();
  addTreesAndRocks(kit);
  addLift(kit);
  for (const run of SKI_RUNS) addRunDressing(kit, run);
  // Summit flag and sign on the rounded peak behind the start plateau.
  const peak = mapFrame(MAP_SUMMIT.x + 1.5, MAP_SUMMIT.z, heightAt(MAP_SUMMIT.x + 1.5, MAP_SUMMIT.z)).matrix;
  tube(kit.details, peak, [0, 1.6, 0], .06, 3.2, '#56676A');
  block(kit.details, peak, [.55, 2.8, 0], [1.1, .6, .04], '#CE775B');
  const plateau = MOUNTAIN_LAYOUT.summitPlateau;
  const summitSign = facingFrame(plateau.x, plateau.z + 3, 0, -1);
  tube(kit.details, summitSign, [-1.5, .9, 0], .05, 1.8, '#485958');
  tube(kit.details, summitSign, [1.5, .9, 0], .05, 1.8, '#485958');
  physicalSign(kit, summitSign, `SUMMIT · ${MAP_SUMMIT.height} M`, 'FOUR RUNS · CHOOSE YOUR GATE', [0, 1.55, .06], 3.8, .8, [0, 0, 0], true, '#394F51');
  for (const area of [MOUNTAIN_LAYOUT.finishAreas.west, MOUNTAIN_LAYOUT.finishAreas.east]) {
    const frame = facingFrame(area.x, area.z - area.depth / 2 - .5, 0, -1);
    tube(kit.details, frame, [-1.2, .8, 0], .05, 1.6, '#485958');
    tube(kit.details, frame, [1.2, .8, 0], .05, 1.6, '#485958');
    physicalSign(kit, frame, area.name.toUpperCase(), 'WALK ON: TOWN IS DOWNHILL', [0, 1.45, .06], 3, .72, [0, 0, 0], true, '#394F51');
  }
  const surface = { positions: [] as number[], colors: [] as number[], indices: [] as number[] };
  addFeatureMeshes(surface);
  const features = new THREE.BufferGeometry();
  features.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
  features.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
  features.setIndex(surface.indices);
  features.computeVertexNormals();
  features.computeBoundingSphere();
  return { structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), signs: kit.signs, features };
}

/** Static snowboard-mountain dressing; the game's tokens and rider live in the snowboard feature. */
export default function SkiMountain() {
  const geometry = useMemo(() => buildSkiMountain(), []);
  useEffect(() => () => { geometry.structure.dispose(); geometry.details.dispose(); geometry.plants.dispose(); geometry.features.dispose(); }, [geometry]);
  return <group name="ski-mountain">
    <mesh geometry={geometry.features} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={geometry.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={geometry.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.88} /></mesh>
    <mesh geometry={geometry.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <SignAtlas signs={geometry.signs} />
  </group>;
}
