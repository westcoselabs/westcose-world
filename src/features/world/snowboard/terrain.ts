/** The world as the snowboard feels it: the same analytic surface that renders the
 * terrain and carries the walker, the run/snowfield surface kinds, and the shared
 * mountain obstacle list (trees, rocks, lift pylons) as upright cylinders. */
import { Vector3 } from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL, mapCoordinates, mapDirection } from '../data/world-map';
import { groundSurfaceAt } from '../data/town-surfaces';
import { MOUNTAIN_LAYOUT, mountainFinishAreaAt, mountainSnowAt } from '../data/mountain-layout';
import { onGroomedRun } from '../data/ski-runs';
import { SKI_OBSTACLES, obstaclesNear, type SkiObstacle } from '../data/ski-obstacles';
import type { ObstacleHit, SurfaceSampler } from './physics';
import type { SnowSurface } from './tuning';

const plateau = MOUNTAIN_LAYOUT.summitPlateau;
/** The level start shelf is groomed like the runs that leave it. */
function onStartPlateau(x: number, z: number) {
  const k = (MAP_RADIUS + plateau.height) / MAP_RADIUS;
  return Math.abs(x - plateau.x) * k <= plateau.width / 2 && Math.abs(z - plateau.z) * Math.cos(plateau.x / MAP_RADIUS) * k <= plateau.depth / 2;
}

export function snowSurfaceAt(x: number, z: number, height = groundSurfaceAt(x, z).height): SnowSurface {
  if (height < MAP_SEA_LEVEL) return 'water';
  if (onGroomedRun(x, z) || mountainFinishAreaAt(x, z) || onStartPlateau(x, z)) return 'groomed';
  return mountainSnowAt(x, z) ? 'powder' : 'offpiste';
}

const AXES = new Map<SkiObstacle, Vector3>(SKI_OBSTACLES.map(obstacle => [obstacle, mapDirection(obstacle.x, obstacle.z)]));
const offset = new Vector3(), up = new Vector3();
const hit: ObstacleHit = { id: '', normal: new Vector3(), depth: 0 };

export const WORLD_SNOW: SurfaceSampler = {
  height(direction) {
    const { x, z } = mapCoordinates(direction);
    return groundSurfaceAt(x, z).height;
  },
  kind(direction) {
    const { x, z } = mapCoordinates(direction);
    return snowSurfaceAt(x, z);
  },
  obstacle(position, radius) {
    const { x, z } = mapCoordinates(position);
    const r = position.length();
    up.copy(position).divideScalar(r);
    let found: ObstacleHit | null = null;
    for (const obstacle of obstaclesNear(x, z)) {
      const above = r - (MAP_RADIUS + obstacle.ground);
      if (above > obstacle.height || above < -1) continue;
      // Tangent offset from the obstacle's upright axis at the rider's radius.
      offset.copy(position).addScaledVector(AXES.get(obstacle)!, -r);
      offset.addScaledVector(up, -offset.dot(up));
      const distance = offset.length(), depth = obstacle.radius + radius - distance;
      if (depth <= 0 || (found && depth <= found.depth)) continue;
      if (distance > 1e-6) hit.normal.copy(offset).divideScalar(distance); else hit.normal.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
      hit.id = obstacle.id; hit.depth = depth; found = hit;
    }
    return found;
  },
};
