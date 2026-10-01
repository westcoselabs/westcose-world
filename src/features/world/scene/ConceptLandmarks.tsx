'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ART_WALLS, CAVE_POINTS, CAVE_FLOOR, LIGHTHOUSE, landmarkDecor, landmarkSolids } from '../data/concept-landmarks';
import { MAP_RADIUS, mapFrame, mapMetric } from '../data/world-map';
import { TOWN_BUILDINGS, TOWN_ROUTES } from '../data/town-layout';
import { townSurfaceAt } from '../data/town-surfaces';
import { variation } from './sceneryGeometry';
import { block, createKitContext, physicalSign, tube, UNIT_BOX } from './kit/context';
import { SignAtlas } from './kit/SignAtlas';
import PeninsulaCliffs from './PeninsulaCliffs';
import { PENINSULA_COVE } from '../data/peninsula-layout';
import { MOUNTAIN_LAYOUT } from '../data/mountain-layout';

const CONE = new THREE.ConeGeometry(1, 1, 7);
// One chamfer subdivision produces visible stone facets inside conservative OBB bounds.
const ROCK = new RoundedBoxGeometry(1, 1, 1, 1, .12);
ROCK.computeVertexNormals();

/** Low-detail concept geometry only. The terrain owns every walkable ramp and bowl surface. */
function buildLandmarks() {
  const kit = createKitContext();
  for (const item of [...landmarkSolids, ...landmarkDecor]) kit.structure.add(item.shape === 'rock' ? ROCK : UNIT_BOX, item.matrix, item.color);

  const sign = (title: string, subtitle: string, x: number, z: number, width = 3.3, elevation?: number, yaw = 0) => {
    const ground = elevation ?? townSurfaceAt(x, z).height;
    const frame = mapFrame(x, z, ground).matrix.clone().multiply(new THREE.Matrix4().makeRotationY(yaw));
    tube(kit.details, frame, [-width * .37, .8, 0], .045, 1.6, '#485958');
    tube(kit.details, frame, [width * .37, .8, 0], .045, 1.6, '#485958');
    physicalSign(kit, frame, title, subtitle, [0, 1.42, .06], width, .76, [0, 0, 0], true, '#394F51');
  };

  sign('LIGHTHOUSE', 'UPPER TRAIL / VIEWING POINT', LIGHTHOUSE.x - 3.3, LIGHTHOUSE.z + 4.5, 2.5);
  sign('CAVE TO HIDDEN BEACH', 'LOWER BEACH ROUTE', CAVE_POINTS[0][0] - 3.2, CAVE_POINTS[0][1] + 2.5, 3.4, CAVE_FLOOR);
  sign('HIDDEN BEACH', 'A QUIET WESTCOSE DISCOVERY', PENINSULA_COVE.x - .7, PENINSULA_COVE.z + 3, 2.5);
  sign('SKI RESORT', 'LODGE / LIFT TICKETS / FOUR RUNS', MOUNTAIN_LAYOUT.pedestrianArrival.x-5.5, MOUNTAIN_LAYOUT.pedestrianArrival.z-1, 3.4);

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

  // The snowboard mountain's lift, gates, signs and trees live in SkiMountain.

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
    // Same seeded sequence as before; the mountain's own trees start above the town forest.
    if (z > 46) continue;
    const surface = townSurfaceAt(x, z);
    if (surface.height < .6 || !clearOfRoutes(x, z, surface.height)) continue;
    if (TOWN_BUILDINGS.some(b => Math.hypot(b.x - x, (b.z - z) * Math.cos(x / MAP_RADIUS)) < Math.max(b.width, b.depth) / 2 + 1.5)) continue;
    const frame = mapFrame(x, z, surface.height).matrix;
    const size = 1.9 + variation(i * 4 + 3) * 1.9;
    tube(kit.plants, frame, [0, size * .3, 0], .12, size * .6, '#806F56');
    kit.plants.shape(CONE, frame, [0, size * .7, 0], [size * .34, size, size * .34], i % 3 ? '#587862' : '#6B8666');
  }
  return { structure: kit.structure.finish(), details: kit.details.finish(), plants: kit.plants.finish(), signs: kit.signs };
}

export default function ConceptLandmarks() {
  const geometry = useMemo(() => buildLandmarks(), []);
  useEffect(() => () => { geometry.structure.dispose(); geometry.details.dispose(); geometry.plants.dispose(); }, [geometry]);
  return <group name="concept-landmarks">
    <PeninsulaCliffs />
    <mesh geometry={geometry.structure} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={geometry.details} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.88} /></mesh>
    <mesh geometry={geometry.plants} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
    <SignAtlas signs={geometry.signs} />
  </group>;
}
