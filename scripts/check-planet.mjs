import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repository, '.next');
mkdirSync(artifactRoot, { recursive: true });
const output = mkdtempSync(path.join(artifactRoot, 'planet-check-'));

try {
  // Compile the actual application modules into an isolated, disposable directory.
  // This does not depend on Next being built/running, or a global TypeScript runtime.
  const modules = ['data', 'runtime'].flatMap(directory => readdirSync(path.join(repository, 'src/features/world', directory))
    .filter(file => file.endsWith('.ts')).map(file => `${directory}/${file}`)).concat('scene/TownLandscape.tsx');
  for (const relative of modules) {
    const source = path.join(repository, 'src/features/world', relative);
    const result = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    const errors = result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
    assert.equal(errors.length, 0, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
    const target = path.join(output, relative.replace(/\.tsx?$/, '.js'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, result.outputText);
  }
  const require = createRequire(import.meta.url);
  const planet = require(path.join(output, 'data/planet.js'));
  const collision = require(path.join(output, 'runtime/planet-collision.js'));
  const session = require(path.join(output, 'runtime/session.js'));
  const runtimeTypes = require(path.join(output, 'runtime/types.js'));
  const town = require(path.join(output, 'data/town-layout.js'));
  const shapes = require(path.join(output, 'data/building-shapes.js'));
  const pier = require(path.join(output, 'data/pier-layout.js'));
  const map = require(path.join(output, 'data/world-map.js'));
  const mountain = require(path.join(output, 'data/mountain-layout.js'));
  const skiRuns = require(path.join(output, 'data/ski-runs.js'));
  const landmarks = require(path.join(output, 'data/concept-landmarks.js'));
  const downtown = require(path.join(output, 'data/downtown-layout.js'));
  const skatepark = require(path.join(output, 'data/skatepark-layout.js'));
  const peninsula = require(path.join(output, 'data/peninsula-layout.js'));
  const cave = require(path.join(output, 'data/peninsula-cave.js'));
  const surfaces = require(path.join(output, 'data/town-surfaces.js'));
  const { makeTerrain, makeTerrainPartition, TERRAIN_REGIONS } = require(path.join(output, 'scene/TownLandscape.js'));
  const { Vector3 } = require('three');
  const summitChart = [map.MAP_SUMMIT.x, map.MAP_SUMMIT.z];
  const pierTip = [pier.PIER_LAYOUT.entrance[0], pier.PIER_LAYOUT.head.center[1] - pier.PIER_LAYOUT.head.depth / 2];
  const openSeaX = Math.PI * map.MAP_RADIUS * .45;

  function baseSummitOcclusion() {
    const base = mountain.MOUNTAIN_LAYOUT.resort;
    const baseUp = map.mapDirection(base.x, base.z);
    const baseEye = baseUp.clone().multiplyScalar(collision.supportRadius(baseUp) + runtimeTypes.PLAYER_CENTER_HEIGHT + .55);
    const peakUp = map.mapDirection(...summitChart);
    const peak = peakUp.clone().multiplyScalar(collision.supportRadius(peakUp));
    const line = peak.clone().sub(baseEye);
    const nearestT = Math.max(0, Math.min(1, -baseEye.dot(line) / line.lengthSq()));
    return {
      base,
      angularDistance: baseUp.angleTo(peakUp),
      nearestRadius: baseEye.clone().addScaledVector(line, nearestT).length(),
      peakRadius: peak.length(),
    };
  }
  if (process.env.WORLD_DIAGNOSE_VIEWS) console.log('BASE_SUMMIT_OCCLUSION', JSON.stringify(baseSummitOcclusion()));

  function close(actual, expected, tolerance = 1e-9, message = 'Values must agree within floating-point tolerance') {
    assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);
  }
  function pointDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
  }

  /** The browser registers these exact detailed portal triangles after terrain creation. */
  function detailedPortalTriangles(geometry) {
    const positions = geometry.getAttribute('position'), indices = geometry.getIndex(), triangles = [];
    if (!indices) return triangles;
    for (let index = 0; index < indices.count; index += 3) {
      triangles.push([0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, indices.getX(index + offset))));
    }
    return triangles;
  }
  function walk(lon, lat, facing, steps, metres = 4.8 / 60) {
    return walkFrame(planet.frameAt(lon, lat), facing, steps, metres);
  }
  function walkFrame(frame, facing, steps, metres = 4.8 / 60) {
    let up = frame.up;
    const forward = typeof facing === 'string'
      ? (facing === 'south' ? frame.north.clone().negate() : frame[facing].clone())
      : facing(frame);
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    let distance = 0;
    let maxHeight = -Infinity;
    let blocked = 0;
    let highestAbsoluteY = Math.abs(up.y);
    for (let step = 0; step < steps; step++) {
      const before = up;
      const movement = collision.moveOnSurface(up, forward, metres);
      assert.ok(Number.isFinite(movement.up.x + movement.up.y + movement.up.z), 'Position must remain finite');
      close(movement.up.length(), 1);
      assert.ok(before.distanceTo(movement.up) <= metres / planet.RADIUS + 1e-8, 'A step must never teleport across the sphere');
      forward.applyQuaternion(movement.rotation).normalize();
      up = movement.up;
      close(forward.dot(up), 0, 1e-9, 'Forward must stay tangent, including at the poles');
      distance += movement.distance;
      maxHeight = Math.max(maxHeight, collision.supportRadius(up) - planet.RADIUS);
      highestAbsoluteY = Math.max(highestAbsoluteY, Math.abs(up.y));
      blocked += Number(movement.blocked);
    }
    return { up, forward, distance, maxHeight, blocked, highestAbsoluteY, coordinates: planet.coordinatesAt(up) };
  }

  await test('parallel transport returns position and heading after a complete great circle', () => {
    const start = planet.frameAt(0.82, 0);
    let up = start.up.clone();
    let forward = start.east.clone();
    for (let step = 0; step < 6000; step++) {
      const moved = collision.advanceOnSphere(up, forward, 2 * Math.PI * planet.RADIUS / 6000);
      up = moved.up;
      forward = moved.forward;
      close(up.length(), 1);
      close(forward.dot(up), 0);
    }
    assert.ok(up.distanceTo(start.up) < 1e-10);
    assert.ok(forward.distanceTo(start.east) < 1e-10);
  });

  await test('open ocean walking crosses the map seam without teleporting', () => {
    const startZ = map.MAP_SEAM - 3;
    // Offset from the centreline: the longer fishing head now occupies the old
    // x=0 ocean test corridor immediately after the seam.
    const result = walkFrame(map.mapFrame(10, startZ), 'north', 120);
    assert.equal(result.blocked, 0);
    close(result.distance, 9.6, 1e-8);
    assert.ok(map.mapCoordinates(result.up).z < map.MAP_MIN_Z + 14, 'Visitor must emerge past the ocean chart cut');
    assert.equal(collision.supportAt(result.up).kind, 'water');
  });

  await test('map projection round trips the inhabited wrap and preserves building front orientation', () => {
    const circumference = 2 * Math.PI * planet.RADIUS;
    for (const x of [-40, -18, 0, 18, 40]) for (const z of [map.MAP_MIN_Z + .5, pierTip[1], pier.PIER_LAYOUT.entrance[1], -16, 8, Math.PI / 2 * map.MAP_RADIUS, 115, 130, summitChart[1], map.MAP_SEAM - .5]) {
      const direction = map.mapDirection(x, z);
      const chart = map.mapCoordinates(direction);
      close(chart.x, x, 1e-8); close(chart.z, z, 1e-8);
      assert.ok(direction.distanceTo(map.mapDirection(x, z + circumference)) < 1e-10);
      const frame = map.mapFrame(x, z);
      close(frame.east.dot(frame.up), 0); close(frame.north.dot(frame.up), 0);
      close(frame.east.dot(frame.north), 0);
      assert.ok(new Vector3(0, 0, 1).applyQuaternion(frame.quaternion).distanceTo(frame.north.clone().negate()) < 1e-10,
        'Local +Z remains map south / building front throughout the wrap');
      const geographic = planet.coordinatesAt(direction);
      assert.ok(planet.directionAt(geographic.lon, geographic.lat).distanceTo(direction) < 1e-9,
        'The geographic runtime API must retain its original meaning');
    }
  });

  await test('parallel transport crosses both geographic poles in the rotated map', () => {
    for (const poleZ of [Math.PI * planet.RADIUS / 2, Math.PI * planet.RADIUS * 1.5]) {
      let up = map.mapDirection(0, poleZ - 4);
      let forward = map.mapFrame(0, poleZ - 4).north;
      let maximumY = 0;
      for (let step = 0; step < 160; step++) {
        const moved = collision.advanceOnSphere(up, forward, .05);
        up = moved.up; forward = moved.forward;
        assert.ok(Number.isFinite(up.x + up.y + up.z + forward.x + forward.y + forward.z));
        close(up.dot(forward), 0, 1e-9);
        maximumY = Math.max(maximumY, Math.abs(up.y));
      }
      assert.ok(maximumY > .999999);
      close(map.mapCoordinates(up).z, poleZ + 4, 1e-8);
    }
    for (const y of [-1, 1]) {
      const exactPole = { x: 0, y, z: 0 };
      assert.ok(Number.isFinite(planet.heightAt(exactPole)));
      assert.ok(Number.isFinite(collision.supportRadius(exactPole)));
      const nearHeights = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2].map(lon =>
        planet.heightAt(planet.directionAt(lon, y * (Math.PI / 2 - 1e-8))));
      assert.ok(Math.max(...nearHeights) - Math.min(...nearHeights) < .001, 'Geographic pole terrain cannot have a longitude discontinuity');
    }
  });

  await test('building walls stop forward motion while oblique contact can slide', () => {
    // Use a known six-metre facade. The narrow skate shop reaches its corner
    // before the original slide-distance assertion has a full wall to follow.
    const solid = town.TOWN_BUILDINGS.find(building => building.id === 'town-corner');
    const fixture = planet.coordinatesAt(shapes.buildingDoorPoint(solid, 1.5));
    const frame = shapes.buildingFrame(solid);
    const inward = new Vector3(0, 0, -1).applyQuaternion(frame.quaternion);
    const sideways = new Vector3(1, 0, 0).applyQuaternion(frame.quaternion);
    const wall = walk(fixture.lon, fixture.lat, () => inward.clone(), 150);
    assert.ok(wall.blocked > 100);
    assert.ok(wall.distance < 2.5);
    const foot = wall.up.clone().multiplyScalar(collision.supportRadius(wall.up) + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.equal(collision.buildingContact(foot), null, 'Stopped visitor must remain outside the wall');
    const sliding = walk(fixture.lon, fixture.lat, () => inward.clone().add(sideways).normalize(), 150);
    assert.ok(sliding.blocked > 0, 'Route must exercise contact');
    assert.ok(sliding.distance > wall.distance + 2, `Sliding must preserve movement along the wall: ${JSON.stringify({building:solid.id,wallDistance:wall.distance,slidingDistance:sliding.distance,blocked:sliding.blocked,end:map.mapCoordinates(sliding.up)})}`);
    const slidingFoot = sliding.up.clone().multiplyScalar(collision.supportRadius(sliding.up) + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.equal(collision.buildingContact(slidingFoot), null);
  });

  await test('camera rays shorten behind a building and remain open along the street', () => {
    const studio = town.TOWN_INTERIORS.find(building => building.id === 'studio');
    const frame = shapes.buildingFrame(studio);
    const origin = shapes.buildingLocalPoint(studio, [0, 1.4, 0]);
    const side = new (require('three').Vector3)(1, 0, 0).applyQuaternion(frame.quaternion);
    const available = collision.cameraClearDistance(origin, side, 6.7);
    assert.ok(available >= 0.7 && available < studio.width / 2);
    const street = map.mapFrame(openSeaX, 0, planet.SEA_LEVEL);
    const streetOrigin = street.position.clone().addScaledVector(street.up, 1.4);
    const streetRay = street.east.clone().negate().addScaledVector(street.up, 0.5).normalize();
    close(collision.cameraClearDistance(streetOrigin, streetRay, 6.7), 6.7);
  });

  await test('open water has a sea-level support surface below the land', () => {
    const sea = map.mapDirection(openSeaX, 0);
    assert.equal(planet.waterAt(sea), true);
    assert.ok(planet.heightAt(sea) < planet.SEA_LEVEL);
    close(collision.supportRadius(sea), planet.RADIUS + planet.SEA_LEVEL);
    const oceanWalk = walkFrame(map.mapFrame(openSeaX, 0), 'south', 100);
    assert.equal(oceanWalk.blocked, 0);
    close(oceanWalk.maxHeight, planet.SEA_LEVEL);
  });

  await test('invalid or obstructed save positions return to the safe entry', () => {
    for (const invalid of [{ x: 0, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }]) {
      assert.deepEqual(session.getSafePosition(invalid), runtimeTypes.DEFAULT_SPAWN);
    }
    const solid = town.TOWN_BUILDINGS.find(building => !building.interior && !building.secondary);
    assert.deepEqual(session.getSafePosition(shapes.buildingLocalPoint(solid, [0, runtimeTypes.PLAYER_CENTER_HEIGHT, 0])), runtimeTypes.DEFAULT_SPAWN);
  });

  await test('the default load point is the dry courtyard and the summit checkpoint remains valid', () => {
    const [x0, x1, z0, z1] = downtown.DOWNTOWN_WALKS.find(walk => walk.id === 'courtyard').rect;
    const coordinates = map.mapCoordinates(runtimeTypes.DEFAULT_SPAWN);
    assert.ok(coordinates.x > x0 + 1 && coordinates.x < x1 - 1);
    assert.ok(coordinates.z > z0 + 1 && coordinates.z < z1 - 1);
    assert.notEqual(collision.supportAt(runtimeTypes.DEFAULT_SPAWN).kind, 'water');
    assert.equal(collision.buildingContact(runtimeTypes.DEFAULT_SPAWN), null);
    const summit = map.mapDirection(...summitChart);
    const position = summit.clone().multiplyScalar(collision.supportRadius(summit) + runtimeTypes.PLAYER_CENTER_HEIGHT);
    close(collision.supportRadius(summit), planet.RADIUS + map.MAP_SUMMIT.height, 1e-8);
    close(position.length(), planet.RADIUS + map.MAP_SUMMIT.height + runtimeTypes.PLAYER_CENTER_HEIGHT, 1e-8);
    assert.ok(pointDistance(session.getSafePosition(position), position) < 1e-8, 'The summit must fit the valid checkpoint envelope');
  });

  await test('the pier looks out over open ocean: the whole mountain is hidden by the planet', () => {
    const frame = map.mapFrame(...pierTip, pier.PIER_LAYOUT.elevation);
    const forward = frame.north.clone().negate();
    const right = new Vector3().crossVectors(forward, frame.up).normalize();
    const target = frame.position.clone().addScaledVector(frame.up, runtimeTypes.PLAYER_CENTER_HEIGHT + .55).addScaledVector(right, .55);
    const cameraDirection = forward.clone().multiplyScalar(-runtimeTypes.CAMERA_FOLLOW_DISTANCE).addScaledVector(frame.up, 3).normalize();
    const camera = target.addScaledVector(cameraDirection, runtimeTypes.CAMERA_FOLLOW_DISTANCE);
    // Every high point of the massif, including the summit and its rear slope, sits
    // below the pier camera's horizon: the direct sightline passes through the globe.
    let sampled = 0;
    for (let z = 150; z <= 300; z += 6) for (let x = -80; x <= 80; x += 8) {
      const up = map.mapDirection(x, z), height = planet.terrainHeightAt(up);
      if (height < 6) continue;
      sampled++;
      const peak = up.clone().multiplyScalar(planet.RADIUS + height);
      const line = peak.clone().sub(camera), nearestT = Math.max(0, Math.min(1, -camera.dot(line) / line.lengthSq()));
      const closest = camera.clone().addScaledVector(line, nearestT).length();
      assert.ok(closest < planet.RADIUS + planet.SEA_LEVEL, `Mountain point (${x}, ${z}, ${height.toFixed(1)}m) must be hidden from the pier`);
    }
    assert.ok(sampled > 200, 'The check covers the real massif, not a few points');
    // Looking seaward the camera sees only open water to its horizon.
    for (let distance = 4; distance <= 60; distance += 4) {
      const z = map.canonicalMapZ(pierTip[1] - distance);
      assert.ok(surfaces.groundSurfaceAt(0, z).height < planet.SEA_LEVEL, `Open ocean ${distance}m beyond the pier head`);
    }
  });

  await test('mountain v4 is a 78m snowboard mountain on the radius-72 globe, with the pier unchanged', () => {
    close(map.MAP_RADIUS, 72);
    close(map.MAP_SUMMIT.height, 78);
    close(mountain.MOUNTAIN_LAYOUT.summit.x, map.MAP_SUMMIT.x);
    close(mountain.MOUNTAIN_LAYOUT.summit.z, map.MAP_SUMMIT.z);
    close(surfaces.naturalTerrainAt(...summitChart), map.MAP_SUMMIT.height, 1e-8);
    assert.ok(map.MAP_MAX_HEIGHT >= map.MAP_SUMMIT.height + runtimeTypes.PLAYER_CENTER_HEIGHT);
    // The seam lies in open water between the new rear shore and the pier.
    close(map.MAP_MIN_Z, map.MAP_SEAM - 2 * Math.PI * map.MAP_RADIUS);
    for (const x of [-40, 0, 40]) {
      assert.ok(surfaces.groundSurfaceAt(x, map.MAP_SEAM - 1).height < map.MAP_SEA_LEVEL, 'Seam side A is open ocean');
      assert.ok(surfaces.groundSurfaceAt(x, map.MAP_MIN_Z + 1).height < map.MAP_SEA_LEVEL, 'Seam side B is open ocean');
    }
    close(pierTip[1], -47); close(pier.PIER_LAYOUT.entrance[1], -30);
    close(pier.PIER_LAYOUT.head.center[1], -43); close(pier.PIER_LAYOUT.head.depth, 8);
    assert.ok(pierTip[1] > map.MAP_MIN_Z + 3, 'The longer head remains clear of the chart cut');
    for (const x of [-12, 12]) {
      assert.ok(surfaces.naturalTerrainAt(x, -29) > map.MAP_SEA_LEVEL, 'The beach extends well beyond the boardwalk');
      assert.ok(surfaces.naturalTerrainAt(x, -39) < map.MAP_SEA_LEVEL, 'The open ocean remains beyond the wider beach');
    }
    assert.ok(surfaces.naturalTerrainAt(0, -30) > map.MAP_SEA_LEVEL, 'The beach beneath the pier entrance remains dry');
    for (const x of [-30, 30]) assert.ok(surfaces.naturalTerrainAt(x, 40) > map.MAP_SEA_LEVEL, 'Wide mainland remains continuous beside the inland route');
    // The resort keeps its rev-3 chart anchors and level foundations.
    for (const area of [mountain.MOUNTAIN_LAYOUT.lodge, mountain.MOUNTAIN_LAYOUT.ticketHut, mountain.MOUNTAIN_LAYOUT.pedestrianArrival]) close(surfaces.naturalTerrainAt(area.x, area.z), 2.8, 1e-8);
    close(surfaces.naturalTerrainAt(mountain.MOUNTAIN_LAYOUT.summitPlateau.x, mountain.MOUNTAIN_LAYOUT.summitPlateau.z), mountain.MOUNTAIN_LAYOUT.summitPlateau.height, 1e-8);
    // Four rated runs; none is a walking route any more.
    assert.deepEqual(skiRuns.SKI_RUNS.map(run => [run.id, run.difficulty]), [
      ['sunday-cruise', 'green'], ['lighthouse-line', 'blue'], ['timber-chute', 'black'], ['dead-coast-couloir', 'double-black'],
    ]);
    assert.ok(!town.TOWN_ROUTES.some(route => route.id.startsWith('ski-')), 'Snow runs are carved terrain, not town routes');
    for (const run of skiRuns.SKI_RUNS) {
      const first = run.samples[0], last = run.samples.at(-1), finish = mountain.MOUNTAIN_FINISH_AREAS[run.finish];
      close(first.h, surfaces.naturalTerrainAt(first.x, first.z), .05);
      assert.ok(Math.abs(first.h - mountain.MOUNTAIN_LAYOUT.summitPlateau.height) < 1.2, `${run.id} starts on the summit plateau`);
      close(last.h, finish.height, .05);
      assert.ok(run.length > 180 && run.length < 460, `${run.id} length ${run.length}`);
      const [low, high] = run.grade;
      for (let i = 1; i < run.samples.length; i++) {
        const a = run.samples[i - 1], b = run.samples[i];
        const grade = Math.atan2(a.h - b.h, b.s - a.s) * 180 / Math.PI;
        assert.ok(grade >= low - .05 && grade <= high + .05, `${run.id} stays inside its ${low}-${high} degree band (${grade.toFixed(2)} at ${i})`);
      }
    }
  });

  await test('the base resort correctly cannot see the summit through the solid tiny planet', () => {
    const result = baseSummitOcclusion();
    close(result.base.z, 53.7);
    assert.ok(result.angularDistance > Math.PI / 2, `Base and summit must occupy opposite sides of the globe: ${JSON.stringify(result)}`);
    assert.ok(result.nearestRadius < planet.RADIUS + planet.SEA_LEVEL,
      `The direct base-to-summit sightline must be occluded by the solid globe: ${JSON.stringify(result)}`);
    close(result.peakRadius, planet.RADIUS + map.MAP_SUMMIT.height, 1e-8);
  });

  await test('the unchanged lighthouse stands at the outer tip above the tunnel, with a clear upper route destination', () => {
    assert.deepEqual(landmarks.LIGHTHOUSE, peninsula.PENINSULA_LIGHTHOUSE);
    close(landmarks.LIGHTHOUSE.height, 12); close(landmarks.LIGHTHOUSE.elevation, 6.2);
    const { x, z, elevation, height } = landmarks.LIGHTHOUSE;
    close(surfaces.groundSurfaceAt(x, z).height, elevation, 1e-8);
    assert.ok(cave.caveDistanceAt(x,z)<1, 'The actual passage passes underneath the lighthouse footprint');
    close(collision.supportRadius(map.mapDirection(x,z),{layer:'tunnel'}),planet.RADIUS+landmarks.CAVE_FLOOR);
    const frame = map.mapFrame(x, z, elevation);
    const tower = landmarks.landmarkSolids.filter(solid => solid.buildingId === 'lighthouse');
    assert.equal(tower.length, 6, 'The existing tower model retains its six shared render/collision pieces');
    assert.deepEqual(tower.find(solid => solid.id === 'lighthouse:foot').half.clone().multiplyScalar(2).toArray(), [4.2, .4, 4.2]);
    assert.deepEqual(tower.find(solid => solid.id === 'lighthouse:lower').half.clone().multiplyScalar(2).toArray(), [3.1, 4.6, 3.1]);
    const towerTop = Math.max(...tower.map(solid => solid.center.clone().sub(frame.position).dot(frame.up) + solid.half.y));
    assert.ok(towerTop > 10.8 && towerTop <= height, 'The upper lantern follows the taller silhouette');
    const destination = town.TOWN_ROUTES.find(route => route.id === 'lighthouse-trail').points.at(-1);
    const direction = map.mapDirection(...destination), position = direction.clone().multiplyScalar(collision.supportRadius(direction) + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.equal(collision.buildingContact(position), null, 'The upper trail ends beside the tower, not inside its foot');
    assert.notEqual(collision.supportAt(direction).kind, 'water');
  });

  await test('the hidden beach has a low continuous opening into the actual ocean', () => {
    const { x: startX, z } = peninsula.PENINSULA_COVE;
    assert.deepEqual(town.COASTAL_RADIO, { x: startX, z }, 'Discovery follows the real relocated cove');
    for (let x = startX; x <= startX + 10; x += .125) {
      const height = surfaces.groundSurfaceAt(x, z).height;
      assert.ok(height <= .2, `The cove outlet must not become a landlocked basin or a trail dam: x=${x}, height=${height}`);
    }
    assert.ok(surfaces.naturalTerrainAt(startX, z) > map.MAP_SEA_LEVEL, 'The inner cove remains a dry beach');
    assert.ok(surfaces.groundSurfaceAt(startX + 10, z).height < map.MAP_SEA_LEVEL, 'The opening reaches actual sea, not just a painted sand patch');
    assert.equal(planet.waterAt(map.mapDirection(startX + 10, z)), true);
  });

  await test('rendered terrain has outward faces, finite normals and covers every land point', () => {
    const geometry = makeTerrain(), overviewGeometry = makeTerrain('coarse');
    try {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.getIndex();
      assert.ok(positions.array.every(Number.isFinite));
      assert.ok(normals.array.every(Number.isFinite));
      assert.equal(positions.count, normals.count);
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3(), normal = new Vector3();
      let tested = 0;
      for (let index = 0; index < indices.count; index += 3) {
        a.fromBufferAttribute(positions, indices.getX(index)); b.fromBufferAttribute(positions, indices.getX(index + 1)); c.fromBufferAttribute(positions, indices.getX(index + 2));
        ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
        if (normal.lengthSq() < 1e-12) continue;
        assert.ok(normal.dot(a) > 0, `Triangle ${index / 3} faces inward and would expose the ocean through land`);
        tested++;
      }
      assert.ok(tested > 100_000, 'Check the actual land terrain, not a small proxy');
      let maximumRadius = 0;
      const peak = new Vector3();
      for (let index = 0; index < positions.count; index++) {
        a.fromBufferAttribute(positions, index);
        if (a.length() > maximumRadius) { maximumRadius = a.length(); peak.copy(a); }
      }
      const peakChart = map.mapCoordinates(peak);
      let overviewMaximumRadius = 0;
      const overviewPeak = new Vector3(), overviewPositions = overviewGeometry.getAttribute('position');
      for (let index = 0; index < overviewPositions.count; index++) {
        a.fromBufferAttribute(overviewPositions, index);
        if (a.length() > overviewMaximumRadius) { overviewMaximumRadius = a.length(); overviewPeak.copy(a); }
      }
      // The rounded summit falls between grid rows; this is bounded rasterization, not a clamp.
      const MESH_SUMMIT_SAMPLE_ALLOWANCE = .25;
      const minimumSampledSummitRadius = planet.RADIUS + map.MAP_SUMMIT.height - MESH_SUMMIT_SAMPLE_ALLOWANCE;
      const overviewPeakChart = map.mapCoordinates(overviewPeak);
      assert.ok(maximumRadius >= minimumSampledSummitRadius, `Full terrain samples the summit (observed ${(maximumRadius - planet.RADIUS).toFixed(4)}m)`);
      assert.ok(overviewMaximumRadius >= minimumSampledSummitRadius, `Overview terrain samples the summit (observed ${(overviewMaximumRadius - planet.RADIUS).toFixed(4)}m)`);
      close(maximumRadius, planet.RADIUS + surfaces.groundSurfaceAt(peakChart.x, peakChart.z).height, 1e-4,
        'The full terrain peak is the actual sampled terrain, not an independently clipped proxy');
      close(overviewMaximumRadius, planet.RADIUS + surfaces.groundSurfaceAt(overviewPeakChart.x, overviewPeakChart.z).height, 1e-4,
        'The overview terrain peak is the actual sampled terrain, not an independently clipped proxy');
      assert.ok(geometry.boundingSphere.center.distanceTo(peak) <= geometry.boundingSphere.radius + 1e-4,
        'The computed bounding sphere includes the mountain even when its center is offset');
      // Open ocean needs no terrain, but every land point must lie inside a rendered region.
      const inside = (x, z) => TERRAIN_REGIONS.some(region => x >= region.x0 && x <= region.x0 + region.columns * region.step && z >= region.z0 && z <= region.z0 + region.rows * region.step);
      let land = 0;
      for (let x = -110; x <= 110; x += 2) for (let z = map.MAP_MIN_Z; z < map.MAP_SEAM; z += 2) {
        if (surfaces.groundSurfaceAt(x, z).height <= map.MAP_SEA_LEVEL) continue;
        land++;
        assert.ok(inside(x, z), `Land at (${x}, ${z.toFixed(1)}) must be inside a terrain region`);
      }
      assert.ok(land > 5000, 'The coverage check samples the real island');
    } finally { geometry.dispose(); overviewGeometry.dispose(); }
  });

  function walkTo(up, target, label, maxSteps = 2500, hint = {}) {
    let blocked = 0;
    let distance = 0;
    let steps = 0;
    const supportKinds = new Set();
    let support = collision.supportAt(up, hint);
    while (up.angleTo(target) * planet.RADIUS > 0.035) {
      const tangent = target.clone().addScaledVector(up, -target.dot(up)).normalize();
      const amount = Math.min(0.06, up.angleTo(target) * planet.RADIUS);
      if (++steps > maxSteps) {
        const candidate = collision.advanceOnSphere(up, tangent, amount).up;
        const currentRadius = support.radius, candidateRadius = collision.supportRadius(candidate,{footRadius:support.radius,layer:support.layer});
        const center = candidate.clone().multiplyScalar(Math.max(currentRadius, candidateRadius) + runtimeTypes.PLAYER_CENTER_HEIGHT);
        assert.fail(`${label}: could not reach target; ${JSON.stringify({ remaining: up.angleTo(target) * planet.RADIUS, chart: map.mapCoordinates(up), target: map.mapCoordinates(target), height: currentRadius - planet.RADIUS, nextHeight: candidateRadius - planet.RADIUS, contact: collision.buildingContact(center)?.segmentId ?? null })}`);
      }
      const movement = collision.moveOnSurface(up, tangent, amount, support.radius, support.layer);
      blocked += Number(movement.blocked);
      distance += movement.distance;
      up = movement.up;
      support = movement.support;
      supportKinds.add(support.kind);
    }
    return { up, blocked, distance, supportKinds, footRadius:support.radius, layer:support.layer };
  }

  function walkAuthoredRoute(route, reverse, label = route.id) {
    const points = reverse ? [...route.points].reverse() : route.points;
    let up = map.mapDirection(...points[0]);
    let hint = route.id === 'cave' || (route.id === 'beach-east' && reverse) ? { layer:'tunnel' } : {};
    let distance = 0;
    let blocked = 0;
    const supportKinds = new Set();
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .5));
      for (let sample = 1; sample <= count; sample++) {
        // Routes use sufficiently dense sampled points that a short segment is
        // the actual approved curve, never a long great-circle shortcut.
        const t = sample / count;
        const target = map.mapDirection(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        const result = walkTo(up, target, `${label} ${reverse ? 'reverse' : 'forward'} segment ${index}`, 120, hint);
        assert.ok(result.blocked < 5, `${label} ${reverse ? 'reverse' : 'forward'} centerline should not require wall sliding`);
        assert.ok(!result.supportKinds.has('water'), `${label} must remain dry`);
        up = result.up;
        hint = { footRadius:result.footRadius, layer:result.layer };
        distance += result.distance;
        blocked += result.blocked;
        for (const kind of result.supportKinds) supportKinds.add(kind);
      }
    }
    return { up, distance, blocked, supportKinds };
  }

  await test('the resort connectors walk both ways and every snowboard run is dry, walkable snow', () => {
    for (const id of ['resort-trail', 'resort-approach', 'lodge-walk', 'ticket-walk', 'finish-return']) {
      const route = town.TOWN_ROUTES.find(candidate => candidate.id === id);
      assert.ok(route, `Resort route ${id} is present in the live layout`);
      for (const reverse of [false, true]) {
        const result = walkAuthoredRoute(route, reverse, `resort ${id}`);
        assert.ok(result.distance > .2, `${id} has physical length in both directions`);
        assert.equal(result.blocked, 0, `${id} remains an unobstructed walking centerline`);
      }
    }
    for (const run of skiRuns.SKI_RUNS) {
      // Walk down the carved centerline: the snow surface is continuous and never water.
      const route = { id: run.id, points: run.samples.filter((_, index) => index % 4 === 0).map(sample => [sample.x, sample.z]) };
      const result = walkAuthoredRoute(route, false, `run ${run.id}`);
      assert.ok(result.distance > run.length * .45, `${run.id} is walkable from gate to finish`);
      assert.equal(result.blocked, 0, `${run.id} has no walls or obstacles on its centerline`);
      assert.ok(!result.supportKinds.has('water'), `${run.id} stays dry`);
    }
  });

  await test('every authored route is physically connected in both walking directions', () => {
    const failures = [];
    for (const route of town.TOWN_ROUTES) {
      for (const reverse of [false, true]) {
        try {
          const result = walkAuthoredRoute(route, reverse);
          assert.ok(result.blocked < 5, `${route.id} ${reverse ? 'reverse' : 'forward'}: centerline should not require wall sliding`);
          assert.ok(!result.supportKinds.has('water'), `${route.id}: a walkable route must not require swimming`);
        } catch (error) { failures.push(error.message); }
      }
    }
    assert.deepEqual(failures, [], 'Every route and its reverse must remain reachable through actual controller steps');
  });

  await test('the lighthouse underpass has solid lining and a camera-safe roof beneath the cape', () => {
    assert.ok(cave.PENINSULA_CAVE_LENGTH > 12 && cave.PENINSULA_CAVE_LENGTH < 22, 'The short passage turns beneath the tower and reaches the rear cove');
    assert.equal(landmarks.landmarkSolids.filter(solid => solid.buildingId === 'cave-rock').length, 0,
      'The old rendered cave boxes and crown masses have been removed');
    const roofs = cave.peninsulaCaveWedges.filter(wedge => wedge.kind === 'roof');
    assert.ok(roofs.length >= 12, 'Both sloping roof faces continue through every short section');
    assert.equal(cave.peninsulaCaveColliders.length, cave.peninsulaCaveWedges.length);
    let checkedVertices = 0;
    for (const wedge of cave.peninsulaCaveWedges) {
      assert.equal(wedge.vertices.length, 8, 'Each stone piece is an actual closed wedge prism');
      const edges = new Map();
      for (const triangle of wedge.triangles) for (let index = 0; index < 3; index++) {
        const a = triangle[index], b = triangle[(index + 1) % 3];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      assert.ok([...edges.values()].every(count => count === 2), `${wedge.id} has no open mesh edges`);
      for (const vertex of wedge.vertices) {
        assert.ok(vertex.toArray().every(Number.isFinite));
        assert.ok(vertex.length() - planet.RADIUS <= 5.15, 'The tunnel lining stays buried below the5.2m cape');
        const box = wedge.collider, local = vertex.clone().sub(box.center).applyQuaternion(box.inverse);
        for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(local[axis]) <= box.half[axis] + 1e-8,
          `${wedge.id}: conservative camera collision encloses every rendered vertex`);
        checkedVertices++;
      }
    }
    assert.ok(checkedVertices >= 400, 'Validate the complete wedge kit, not a representative proxy');
    const middle = peninsula.PENINSULA_CAVE.points[1], first = peninsula.PENINSULA_CAVE.points[0], last = peninsula.PENINSULA_CAVE.points[2];
    const up = map.mapDirection(...middle);
    const forward = map.mapDirection(...last).sub(map.mapDirection(...first)).projectOnPlane(up).normalize();
    const across = forward.clone().cross(up).normalize();
    let direction = up.clone();
    let lower = collision.supportAt(direction,{layer:'tunnel'});
    close(lower.radius, planet.RADIUS + landmarks.CAVE_FLOOR, .04);
    const player = direction.clone().multiplyScalar(lower.radius + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.equal(collision.buildingContact(player), null, 'The passage center is open for the visitor');
    const cameraOrigin = direction.clone().multiplyScalar(lower.radius + 1.4);
    const roofDistance = collision.cameraClearDistance(cameraOrigin, up, 6);
    assert.ok(roofDistance > .7 && roofDistance < landmarks.CAVE_CLEARANCE - 1.1,
      `Camera ray must shorten before the pitched ceiling (distance ${roofDistance})`);
    let blocked = 0;
    for (let index = 0; index < 130; index++) {
      const tangent = across.clone().addScaledVector(direction, -across.dot(direction)).normalize();
      const moved = collision.moveOnSurface(direction, tangent, .06, lower.radius, lower.layer);
      direction = moved.up; lower=moved.support; blocked += Number(moved.blocked);
    }
    assert.ok(blocked > 60, 'The actual cave OBBs must prevent walking through the rock sides');
    const stopped = direction.clone().multiplyScalar(lower.radius + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.equal(collision.buildingContact(stopped), null, 'The stopped capsule stays outside the wall volume');
    const roofContact = collision.buildingContact(roofs[Math.floor(roofs.length / 2)].collider.center);
    assert.equal(roofContact?.id, 'cave-rock', 'The visible roof participates in the same collision set');
  });

  await test('exact rendered portal collars stop the camera after detailed terrain registers', () => {
    // The portal panels are generated from clipped terrain, so first make the
    // detailed partition exactly as TownLandscape does before querying camera
    // collision. This guards against a mesh-visible but camera-passable mouth.
    const terrain = makeTerrainPartition();
    const release = cave.registerCavePortalTriangles({}, detailedPortalTriangles(terrain.portal));
    try {
      const stats = cave.cavePortalCollisionStats();
      assert.equal(stats.registered, true);
      assert.ok(stats.triangles > 100, 'The detailed portal collar registry must contain the rendered mesh, not a proxy');
      const frame = map.mapFrame(27, -29);
      const forward = frame.east.clone().multiplyScalar(Math.cos(5 * Math.PI / 16)).addScaledVector(frame.north, Math.sin(5 * Math.PI / 16)).normalize();
      const right = forward.clone().cross(frame.up).normalize();
      const origin = frame.up.clone().multiplyScalar(planet.RADIUS + 1.3).addScaledVector(right, .55);
      const direction = forward.multiplyScalar(-4.8).addScaledVector(frame.up, 3).normalize();
      const clearance = collision.cameraClearDistance(origin, direction, 4.8, null, 'tunnel');
      assert.ok(clearance >= .7 && clearance < 2.2,
        `The exact portal collar must shorten its reproduced camera ray (received ${clearance})`);
    } finally {
      release();
      terrain.baseWorld.dispose(); terrain.localPatch.dispose(); terrain.portal.dispose();
    }
  });

  await test('the complete short cave width stays low and traversable beneath the lighthouse foundation', () => {
    const sections = [];
    const points = peninsula.PENINSULA_CAVE.points;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .12);
      for (let sample = 0; sample <= count; sample++) {
        const t = sample / count, up = map.mapDirection(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        const forward = map.mapDirection(...b).sub(map.mapDirection(...a)).projectOnPlane(up).normalize();
        sections.push({ up, across: forward.clone().cross(up).normalize() });
      }
    }
    let checked = 0, cameraRays = 0, clippedRays = 0;
    for (const lateral of [-1.5, 0, 1.5]) {
      const lane = sections.map(({ up, across }) => up.clone().multiplyScalar(map.MAP_RADIUS + landmarks.CAVE_FLOOR).addScaledVector(across, lateral).normalize());
      for (const direction of lane) {
        const chart = map.mapCoordinates(direction);
        close(landmarks.caveBlendAt(chart.x, chart.z), 1, 1e-8);
        const lower=collision.supportAt(direction,{layer:'tunnel'});
        close(lower.radius, planet.RADIUS + landmarks.CAVE_FLOOR, .04);
        assert.equal(collision.buildingContact(direction.clone().multiplyScalar(lower.radius + runtimeTypes.PLAYER_CENTER_HEIGHT)), null,
          `Clear full-width lane at ${chart.x},${chart.z}, lateral ${lateral}`);
        checked++;
      }
      for (const reverse of [false, true]) {
        const targets = reverse ? [...lane].reverse() : lane;
        let up = targets[0];
        for (const target of targets.slice(1)) {
          const result = walkTo(up, target, `cave offset${lateral} ${reverse ? 'reverse' : 'forward'}`, 120, {layer:'tunnel'});
          assert.equal(result.blocked, 0, 'Every full-width lane is reachable through actual controller steps');
          assert.ok(!result.supportKinds.has('water'), 'The cave is a dry passage in both directions');
          up = result.up;
        }
      }
    }
    for (const { up } of sections) {
      const chart = map.mapCoordinates(up), frame = map.mapFrame(chart.x, chart.z, landmarks.CAVE_FLOOR);
      for (const pitch of [.1, .375, 1.2]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const origin = frame.position.clone().addScaledVector(frame.up, 1.4);
        const ray = frame.east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.north, Math.sin(angle)).addScaledVector(frame.up, pitch).normalize();
        const distance = collision.cameraClearDistance(origin, ray, 4.8), position = origin.clone().addScaledVector(ray, distance);
        cameraRays++; clippedRays += Number(distance < 4.8);
        for (const box of cave.peninsulaCaveColliders) {
          const local = position.clone().sub(box.center).applyQuaternion(box.inverse);
          assert.ok(Math.abs(local.x) >= box.half.x || Math.abs(local.y) >= box.half.y || Math.abs(local.z) >= box.half.z,
            `The actual camera endpoint stays outside${box.id}`);
        }
      }
    }
    assert.ok(checked >= 180, 'Densely sample both edges and center over the whole short passage');
    assert.ok(cameraRays >= 2500 && clippedRays > 1000, 'Exercise overhead and side-wall camera collision throughout the cave');
    const beneath=map.mapDirection(landmarks.LIGHTHOUSE.x,landmarks.LIGHTHOUSE.z);
    close(collision.supportRadius(beneath,{layer:'tunnel'}),planet.RADIUS+landmarks.CAVE_FLOOR,1e-8);
    close(collision.supportRadius(beneath),planet.RADIUS+landmarks.LIGHTHOUSE.elevation,1e-8,
      'The same map coordinate has a real upper terrace as well as the lower tunnel');
  });

  await test('skate park bowls, snake, halfpipe and quarter are real ground a visitor can cross', () => {
    const point = (u, v) => skatepark.parkDirection(u, v);
    const height = (u, v) => collision.supportRadius(point(u, v)) - planet.RADIUS - skatepark.SKATEPARK.deck;
    for (const pool of skatepark.PARK_POOLS) close(height(...pool.center), -skatepark.transitionDepth(pool.transition), 1e-6, `${pool.name} floor sits its full depth below the deck`);
    close(height((skatepark.PARK_HALFPIPE.u0 + skatepark.HALFPIPE_COPING[0]) / 2, 20), skatepark.HALFPIPE_HEIGHT, 1e-6, 'The halfpipe decks stand its full height up');
    close(height(-10.8, 20), 0, 1e-6, 'The halfpipe flat bottom is the park deck');
    close(height(4.5, skatepark.QUARTER_TOP + .5), skatepark.QUARTER_HEIGHT, 1e-6, 'The quarter pipe deck stands its full height up');
    assert.ok(height(-15.6, -22.6) < height(12, -21.3) - 2, 'The snake run deepens toward its pocket');
    // A visitor walks into every bowl and scrambles back out over the vert, crosses the
    // snake, and uses the halfpipe's open end, its stairs, the five-stair and the quarter.
    for (const [label, from, to] of [
      ['Deep End north', [-9.45, -2.5], [-9.45, -10.4]], ['Deep End west', [-19.5, -10.4], [-9.45, -10.4]],
      ['Clover Bowl', [-6, 5.17], [-14, 5.17]], ['snake crossing', [0, -16.8], [0, -25.9]], ['snake pocket', [-15.6, -18], [-15.6, -22.6]],
      ['halfpipe flat', [-10.8, 12], [-10.8, 20]], ['halfpipe stairs', [-2.5, 15.6], [-2.5, 23]],
      ['five-stair', [14, -9], [14, -13]], ['north quarter', [4.5, 20], [4.5, 26]],
    ]) {
      const there = walkTo(point(...from), point(...to), `skate park ${label}`), back = walkTo(there.up, point(...from), `skate park ${label} back`);
      assert.equal(there.blocked + back.blocked, 0, `${label}: both directions remain walkable`);
      assert.ok(!there.supportKinds.has('water') && !back.supportKinds.has('water'));
    }
  });

  await test('the grand stairs, five-stair and halfpipe stairs have discrete supported treads across their width', () => {
    const deck = skatepark.SKATEPARK.deck, g = skatepark.GRAND_STAIRS;
    for (let step = 1; step <= g.count; step++) for (const z of [-2.4, -1.2, 1.2, 2.4]) {
      const x = g.foot - (step - .5) * skatepark.GRAND_STAIR_TREAD, surface = skatepark.grandStairSurfaceAt(x, z);
      assert.equal(surface.step, step);
      close(collision.supportRadius(map.mapDirection(x, z)), map.MAP_RADIUS + g.base + step * g.rise, 1e-8, `Grand stair tread ${step} at z ${z}`);
    }
    const five = skatepark.PARK_STAIRS, treads = five.steps - 1;
    for (let k = 0; k < treads; k++) for (const u of [five.u0 + .3, (five.u0 + five.u1) / 2 + .6, five.u1 - .3]) {
      const v = five.top + (k + .5) * (five.bottom - five.top) / treads;
      close(collision.supportRadius(skatepark.parkDirection(u, v)) - map.MAP_RADIUS - deck, five.height * (1 - (k + 1) / five.steps), 1e-8, `Five-stair tread ${k} at u ${u}`);
    }
    const climb = skatepark.HALFPIPE_STAIRS;
    for (let k = 0; k < climb.steps; k++) for (const u of [climb.u0 + .3, (climb.u0 + climb.u1) / 2, climb.u1 - .3]) {
      const v = climb.foot + (k + .5) * (climb.top - climb.foot) / climb.steps;
      close(collision.supportRadius(skatepark.parkDirection(u, v)) - map.MAP_RADIUS - deck, (k + 1) * skatepark.HALFPIPE_HEIGHT / climb.steps, 1e-8, `Halfpipe stair tread ${k} at u ${u}`);
    }
  });

  await test('all six real doorways allow entry and exit while their walls stay solid', () => {
    assert.equal(town.TOWN_INTERIORS.length, 6);
    for (const building of town.TOWN_INTERIORS) {
      const outside = shapes.buildingDoorPoint(building, 1.9).normalize();
      const center = shapes.buildingLocalPoint(building, [building.entryOffset, 0, 0]).normalize();
      const entered = walkTo(outside, center, `${building.id} entry`);
      assert.equal(entered.blocked, 0, `${building.id} doorway must be wide enough for the capsule`);
      const position = entered.up.clone().multiplyScalar(collision.supportRadius(entered.up) + runtimeTypes.PLAYER_CENTER_HEIGHT);
      assert.equal(collision.activeInteriorAt(position), building.interior);
      assert.equal(collision.buildingContact(position), null, `${building.id} center must remain usable`);
      const exited = walkTo(entered.up, outside, `${building.id} exit`);
      assert.equal(exited.blocked, 0);
      assert.equal(collision.activeInteriorAt(exited.up.clone().multiplyScalar(collision.supportRadius(exited.up) + runtimeTypes.PLAYER_CENTER_HEIGHT)), null);

      const wallPoint = shapes.buildingLocalPoint(building, [building.width / 2, 0.85, 0]);
      assert.equal(collision.buildingContact(wallPoint)?.id, building.id, `${building.id} side wall remains solid`);
      const floorRadius = shapes.buildingFloorRadius(building, center);
      close(collision.supportRadius(center), floorRadius, 1e-9, `${building.id} support matches the rendered tangent floor`);
    }
  });

  await test('the raised pier stays dry from the beach ramp to its constant-width fishing head', () => {
    const layout=pier.PIER_LAYOUT;
    const ocean=pier.pierPointAt(0,layout.head.center[1]).normalize();
    assert.ok(planet.terrainHeightAt(ocean)<planet.SEA_LEVEL,'The fishing head must have ocean beneath it');
    close(collision.supportRadius(ocean),planet.RADIUS+layout.elevation);
    for(const z of [layout.approach.start[1]-.5,layout.entrance[1],(layout.entrance[1]+layout.neckEnd[1])/2,layout.neckEnd[1]+.5,layout.head.center[1],layout.head.center[1]-layout.head.depth/2+.4]){
      const width=pier.pierWidthAtZ(z);
      const left=pier.pierPointAt(-width/2,z),right=pier.pierPointAt(width/2,z);
      assert.ok(left.distanceTo(right)>width*.97,'Physical pier width must not shrink with latitude');
      for(const side of [-1,1]){
        const chart=pier.pierChartAt(side*(width/2-.45),z),up=map.mapDirection(chart.x,z);
        close(pier.pierAcrossAt(chart.x,z),side*(width/2-.45));
        assert.equal(collision.supportAt(up).kind,'pier','Both walkable deck edges remain dry');
        close(collision.supportRadius(up),pier.pierPointAt(side*(width/2-.45),z).length());
        assert.equal(pier.pierSurfaceAt(pier.pierChartAt(side*(width/2+.05),z).x,z),null);
      }
    }
    let up=pier.pierPointAt(0,layout.approach.start[1]+.3).normalize();
    const points=[layout.approach.start[1],layout.entrance[1],layout.neckEnd[1],layout.head.center[1]-1.8];
    for(const z of [...points,...points.slice(0,-1).reverse(),layout.approach.start[1]+.3]){
      const result=walkTo(up,pier.pierPointAt(0,z).normalize(),'pier centreline');
      assert.equal(result.blocked,0,'The entire pier and ramp must work in both directions');
      assert.ok(!result.supportKinds.has('water'),'The pier never switches the visitor into swimming');up=result.up;
    }
    const arcade=town.TOWN_BUILDINGS.find(building=>building.id==='arcade');
    assert.equal(pier.pierSurfaceAt(arcade.x,arcade.z),null,'The arcade belongs on land, outside the fishing pier');
  });

  await test('pier guardrails stop exits across both sides, head shoulders and the seaward edge', () => {
    const headStart = pier.PIER_LAYOUT.head.center[1] + pier.PIER_LAYOUT.head.depth / 2;
    for (const id of ['west-shoulder', 'east-shoulder']) {
      const shoulder = pier.PIER_EDGES.find(edge => edge.id === id);
      close(shoulder.start[1], headStart); close(shoulder.end[1], headStart);
    }
    for (const id of ['west-head', 'east-head']) close(pier.PIER_EDGES.find(edge => edge.id === id).start[1], headStart);
    for(const edge of pier.PIER_EDGES){
      const u=(edge.start[0]+edge.end[0])/2,z=(edge.start[1]+edge.end[1])/2;
      const horizontal=Math.abs(edge.end[0]-edge.start[0])>Math.abs(edge.end[1]-edge.start[1]);
      const shoulder=edge.id.includes('shoulder');
      const inside=horizontal?[u,z+(shoulder?-.9:.9)]:[u-Math.sign(u)*.9,z];
      const outside=horizontal?[u,z+(shoulder?.9:-.9)]:[u+Math.sign(u)*.9,z];
      let up=pier.pierPointAt(...inside).normalize(),blocked=0;
      const target=pier.pierPointAt(...outside).normalize();
      for(let step=0;step<100;step++){
        const tangent=target.clone().addScaledVector(up,-target.dot(up)).normalize();
        const movement=collision.moveOnSurface(up,tangent,.06);up=movement.up;blocked+=Number(movement.blocked);
      }
      assert.ok(blocked>50,`${edge.id} must physically stop the visitor`);
      assert.equal(collision.supportAt(up).kind,'pier',`${edge.id} must retain dry support`);
      const position=up.clone().multiplyScalar(collision.supportRadius(up)+runtimeTypes.PLAYER_CENTER_HEIGHT);
      assert.equal(collision.buildingContact(position),null,'The stopped visitor remains outside the rail volume');
    }
  });

  await test('the pier entrance remains open to the promenade and the fishing head has a dry walking loop', () => {
    const layout=pier.PIER_LAYOUT,entrance=layout.approach.start[1];
    let up=pier.pierPointAt(-3,entrance).normalize();
    const crossing=walkTo(up,pier.pierPointAt(3,entrance).normalize(),'pier promenade crossing');
    assert.equal(crossing.blocked,0,'The land entrance must not close the east/west promenade');
    assert.ok(!crossing.supportKinds.has('water'));
    const front=layout.neckEnd[1]-.95,back=layout.head.center[1]-layout.head.depth/2+1.1,side=layout.head.width/2-1.05;
    up=pier.pierPointAt(0,front).normalize();
    for(const [u,z] of [[-side,front],[-side,back],[side,back],[side,front],[0,front]]){
      const result=walkTo(up,pier.pierPointAt(u,z).normalize(),'fishing head loop');
      assert.equal(result.blocked,0);assert.deepEqual([...result.supportKinds],['pier']);up=result.up;
    }
  });

  await test('v2 sessions restore land and ocean positions and reject malformed records', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const store = new Map();
    const storage = {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key),
    };
    Object.defineProperty(globalThis, 'window', { value: { localStorage: storage }, configurable: true });
    try {
      assert.equal(session.readSession(), null);
      const runtime = runtimeTypes.createRuntimeState();
      assert.equal(session.saveSession(runtime), true);
      const saved = session.readSession();
      assert.ok(saved);
      assert.equal(saved.version, 2);
      assert.ok(pointDistance(saved.position, runtime.position) < 1e-10);
      assert.ok(pointDistance(saved.forward, runtime.forward) < 1e-10);
      for (const invalid of [
        { ...saved, forward: { x: 1e308, y: 1e308, z: 1e308 } },
        { ...saved, forward: { x: 0, y: 0, z: 0 } },
        { ...saved, longitude: saved.longitude + Math.PI },
        { ...saved, latitude: Math.PI },
        { ...saved, position: { x: 0, y: 0, z: 0 } },
        { ...saved, version: 1 },
        { ...saved, layoutVersion: -1 },
      ]) {
        store.set(session.SESSION_KEY, JSON.stringify(invalid));
        assert.equal(session.readSession(), null);
      }
      store.set(session.SESSION_KEY, 'corrupt JSON');
      assert.equal(session.readSession(), null);
      const sea = map.mapDirection(openSeaX, 0);
      runtime.position = sea.clone().multiplyScalar(collision.supportRadius(sea) + runtimeTypes.PLAYER_CENTER_HEIGHT);
      runtime.forward = map.mapFrame(44, 0).east;
      assert.equal(session.saveSession(runtime), true);
      assert.ok(pointDistance(session.readSession().position, runtime.position) < 1e-10);
      for (const building of town.TOWN_INTERIORS) {
        const up = shapes.buildingLocalPoint(building, [0, 0, 0]).normalize();
        runtime.position = up.clone().multiplyScalar(collision.supportRadius(up) + runtimeTypes.PLAYER_CENTER_HEIGHT);
        runtime.forward = planet.frameAt(building.lon, building.lat).east;
        assert.equal(session.saveSession(runtime), true);
        const restored = session.readSession();
        assert.ok(restored, `${building.id} checkpoint must restore`);
        assert.ok(pointDistance(restored.position, runtime.position) < 1e-10, `${building.id} keeps its exact floor checkpoint`);
        assert.equal(collision.activeInteriorAt(restored.position), building.interior);
      }
      session.clearSession();
      assert.equal(session.readSession(), null);
      storage.getItem = () => { throw new Error('Storage blocked'); };
      storage.setItem = () => { throw new Error('Storage blocked'); };
      storage.removeItem = () => { throw new Error('Storage blocked'); };
      assert.equal(session.readSession(), null);
      assert.equal(session.saveSession(runtime), false);
      assert.doesNotThrow(() => session.clearSession());
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
} finally {
  // Only remove this run's verified direct child of the repository's generated directory.
  const resolvedOutput = path.resolve(output);
  if (path.dirname(resolvedOutput) !== artifactRoot || !path.basename(resolvedOutput).startsWith('planet-check-')) {
    throw new Error('Unexpected test artifact path; refusing recursive cleanup');
  }
  rmSync(resolvedOutput, { recursive: true, force: true });
}
