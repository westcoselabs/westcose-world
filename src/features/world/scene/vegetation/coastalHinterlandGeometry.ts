import * as THREE from 'three';
import { COASTAL_LOOKOUTS, COASTAL_REGIONS, COASTAL_TRAILS, type CoastalRegion, type CoastalSpecies } from '../../data/coastal-regions';
import { coordinatesAt, directionAt, frameAt, RADIUS, SEA_LEVEL, terrainHeightAt } from '../../data/planet';
import { surfaceMaterialAt } from '../../data/town-surfaces';
import { block } from '../kit/context';
import { SceneryBatch, variation } from '../sceneryGeometry';
import { COASTAL_TREES, plantingClearanceAt } from './coastalPlanting';

const Y = new THREE.Vector3(0, 1, 0), TAU = Math.PI * 2;
const IDENTITY = new THREE.Matrix4();
const COLORS = { bark: ['#5E6151', '#756E58'], oak: ['#4C6544', '#65784B', '#798553', '#92915E'], cypress: ['#405D4D', '#536E57', '#74805F'], scrub: ['#6D7D55', '#8A8C60', '#9B946A'] };
type Triple = [number, number, number];
export type HinterlandAnchor = {
  id: string; regionId: string; species: CoastalSpecies; x: number; z: number;
  groundHeight: number; up: Triple; position: Triple; scale: Triple; yaw: number; sector: number;
};
type GroundAnchor = { x: number; z: number; up: THREE.Vector3; position: THREE.Vector3; region: CoastalRegion };
type TrailSample = { up: THREE.Vector3; width: number; trail: string };

const physical = (up: THREE.Vector3) => up.clone().multiplyScalar(RADIUS);
const sectorAt = (x: number) => Math.min(2, Math.floor((x / RADIUS + Math.PI) / TAU * 3));

function trailSamples(): TrailSample[][] {
  return COASTAL_TRAILS.map(trail => {
    const samples: TrailSample[] = [];
    for (let i = 1; i < trail.points.length; i++) {
      const a = directionAt(trail.points[i - 1][0] / RADIUS, trail.points[i - 1][1] / RADIUS);
      const b = directionAt(trail.points[i][0] / RADIUS, trail.points[i][1] / RADIUS);
      const angle = a.angleTo(b), count = Math.ceil(angle * RADIUS / 0.75);
      const rotation = new THREE.Quaternion().setFromUnitVectors(a, b);
      for (let j = i === 1 ? 0 : 1; j <= count; j++) {
        const q = new THREE.Quaternion().slerp(rotation, j / count);
        samples.push({ up: a.clone().applyQuaternion(q), width: trail.width, trail: trail.id });
      }
    }
    return samples;
  });
}

/** Tangent offsets travel along great circles; latitude never compresses the spacing. */
function offsetFromRegion(region: CoastalRegion, u: number, v: number) {
  const lon = region.center[0] / RADIUS, lat = region.center[1] / RADIUS;
  const up = directionAt(lon, lat), east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  const angle = Math.hypot(u, v) / RADIUS;
  return up.multiplyScalar(Math.cos(angle)).add(east.multiplyScalar(u).add(north.multiplyScalar(v)).normalize().multiplyScalar(Math.sin(angle))).normalize();
}

function candidate(region: CoastalRegion, index: number, spread = 1) {
  const angle = index * 2.39996 + region.seed, radius = Math.sqrt(variation(index * 3.7 + region.seed));
  const lobe = index % 3, u = region.reach[0] * ([-0.39, 0.34, 0.08][lobe] + Math.cos(angle) * radius * 0.54) * spread;
  const v = region.reach[1] * ([-0.21, 0.24, 0.39][lobe] + Math.sin(angle) * radius * 0.57) * spread;
  return offsetFromRegion(region, u * Math.cos(region.wind) - v * Math.sin(region.wind), u * Math.sin(region.wind) + v * Math.cos(region.wind));
}

function dryGround(up: THREE.Vector3, clearance: number): { x: number; z: number; height: number } | null {
  const c = coordinatesAt(up), x = c.lon * RADIUS, z = c.lat * RADIUS;
  const height = terrainHeightAt(up);
  // Natural substrate, not the water shell or a road/platform surface, supports every new plant.
  if (height < SEA_LEVEL + 0.57 || surfaceMaterialAt(x, z) !== null || plantingClearanceAt(x, z) < clearance) return null;
  return { x, z, height };
}

export function createCoastalHinterlandLayout() {
  const trails = trailSamples(), trailPoints = trails.flat().map(sample => ({ ...sample, position: physical(sample.up) }));
  const trees: HinterlandAnchor[] = [], grasses: GroundAnchor[] = [], scrub: GroundAnchor[] = [], rocks: GroundAnchor[] = [];
  const occupied = COASTAL_TREES.map(t => physical(directionAt(t.x / RADIUS, t.z / RADIUS)));
  const lookoutPoints = COASTAL_LOOKOUTS.map(p => physical(directionAt(p.center[0] / RADIUS, p.center[1] / RADIUS)));
  const awayFromWalks = (up: THREE.Vector3, margin: number) => {
    const p = physical(up);
    return trailPoints.every(s => p.distanceToSquared(s.position) > (s.width / 2 + margin) ** 2)
      && lookoutPoints.every(l => p.distanceToSquared(l) > (2.2 + margin) ** 2);
  };
  for (const region of COASTAL_REGIONS) {
    let added = 0;
    for (let attempt = 0; attempt < region.trees * 45 && added < region.trees; attempt++) {
      const up = candidate(region, attempt), ground = dryGround(up, 2.15), p = physical(up);
      if (!ground || !awayFromWalks(up, 1.7) || occupied.some(other => p.distanceToSquared(other) < 3.3 ** 2)) continue;
      const species: CoastalSpecies = region.species === 'mixed' ? (added % 3 ? 'oak' : 'cypress') : region.species;
      const seed = region.seed + added * 17, size = 0.84 + variation(seed) * 0.31;
      trees.push({ id: `${region.id}-${added}`, regionId: region.id, species, x: ground.x, z: ground.z, groundHeight: ground.height,
        up: up.toArray() as Triple, position: up.clone().multiplyScalar(RADIUS + ground.height).toArray() as Triple,
        scale: [size * (0.88 + variation(seed + 2) * 0.2), size, size * (0.85 + variation(seed + 5) * 0.24)], yaw: region.wind + (variation(seed + 9) - 0.5) * 1.8, sector: sectorAt(ground.x) });
      occupied.push(p); added++;
    }
    const groundOccupied: THREE.Vector3[] = [];
    for (let attempt = 0; attempt < region.trees * 20 && groundOccupied.length < region.trees * 3; attempt++) {
      const up = candidate(region, attempt + 707, 1.15), ground = dryGround(up, 0.45), p = physical(up);
      if (!ground || !awayFromWalks(up, 0.34) || groundOccupied.some(other => p.distanceToSquared(other) < 0.58 ** 2)) continue;
      const anchor = { x: ground.x, z: ground.z, up, position: up.clone().multiplyScalar(RADIUS + ground.height - 0.018), region };
      grasses.push(anchor); groundOccupied.push(p);
      if (groundOccupied.length % 5 === 0 && dryGround(up, 1.0)) scrub.push(anchor);
      if (groundOccupied.length % 11 === 0 && dryGround(up, 1.25)) rocks.push(anchor);
    }
  }
  return { trees, grasses, scrub, rocks, trails };
}

function frameOnGround(anchor: { x: number; z: number; position: THREE.Vector3 }, yaw = 0) {
  const f = frameAt(anchor.x / RADIUS, anchor.z / RADIUS);
  return new THREE.Matrix4().compose(anchor.position, f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw)), new THREE.Vector3(1, 1, 1));
}

function branch(batch: SceneryBatch, geometry: THREE.BufferGeometry, start: THREE.Vector3, end: THREE.Vector3, radius: number, color: string, parent = IDENTITY) {
  const delta = end.clone().sub(start), matrix = new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()), new THREE.Vector3(radius, delta.length(), radius));
  batch.add(geometry, matrix.premultiply(parent), color);
}

/** Distinct leaf/fan silhouettes form the canopy; there are no sphere crowns. */
function leaf(batch: SceneryBatch, parent: THREE.Matrix4, base: THREE.Vector3, tip: THREE.Vector3, width: number, color: string, folded = true) {
  const delta = tip.clone().sub(base), side = new THREE.Vector3(-delta.z, 0.1, delta.x).normalize().multiplyScalar(width / 2);
  const middle = base.clone().addScaledVector(delta, 0.43), left = middle.clone().add(side), right = middle.clone().sub(side);
  const g = new THREE.BufferGeometry();
  if (folded) {
    const ridge = middle.clone().add(new THREE.Vector3(0, width * 0.16, 0));
    g.setAttribute('position', new THREE.Float32BufferAttribute([...base.toArray(), ...left.toArray(), ...tip.toArray(), ...right.toArray(), ...ridge.toArray()], 3));
    g.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  } else {
    g.setAttribute('position', new THREE.Float32BufferAttribute([...base.toArray(), ...left.toArray(), ...tip.toArray(), ...right.toArray()], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
  }
  g.computeVertexNormals(); batch.add(g, parent, color); g.dispose();
}

function treeArchetype(species: CoastalSpecies) {
  const batch = new SceneryBatch(), limb = new THREE.CylinderGeometry(0.65, 1, 1, 5, 1, true);
  const twig = new THREE.CylinderGeometry(0.5, 1, 1, 3, 1, true);
  const oak = species === 'oak', height = oak ? 4.7 : 5.3;
  const palette = oak ? COLORS.oak : COLORS.cypress;
  // Thin, irregular leaf mats join the small leaves into actual canopy masses.
  // Their broad, shallow profiles preserve lobed oaks and windswept cypress shelves.
  const canopyLobe = (center: THREE.Vector3, rx: number, rz: number, yaw: number, seed: number) => {
    const segments = oak ? 9 : 7, positions: number[] = [0.055, oak ? 0.15 : 0.063, -0.035, -0.04, oak ? -0.13 : -0.062, 0.035], indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * TAU, irregular = 0.79 + variation(seed + i * 3.1) * 0.24;
      positions.push(Math.cos(angle) * rx * irregular, (variation(seed + i * 2.3) - 0.5) * (oak ? 0.1 : 0.045), Math.sin(angle) * rz * irregular);
      indices.push(0, (i + 1) % segments + 2, i + 2, 1, i + 2, (i + 1) % segments + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const m = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(1, 1, 1));
    batch.add(geometry, m, palette[seed % palette.length]); geometry.dispose();
    return m;
  };
  const trunk = [new THREE.Vector3(0, -0.09, 0), new THREE.Vector3(-0.12, height * 0.27, 0.1), new THREE.Vector3(0.24, height * 0.57, -0.05), new THREE.Vector3(oak ? 0.58 : 0.88, height * 0.91, 0.12)];
  for (let j = 1; j < trunk.length; j++) branch(batch, limb, trunk[j - 1], trunk[j], 0.20 - j * 0.035, COLORS.bark[j % 2]);
  const branches = oak ? 8 : 7;
  for (let j = 0; j < branches; j++) {
    const angle = j * 2.39996 + (oak ? 0.4 : 0.8), tier = j % 3;
    const start = trunk[j < 3 ? 2 : 3].clone(), reach = oak ? 0.96 + variation(j + 23) * 0.43 : 0.85 + variation(j + 49) * 0.56;
    const end = new THREE.Vector3((oak ? 0.58 : 1.0) + Math.cos(angle) * reach, height * (oak ? 0.76 + tier * 0.058 : 0.70 + tier * 0.115), Math.sin(angle) * reach * (oak ? 0.82 : 0.65));
    const elbow = start.clone().lerp(end, 0.57).add(new THREE.Vector3(0, -0.19, 0.12));
    branch(batch, limb, start, elbow, 0.066 - tier * 0.011, COLORS.bark[0]);
    branch(batch, limb, elbow, end, 0.033, COLORS.bark[1]);
    const rx = oak ? 0.9 + variation(j + 19) * 0.14 : 1.06 + variation(j + 29) * 0.12;
    const rz = oak ? 0.69 + variation(j + 43) * 0.1 : 0.47 + variation(j + 37) * 0.08;
    const yaw = oak ? angle * 0.34 : 0.12 + j * 0.06;
    const canopy = end.clone().add(new THREE.Vector3(oak ? -0.045 : 0.12, 0.025, 0));
    const local = canopyLobe(canopy, rx, rz, yaw, j + (oak ? 13 : 29));
    branch(batch, twig, end, canopy.clone().add(new THREE.Vector3(rx * 0.63, 0.045, rz * 0.18)), 0.018, COLORS.bark[0]);
    const count = oak ? 18 : 24;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + j, spread = Math.sqrt((i + 0.5) / count) * 0.91;
      const base = new THREE.Vector3(Math.cos(a) * rx * spread, (oak ? 0.105 : 0.05) * (1 - spread * 0.75), Math.sin(a) * rz * spread);
      const length = oak ? 0.26 + variation(i * 3 + j) * 0.14 : 0.32 + variation(i + j * 3) * 0.14;
      const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * length + (oak ? 0 : 0.11), 0.035 + (i % 3) * 0.016, Math.sin(a) * length * (oak ? 0.76 : 0.5)));
      leaf(batch, local, base, tip, length * (oak ? 0.71 : 0.58), palette[(i + j + 1) % palette.length], false);
    }
  }
  for (let j = 0; j < 3; j++) {
    const a = j * TAU / 3;
    branch(batch, limb, new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(Math.cos(a) * 0.32, -0.065, Math.sin(a) * 0.32), 0.05, COLORS.bark[0]);
  }
  limb.dispose(); twig.dispose(); return batch.finish();
}

function groundArchetypes() {
  const grass = new SceneryBatch(), scrub = new SceneryBatch(), limb = new THREE.CylinderGeometry(0.4, 1, 1, 5, 1, true);
  for (let j = 0; j < 7; j++) {
    const angle = j * 2.39996, height = 0.28 + variation(j + 13) * 0.34;
    leaf(grass, IDENTITY, new THREE.Vector3(Math.cos(angle) * 0.05, 0, Math.sin(angle) * 0.05), new THREE.Vector3(0.14 + Math.cos(angle) * height * 0.34, height, Math.sin(angle) * height * 0.3), 0.045, COLORS.scrub[j % 3], false);
  }
  for (let j = 0; j < 3; j++) {
    const angle = j * 2.39996, end = new THREE.Vector3(Math.cos(angle) * 0.35, 0.36 + j * 0.1, Math.sin(angle) * 0.35);
    branch(scrub, limb, new THREE.Vector3(0, -0.03, 0), end, 0.027, COLORS.bark[0]);
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39996 + j, base = end.clone().add(new THREE.Vector3(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17));
      leaf(scrub, IDENTITY, base, base.clone().add(new THREE.Vector3(Math.cos(a) * 0.39, 0.16, Math.sin(a) * 0.39)), 0.25, COLORS.scrub[(i + j) % 3]);
    }
  }
  limb.dispose(); return { grass: grass.finish(), scrub: scrub.finish() };
}

function trailGeometry(a: TrailSample, b: TrailSample) {
  const along = b.up.clone().sub(a.up).normalize(), points: THREE.Vector3[] = [];
  for (const sample of [a, b]) {
    const across = new THREE.Vector3().crossVectors(along, sample.up).normalize();
    for (const side of [-1, 1]) {
      const up = sample.up.clone().multiplyScalar(RADIUS).addScaledVector(across, sample.width / 2 * side).normalize();
      points.push(up.multiplyScalar(RADIUS + terrainHeightAt(up) + 0.009));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => p.toArray()), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); return g;
}

export function buildCoastalHinterland() {
  const layout = createCoastalHinterlandLayout();
  const trees = { oak: treeArchetype('oak'), cypress: treeArchetype('cypress') };
  const types = groundArchetypes(), outcrop = new THREE.IcosahedronGeometry(1, 0);
  const ground = [new SceneryBatch(), new SceneryBatch(), new SceneryBatch()], props = new SceneryBatch();
  layout.grasses.forEach((anchor, i) => {
    const size = 0.73 + variation(i + 137) * 0.76;
    const m = frameOnGround(anchor, i * 2.39996).scale(new THREE.Vector3(size, size, size));
    ground[sectorAt(anchor.x)].add(types.grass, m, COLORS.scrub[i % 3]);
  });
  layout.scrub.forEach((anchor, i) => {
    const size = 0.8 + variation(i + 331) * 0.6;
    ground[sectorAt(anchor.x)].add(types.scrub, frameOnGround(anchor, i * 2.39996).scale(new THREE.Vector3(size, size, size)), COLORS.scrub[(i + 1) % 3]);
  });
  layout.rocks.forEach((anchor, i) => {
    const m = frameOnGround(anchor, i), batch = ground[sectorAt(anchor.x)];
    for (let j = 0; j < 3; j++) {
      const size = (1 - j * 0.21) * (0.7 + variation(i * 3 + j) * 0.4);
      batch.shape(outcrop, m, [(j - 1) * 0.5, 0.13, (j % 2) * 0.31], [size, size * 0.55, size * 0.67], ['#929480', '#A7A28B', '#B7AD94'][j], [0.1, i + j * 0.4, 0.2]);
    }
  });
  layout.trails.forEach(samples => {
    for (let i = 1; i < samples.length; i++) {
      if (!dryGround(samples[i - 1].up, 0.25) || !dryGround(samples[i].up, 0.25)) continue;
      const g = trailGeometry(samples[i - 1], samples[i]), x = coordinatesAt(samples[i].up).lon * RADIUS;
      ground[sectorAt(x)].add(g, IDENTITY, '#B0A58C'); g.dispose();
    }
  });
  let lookouts = 0;
  for (const spec of COASTAL_LOOKOUTS) {
    const up = directionAt(spec.center[0] / RADIUS, spec.center[1] / RADIUS), groundAt = dryGround(up, 1.5);
    if (!groundAt) continue;
    const m = frameOnGround({ x: groundAt.x, z: groundAt.z, position: up.multiplyScalar(RADIUS + groundAt.height - 0.025) }, spec.yaw);
    // A bench and two interrupted fence bays frame a view while leaving the walk open.
    for (let j = 0; j < 4; j++) block(props, m, [0, 0.46, (j - 1.5) * 0.12], [1.65, 0.065, 0.1], '#A08F73');
    const fenceTop = (x: number) => {
      const p = new THREE.Vector3(x, 0, 1.5).applyMatrix4(m).normalize();
      const c = coordinatesAt(p), position = p.clone().multiplyScalar(RADIUS + terrainHeightAt(p) - 0.035);
      const postFrame = frameOnGround({ x: c.lon * RADIUS, z: c.lat * RADIUS, position });
      block(props, postFrame, [0, 0.46, 0], [0.09, 0.92, 0.09], '#A08F73');
      return position.addScaledVector(p, 0.67);
    };
    for (const side of [-1, 1]) {
      block(props, m, [side * 0.58, 0.23, 0], [0.09, 0.46, 0.48], '#5E6151');
      const a = fenceTop(side * 1.5), b = fenceTop(side * 3.24), delta = b.clone().sub(a);
      const rail = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()), new THREE.Vector3(1, 1, 1));
      block(props, rail, [0, 0, 0], [0.065, delta.length(), 0.07], '#A08F73');
    }
    block(props, m, [0, 0.79, -0.23], [1.65, 0.42, 0.07], '#A08F73');
    block(props, m, [2, 0.49, -0.28], [0.095, 0.98, 0.095], '#7A7862');
    block(props, m, [2.12, 0.92, -0.28], [0.43, 0.17, 0.09], '#C3B69B');
    lookouts++;
  }
  const sectors = ground.map(b => b.finish()), details = props.finish();
  const treeTriangles = Object.entries(trees).reduce((n, [species, g]) => n + g.getAttribute('position').count / 3 * layout.trees.filter(t => t.species === species).length, 0);
  const groundTriangles = sectors.reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
  const stats = { trees: layout.trees.length, grasses: layout.grasses.length, scrub: layout.scrub.length, outcrops: layout.rocks.length, lookouts, regions: COASTAL_REGIONS.length,
    physicalTriangles: treeTriangles + groundTriangles + details.getAttribute('position').count / 3,
    drawCalls: new Set(layout.trees.map(t => `${t.regionId}:${t.species}`)).size + sectors.length + 1,
    bySpecies: { oak: layout.trees.filter(t => t.species === 'oak').length, cypress: layout.trees.filter(t => t.species === 'cypress').length },
    byRegion: Object.fromEntries(COASTAL_REGIONS.map(r => [r.id, layout.trees.filter(t => t.regionId === r.id).length])) };
  types.grass.dispose(); types.scrub.dispose(); outcrop.dispose();
  return { trees, sectors, details, layout, stats };
}

export function hinterlandMatrix(anchor: HinterlandAnchor) {
  const f = frameAt(anchor.x / RADIUS, anchor.z / RADIUS);
  return new THREE.Matrix4().compose(new THREE.Vector3(...anchor.position), f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, anchor.yaw)), new THREE.Vector3(...anchor.scale));
}
