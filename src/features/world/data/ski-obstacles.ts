/** Deterministic mountain obstacles shared by rendering and snowboard collision:
 * trees (forest belt, sparse snowfield, the Timber Chute glade), rocks on steep
 * snowfield, and chairlift pylons. Positions are chart coordinates; radii and
 * heights are physical metres.
 */
import { MAP_RADIUS, MAP_SEA_LEVEL } from './world-map';
import { MOUNTAIN_LAYOUT, massifHeightAt, mountainCoastDistance, mountainFinishAreaAt } from './mountain-layout';
import { groundSurfaceAt } from './town-surfaces';
import { RUN_FEATHER, runWidthAt, skiRunSampleAt } from './ski-runs';

export type SkiObstacleKind = 'tree' | 'rock' | 'pylon';
export type SkiObstacle = {
  id: string; kind: SkiObstacleKind; x: number; z: number;
  /** Terrain height at the base. */
  ground: number;
  /** Collision radius (trunk, boulder or post). */
  radius: number;
  /** Height above the ground the obstacle blocks. */
  height: number;
  /** Visual scale factor. */
  size: number;
  /** Near-miss radius for scoring (trees only). */
  nearMiss: number;
};

const variation = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123; return value - Math.floor(value); };
const metricAt = (x: number, h: number) => { const k = (MAP_RADIUS + h) / MAP_RADIUS; return { x: k, z: Math.cos(x / MAP_RADIUS) * k }; };

/** Chairlift from beside the resort finish up to the back of the summit plateau. */
export const SKI_LIFT = {
  bottom: { x: 11, z: 58 },
  top: { x: 2, z: MOUNTAIN_LAYOUT.summitPlateau.z + 4 },
  towerSpacing: 20,
  towerHeight: 6.4,
} as const;

const plateau = MOUNTAIN_LAYOUT.summitPlateau;
const inArea = (x: number, z: number, area: { x: number; z: number; width: number; depth: number; height: number }, margin: number) => {
  const m = metricAt(area.x, area.height);
  return Math.abs(x - area.x) * m.x <= area.width / 2 + margin && Math.abs(z - area.z) * m.z <= area.depth / 2 + margin;
};
function clearOfFacilities(x: number, z: number, height: number) {
  if (inArea(x, z, plateau, 4) || inArea(x, z, MOUNTAIN_LAYOUT.resortTerrace, 5)) return false;
  if (mountainFinishAreaAt(x, z)) return false;
  for (const area of Object.values(MOUNTAIN_LAYOUT.finishAreas)) if (inArea(x, z, { ...area, height }, 3)) return false;
  return true;
}
/** Distance from the lift line in physical metres. */
function liftDistance(x: number, z: number, height: number) {
  const { bottom, top } = SKI_LIFT, m = metricAt(x, height);
  const dx = (top.x - bottom.x) * m.x, dz = (top.z - bottom.z) * m.z, px = (x - bottom.x) * m.x, pz = (z - bottom.z) * m.z;
  const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - dx * t, pz - dz * t);
}
/** Glade windows where trees may stand just inside the groomed edge. */
const GLADES = [{ run: 'timber-chute' as const, from: 76, to: 104 }];

function buildObstacles(): SkiObstacle[] {
  const result: SkiObstacle[] = [];
  let seed = 1;
  // Trees and rocks on a jittered grid over the mountain island.
  for (let gz = 46; gz <= 302; gz += 4.2) for (let gx = -92; gx <= 92; gx += 4.2) {
    seed++;
    const x = gx + (variation(seed * 3.1) - .5) * 3.6, z = gz + (variation(seed * 7.7) - .5) * 3.6;
    if (mountainCoastDistance(x, z) < 3) continue;
    const ground = groundSurfaceAt(x, z).height;
    if (ground < MAP_SEA_LEVEL + .6 || !clearOfFacilities(x, z, ground)) continue;
    const massif = massifHeightAt(x, z), roll = variation(seed * 13.3);
    const run = skiRunSampleAt(x, z);
    let glade = false;
    if (run && run.s > 0 && run.s < run.run.length) {
      const half = runWidthAt(run.run, run.s) / 2;
      glade = GLADES.some(window => window.run === run.run.id && run.s > window.from && run.s < window.to) && run.distance > 2.2;
      // Trees may line the powder bank 2.2m beyond the groomed edge: near-miss territory.
      if (!glade && run.distance < half + 2.2) continue;
    }
    if (liftDistance(x, z, ground) < 3.2) continue;
    // Forest below the snow line, thinning with altitude; glades are deliberately sparse.
    const edge = run && run.s > 0 && run.s < run.run.length && run.distance < runWidthAt(run.run, run.s) / 2 + RUN_FEATHER + 2 ? .55 : 1;
    const density = (glade ? .5 : massif < 5 ? .92 : massif < 20 ? .62 : massif < 40 ? .3 : massif < 58 ? .1 : 0) * edge;
    if (roll < density) {
      const size = .8 + variation(seed * 5.3) * .75;
      result.push({ id: `tree-${result.length}`, kind: 'tree', x, z, ground, radius: .32 * size + .08, height: 4.6 * size, size, nearMiss: 1.3 + .4 * size });
    } else if (massif > 12 && roll > .965) {
      const size = .7 + variation(seed * 9.9) * 1.1;
      result.push({ id: `rock-${result.length}`, kind: 'rock', x, z, ground, radius: .55 * size, height: .9 * size, size, nearMiss: 0 });
    }
  }
  // Lift pylons along the line, never inside a groomed run or its feather.
  const { bottom, top } = SKI_LIFT;
  const approxLength = Math.hypot(top.x - bottom.x, top.z - bottom.z) * 1.35;
  const count = Math.round(approxLength / SKI_LIFT.towerSpacing);
  for (let i = 0; i <= count; i++) {
    const t = i / count, x = bottom.x + (top.x - bottom.x) * t, z = bottom.z + (top.z - bottom.z) * t;
    const run = skiRunSampleAt(x, z);
    if (run && run.s > 0 && run.s < run.run.length && run.distance < runWidthAt(run.run, run.s) / 2 + 2) continue;
    result.push({ id: `pylon-${i}`, kind: 'pylon', x, z, ground: groundSurfaceAt(x, z).height, radius: .28, height: SKI_LIFT.towerHeight, size: 1, nearMiss: 0 });
  }
  return result;
}

export const SKI_OBSTACLES: readonly SkiObstacle[] = buildObstacles();

const CELL = 8;
const cells = new Map<number, SkiObstacle[]>();
const cellKey = (cx: number, cz: number) => cx + 64 + (cz + 128) * 256;
for (const obstacle of SKI_OBSTACLES) {
  const key = cellKey(Math.floor(obstacle.x / CELL), Math.floor(obstacle.z / CELL)), list = cells.get(key);
  if (list) list.push(obstacle); else cells.set(key, [obstacle]);
}

/** Obstacles within the 3x3 cells around a chart point. */
export function obstaclesNear(x: number, z: number): SkiObstacle[] {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), found: SkiObstacle[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = cells.get(cellKey(cx + i, cz + j));
    if (list) found.push(...list);
  }
  return found;
}

/** Physical horizontal distance from a chart point to an obstacle's axis. */
export function obstacleDistance(obstacle: SkiObstacle, x: number, z: number, height: number): number {
  const m = metricAt((x + obstacle.x) / 2, height);
  return Math.hypot((x - obstacle.x) * m.x, (z - obstacle.z) * m.z);
}
