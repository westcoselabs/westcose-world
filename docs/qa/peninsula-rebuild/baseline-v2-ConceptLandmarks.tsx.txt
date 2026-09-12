'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ART_WALLS, CAVE_POINTS, CAVE_FLOOR, LIGHTHOUSE, SKATE_CENTER, SKATE_ELEVATION, SKATE_STAIRS, SKATE_STAIR_LENGTH, SKATE_STAIR_BREAKS, landmarkSolids, skateHeightAt, skateStairFrameAt, skateStairPointAt } from '../data/concept-landmarks';
import { MAP_SUMMIT, mapFrame, mapMetric, mapPoint } from '../data/world-map';
import { TOWN_BUILDINGS, TOWN_ROUTES } from '../data/town-layout';
import { townSurfaceAt } from '../data/town-surfaces';
import { SceneryBatch, variation } from './sceneryGeometry';
import { block, createKitContext, physicalSign, tube, UNIT_BOX } from './kit/context';
import { SignAtlas } from './kit/SignAtlas';

const CONE = new THREE.ConeGeometry(1, 1, 7);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 7);
// One chamfer subdivision produces visible stone facets inside conservative OBB bounds.
const ROCK = new RoundedBoxGeometry(1, 1, 1, 1, .12);
ROCK.computeVertexNormals();

function beam(batch: SceneryBatch, from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string) {
  const direction = to.clone().sub(from), length = direction.length();
  if (length < 1e-5) return;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
  batch.add(CYLINDER, new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(.5), quaternion, new THREE.Vector3(radius, length, radius)), color);
}

function addStairs(batch: SceneryBatch) {
  const treadVertices: number[] = [], riserVertices: number[] = [];
  const quad = (target: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, expectedNormal: THREE.Vector3) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const points = normal.dot(expectedNormal) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const point of points) target.push(point.x, point.y, point.z);
  };
  const widthSegments = 8, half = SKATE_STAIRS.width / 2;
  for (let step = 0; step < SKATE_STAIRS.count; step++) {
    const from = step / SKATE_STAIRS.count * SKATE_STAIR_LENGTH;
    const to = (step + 1) / SKATE_STAIRS.count * SKATE_STAIR_LENGTH;
    const height = SKATE_STAIRS.baseHeight + step * SKATE_STAIRS.rise + .014;
    const splits = [from, ...SKATE_STAIR_BREAKS.filter(d => d > from && d < to), to];
    for (let piece = 1; piece < splits.length; piece++) {
      const start = splits[piece - 1], end = splits[piece], count = Math.max(1, Math.ceil((end - start) / .24));
      for (let along = 0; along < count; along++) {
        const a = THREE.MathUtils.lerp(start, end, along / count), b = THREE.MathUtils.lerp(start, end, (along + 1) / count);
        for (let cross = 0; cross < widthSegments; cross++) {
          const left = -half + cross / widthSegments * SKATE_STAIRS.width, right = -half + (cross + 1) / widthSegments * SKATE_STAIRS.width;
          quad(treadVertices, skateStairPointAt(a, left, height), skateStairPointAt(b, left, height), skateStairPointAt(b, right, height), skateStairPointAt(a, right, height), skateStairFrameAt((a + b) / 2, height).up);
        }
        // Terrain is recessed0.23m beneath the explicit kit; cheeks close those edges.
        for (const side of [-1, 1]) {
          const lateral = side * half;
          quad(riserVertices, skateStairPointAt(a, lateral, height), skateStairPointAt(b, lateral, height), skateStairPointAt(b, lateral, height - .25), skateStairPointAt(a, lateral, height - .25), skateStairFrameAt((a + b) / 2, height).right.multiplyScalar(side));
        }
      }
    }
    // Radial riser faces agree with the analytic .19m support jump at each boundary.
    const frame = skateStairFrameAt(to, height);
    for (let cross = 0; cross < widthSegments; cross++) {
      const left = -half + cross / widthSegments * SKATE_STAIRS.width, right = -half + (cross + 1) / widthSegments * SKATE_STAIRS.width;
      quad(riserVertices, skateStairPointAt(to, left, height), skateStairPointAt(to, right, height), skateStairPointAt(to, right, height + SKATE_STAIRS.rise), skateStairPointAt(to, left, height + SKATE_STAIRS.rise), frame.tangent.clone().negate());
    }
  }
  for (const [vertices, color] of [[treadVertices, '#9CA6A0'], [riserVertices, '#DDDACE']] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    batch.add(geometry, new THREE.Matrix4(), color);
    geometry.dispose();
  }
}

/** Low-detail concept geometry only. The terrain owns every walkable ramp and bowl surface. */
function buildLandmarks() {
  const kit = createKitContext();
  for (const item of landmarkSolids) kit.structure.add(item.shape === 'rock' ? ROCK : UNIT_BOX, item.matrix, item.color);
  addStairs(kit.structure);

  const sign = (title: string, subtitle: string, x: number, z: number, width = 3.3, elevation?: number, yaw = 0) => {
    const ground = elevation ?? townSurfaceAt(x, z).height;
    const frame = mapFrame(x, z, ground).matrix.clone().multiply(new THREE.Matrix4().makeRotationY(yaw));
    tube(kit.details, frame, [-width * .37, .8, 0], .045, 1.6, '#485958');
    tube(kit.details, frame, [width * .37, .8, 0], .045, 1.6, '#485958');
    physicalSign(kit, frame, title, subtitle, [0, 1.42, .06], width, .76, [0, 0, 0], true, '#394F51');
  };

  // Place the courtyard marker off the fresh-load point and out of the pier approach.
  const courtyard = mapFrame(3, 10.5, townSurfaceAt(3, 10.5).height).matrix;
  tube(kit.structure, courtyard, [0, .12, 0], 1.15, .24, '#BDBAAE');
  tube(kit.structure, courtyard, [0, .43, 0], .57, .46, '#779598');
  tube(kit.details, courtyard, [0, .75, 0], .3, .2, '#D5C7A5');
  sign('WESTCOSE COURTYARD', 'ARRIVAL / CONTACT / WATERFRONT', -3.7, 11.5, 3.3);
  sign('SKATE PARK', 'BOWL / QUARTER PIPES / BANK / RAIL', -30.3, 9.8, 3.3);
  sign('LIGHTHOUSE', 'UPPER TRAIL / VIEWING POINT', 32.8, -25.3, 2.5);
  sign('CAVE TO HIDDEN BEACH', 'LOWER BEACH ROUTE', CAVE_POINTS[0][0] - 2.5, CAVE_POINTS[0][1] - .5, 3.4, CAVE_FLOOR);
  sign('HIDDEN BEACH', 'A QUIET WESTCOSE DISCOVERY', 35.2, 2.5, 2.5);
  sign('SKI RESORT', 'THREE WALKABLE SNOW TRAILS', -2.3, 119, 3.4);

  // Simple coping makes the bowl legible without introducing a second support mesh.
  const metric = mapMetric(SKATE_CENTER[0], SKATE_ELEVATION);
  const coping: THREE.Vector3[] = [];
  for (let i = 0; i <= 56; i++) {
    const theta = i / 56 * Math.PI * 2;
    const x = SKATE_CENTER[0] + (-1 + 3.7 * Math.cos(theta)) / metric.x;
    const z = SKATE_CENTER[1] + 2.7 * Math.sin(theta) / metric.z;
    coping.push(mapPoint(x, z, (skateHeightAt(x, z) ?? SKATE_ELEVATION) + .035));
  }
  for (let i = 1; i < coping.length; i++) {
    // Leave a visibly open southern entry instead of railing over the ramp.
    const theta = (i - .5) / 56 * Math.PI * 2;
    if (theta > 1.32 * Math.PI && theta < 1.68 * Math.PI) continue;
    beam(kit.details, coping[i - 1], coping[i], .035, '#DDD8CA');
  }

  const towerFrame = mapFrame(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.elevation).matrix;
  kit.details.shape(CONE, towerFrame, [0, 11.55, 0], [2.08, .9, 2.08], '#606D6D', [0, Math.PI / 4, 0]);
  block(kit.details, towerFrame, [0, 1.55, 1.565], [.95, 2.3, .04], '#687578');
  // Lantern corner posts distinguish the tower silhouette in the globe review.
  for (const x of [-1.28, 1.28]) for (const z of [-1.28, 1.28]) tube(kit.details, towerFrame, [x, 10.44, z], .065, 1.43, '#5B6969');
  for (const side of [-1, 1]) {
    block(kit.details, towerFrame, [side * 1.94, 10.22, 0], [.07, .07, 3.88], '#6B7978');
    block(kit.details, towerFrame, [0, 10.22, side * 1.94], [3.88, .07, .07], '#6B7978');
    for (const along of [-1.9, 0, 1.9]) {
      tube(kit.details, towerFrame, [side * 1.94, 10.02, along], .045, .55, '#6B7978');
      tube(kit.details, towerFrame, [along, 10.02, side * 1.94], .045, .55, '#6B7978');
    }
  }

  // Static lift infrastructure: no skiing or lift mechanics in this milestone.
  const liftPoints = [124, 134, 144, 150].map(z => {
    const x = 7.8, height = townSurfaceAt(x, z).height;
    const frame = mapFrame(x, z, height);
    tube(kit.structure, frame.matrix, [0, 2.25, 0], .13, 4.5, '#687878');
    block(kit.details, frame.matrix, [0, 4.35, 0], [2.3, .16, .23], '#56696A');
    return { ...frame, z, height };
  });
  for (let i = 1; i < liftPoints.length; i++) {
    const a = liftPoints[i - 1], b = liftPoints[i];
    for (const side of [-1, 1]) {
      const start = a.position.clone().addScaledVector(a.up, 4.4).addScaledVector(a.east, side * .9);
      const end = b.position.clone().addScaledVector(b.up, 4.4).addScaledVector(b.east, side * .9);
      beam(kit.details, start, end, .035, '#485A5F');
      const middle = start.clone().lerp(end, .5), up = middle.clone().normalize();
      const seat = middle.clone().addScaledVector(up, -1.15);
      beam(kit.details, middle, seat, .04, '#576A6D');
      const matrix = new THREE.Matrix4().compose(seat, a.quaternion, new THREE.Vector3(1, 1, 1));
      block(kit.details, matrix, [0, 0, 0], [.95, .12, .48], '#A88967');
      block(kit.details, matrix, [0, .26, -.22], [.95, .45, .08], '#A88967');
    }
  }
  const peak = mapFrame(MAP_SUMMIT.x + 1.7, MAP_SUMMIT.z, townSurfaceAt(MAP_SUMMIT.x + 1.7, MAP_SUMMIT.z).height).matrix;
  tube(kit.details, peak, [0, 1.1, 0], .055, 2.2, '#56676A');
  block(kit.details, peak, [.44, 1.84, 0], [.86, .48, .035], '#CE775B');
  sign(`SUMMIT / ${MAP_SUMMIT.height} M`, 'SAME MOUNTAIN / OCEAN REAR FACE', MAP_SUMMIT.x - 2.7, MAP_SUMMIT.z - 1, 3.2);
  for (const [index, x, z] of [[1, 2.4, 145], [2, -11.1, 147], [3, 11.3, 145]]) sign(`TRAIL ${index}`, ['','CENTRAL', 'WESTERN FOREST', 'EASTERN CONTOUR'][index], x, z, 1.9);

  // Blank art and graffiti walls reserve the approved spaces without styling them yet.
  for (const { x, z, elevation, title } of ART_WALLS) {
    const frame = mapFrame(x, z, elevation).matrix;
    physicalSign(kit, frame, title, 'ARTWORK AFTER LAYOUT APPROVAL', [0, 1.12, .13], 3.2, .65, [0, 0, 0], false, '#DED6C4');
  }

  // Sparse procedural forest from the shared layout. Exclusion distances are physical metres.
  const routeSegments = TOWN_ROUTES.flatMap(route => route.points.slice(1).map((b, index) => ({ a: route.points[index], b, width: route.width })));
  const clearOfRoutes = (x: number, z: number, height: number) => {
    const metric = mapMetric(x, height);
    return routeSegments.every(({ a, b, width }) => {
      const ax = (a[0] - x) * metric.x, az = (a[1] - z) * metric.z;
      const dx = (b[0] - a[0]) * metric.x, dz = (b[1] - a[1]) * metric.z;
      const t = THREE.MathUtils.clamp(-(ax * dx + az * dz) / (dx * dx + dz * dz || 1), 0, 1);
      return Math.hypot(ax + dx * t, az + dz * t) > width / 2 + 1.2;
    });
  };
  for (let i = 0; i < 240; i++) {
    const x = (variation(i * 4 + 1) - .5) * 62;
    const z = 18 + variation(i * 4 + 2) * 122;
    const surface = townSurfaceAt(x, z);
    if (surface.height < .6 || !clearOfRoutes(x, z, surface.height)) continue;
    if (TOWN_BUILDINGS.some(b => Math.hypot(b.x - x, (b.z - z) * Math.cos(x / 36)) < Math.max(b.width, b.depth) / 2 + 1.5)) continue;
    const frame = mapFrame(x, z, surface.height).matrix;
    const size = 1.9 + variation(i * 4 + 3) * 1.9;
    tube(kit.plants, frame, [0, size * .3, 0], .12, size * .6, '#806F56');
    kit.plants.shape(CONE, frame, [0, size * .7, 0], [size * .34, size, size * .34], z > 128 ? '#789185' : i % 3 ? '#587862' : '#6B8666');
  }
  // Forest-trail side trees reinforce the western loop without occupying either approach.
  for (const [x, z] of [[-32, -7], [-29, -2], [-35, 4], [-32, 17], [-24, 23], [-19, 20]]) {
    const height = townSurfaceAt(x, z).height;
    if (height <= 0 || !clearOfRoutes(x, z, height)) continue;
    const frame = mapFrame(x, z, height).matrix;
    tube(kit.plants, frame, [0, .7, 0], .13, 1.4, '#806F56');
    kit.plants.shape(CONE, frame, [0, 2, 0], [1.1, 3.1, 1.1], '#597B64');
  }
  return { structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), signs: kit.signs };
}

export default function ConceptLandmarks() {
  const geometry = useMemo(() => buildLandmarks(), []);
  useEffect(() => () => { geometry.structure.dispose(); geometry.details.dispose(); geometry.plants.dispose(); }, [geometry]);
  return <group name="concept-landmarks">
    <mesh geometry={geometry.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={geometry.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.88} /></mesh>
    <mesh geometry={geometry.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <SignAtlas signs={geometry.signs} />
  </group>;
}
