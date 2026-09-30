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
  const landmarks = require(path.join(output, 'data/concept-landmarks.js'));
  const peninsula = require(path.join(output, 'data/peninsula-layout.js'));
  const cave = require(path.join(output, 'data/peninsula-cave.js'));
  const surfaces = require(path.join(output, 'data/town-surfaces.js'));
  const { makeTerrain, makeTerrainPartition } = require(path.join(output, 'scene/TownLandscape.js'));
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
    for (const x of [-40, -18, 0, 18, 40]) for (const z of [map.MAP_MIN_Z + .5, pierTip[1], pier.PIER_LAYOUT.entrance[1], -16, 8, 56.55, 115, 130, summitChart[1], map.MAP_SEAM - .5]) {
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

  await test('the default load point is the dry courtyard and the 40m summit checkpoint remains valid', () => {
    const courtyard = town.TOWN_AREAS.find(area => area.id === 'courtyard');
    const coordinates = map.mapCoordinates(runtimeTypes.DEFAULT_SPAWN);
    assert.ok(Math.abs(coordinates.x - courtyard.center[0]) < courtyard.width / 2 - 1);
    assert.ok(Math.abs(coordinates.z - courtyard.center[1]) < courtyard.depth / 2 - 1);
    assert.notEqual(collision.supportAt(runtimeTypes.DEFAULT_SPAWN).kind, 'water');
    assert.equal(collision.buildingContact(runtimeTypes.DEFAULT_SPAWN), null);
    const summit = map.mapDirection(...summitChart);
    const position = summit.clone().multiplyScalar(collision.supportRadius(summit) + runtimeTypes.PLAYER_CENTER_HEIGHT);
    close(collision.supportRadius(summit), planet.RADIUS + 40, 1e-8);
    close(position.length(), planet.RADIUS + 40 + runtimeTypes.PLAYER_CENTER_HEIGHT, 1e-8);
    assert.ok(pointDistance(session.getSafePosition(position), position) < 1e-8, 'The 40m summit must fit the valid checkpoint envelope');
  });

  await test('the real mountain rear is visible across ocean from the pier follow camera', () => {
    const frame = map.mapFrame(...pierTip, pier.PIER_LAYOUT.elevation);
    const forward = frame.north.clone().negate();
    const right = new Vector3().crossVectors(forward, frame.up).normalize();
    const target = frame.position.clone().addScaledVector(frame.up, runtimeTypes.PLAYER_CENTER_HEIGHT + .55).addScaledVector(right, .55);
    const cameraDirection = forward.clone().multiplyScalar(-runtimeTypes.CAMERA_FOLLOW_DISTANCE).addScaledVector(frame.up, 3).normalize();
    const camera = target.addScaledVector(cameraDirection, runtimeTypes.CAMERA_FOLLOW_DISTANCE);
    const peakUp = map.mapDirection(...summitChart);
    const peak = peakUp.clone().multiplyScalar(planet.RADIUS + planet.terrainHeightAt(peakUp));
    const oceanAngle = frame.up.angleTo(peakUp) * 180 / Math.PI;
    const inlandDistance = summitChart[1] - pierTip[1];
    assert.ok(oceanAngle > 0 && oceanAngle < 90, 'A true wrap leaves a short ocean seam toward the same mountain');
    assert.ok(inlandDistance > Math.PI * planet.RADIUS, 'The inland route reaches the summit around the long side of the globe');
    close(oceanAngle + inlandDistance / map.MAP_RADIUS * 180 / Math.PI, 360, 1e-8,
      'The mountain across the sea is exactly the same geographic summit, not a proxy');
    const line = peak.clone().sub(camera), nearestT = Math.max(0, Math.min(1, -camera.dot(line) / line.lengthSq()));
    const closest = camera.clone().addScaledVector(line, nearestT).length();
    assert.ok(closest > planet.RADIUS + planet.SEA_LEVEL + 2, 'The camera-to-summit ray must clear the solid ocean sphere');
    let minimumTerrainClearance = Infinity;
    for (let index = 1; index < 500; index++) {
      const sample = camera.clone().lerp(peak, index / 500);
      const radius = sample.length();
      const clearance = radius - planet.RADIUS - planet.terrainHeightAt(sample.clone().normalize());
      minimumTerrainClearance = Math.min(minimumTerrainClearance, clearance);
    }
    assert.ok(minimumTerrainClearance > 0, `Mountain back must not obscure its summit; minimum ray clearance ${minimumTerrainClearance}`);
  });

  await test('mountain v3 retains its 40m same-mountain envelope, separated runs, and longer pier', () => {
    close(map.MAP_RADIUS, 36);
    close(map.MAP_SUMMIT.height, 40);
    close(mountain.MOUNTAIN_LAYOUT.summit.height, 40);
    close(mountain.MOUNTAIN_LAYOUT.summit.x, map.MAP_SUMMIT.x);
    close(mountain.MOUNTAIN_LAYOUT.summit.z, map.MAP_SUMMIT.z);
    close(surfaces.naturalTerrainAt(...summitChart), map.MAP_SUMMIT.height, 1e-8);
    close(map.MAP_MAX_HEIGHT, 42);
    assert.ok(map.MAP_MAX_HEIGHT >= map.MAP_SUMMIT.height + runtimeTypes.PLAYER_CENTER_HEIGHT);
    assert.ok(surfaces.naturalTerrainAt(-14, 132) >= 31.5, 'The western shoulder is real terrain, not a painted snow patch');
    assert.ok(surfaces.naturalTerrainAt(16, 137) >= 33, 'The eastern shoulder has a distinct higher profile');
    close(map.MAP_SEAM, 176); close(map.MAP_MIN_Z, map.MAP_SEAM - 2 * Math.PI * map.MAP_RADIUS);
    close(pierTip[1], -47); close(pier.PIER_LAYOUT.entrance[1], -30);
    close(pier.PIER_LAYOUT.head.center[1], -43); close(pier.PIER_LAYOUT.head.depth, 8);
    assert.ok(pierTip[1] > map.MAP_MIN_Z + 3, 'The longer head remains clear of the chart cut');
    for (const x of [-12, 12]) {
      assert.ok(surfaces.naturalTerrainAt(x, -29) > map.MAP_SEA_LEVEL, 'The beach extends well beyond the boardwalk');
      assert.ok(surfaces.naturalTerrainAt(x, -39) < map.MAP_SEA_LEVEL, 'The open ocean remains beyond the wider beach');
    }
    assert.ok(surfaces.naturalTerrainAt(0, -30) > map.MAP_SEA_LEVEL, 'The beach beneath the pier entrance remains dry');
    for (const x of [-30, 30]) assert.ok(surfaces.naturalTerrainAt(x, 40) > map.MAP_SEA_LEVEL, 'Wide mainland remains continuous beside the inland route');
    assert.deepEqual(mountain.MOUNTAIN_RUNS.map(run => run.id), ['ski-central', 'ski-west', 'ski-east']);
    assert.equal(mountain.MOUNTAIN_RUNS.length, 3);
    for (const run of mountain.MOUNTAIN_RUNS) {
      const route = town.TOWN_ROUTES.find(item => item.id === run.id);
      assert.ok(route, `${run.id} is an authored physical route`);
      assert.deepEqual(route.points, run.points.map(point => [point[0], point[1]]), `${run.id} uses the exact approved sampled curve`);
      assert.ok(run.points.length > run.controls.length, `${run.id} is a sampled smooth curve, not its sparse control polygon`);
      close(run.points[0][1], 148); close(run.points.at(-1)[1], 64);
      assert.ok(run.points.every(point => point.every(Number.isFinite)), `${run.id} samples remain finite`);
      assert.ok(!route.points.some(point => point[0] === map.MAP_SUMMIT.x && point[1] === map.MAP_SUMMIT.z),
        `${run.id} begins at its own gate rather than collapsing into the summit`);
      const gate = town.TOWN_ROUTES.find(item => item.id === `${run.id}-gate`);
      const finishReturn = town.TOWN_ROUTES.find(item => item.id === `${run.id}-return`);
      assert.deepEqual(gate?.points.at(-1), [run.points[0][0], 148], `${run.id} gate connector reaches the approved start`);
      assert.deepEqual(finishReturn?.points[0], [run.points.at(-1)[0], 64], `${run.id} run-out starts at its approved finish`);
    }
    assert.deepEqual(town.TOWN_ROUTES.find(item => item.id === 'ski-summit-walk')?.points, [[0, 153], [0, 151]],
      'The summit walk bridges the peak to the three independent gate connectors');
    assert.deepEqual(town.TOWN_ROUTES.find(item => item.id === 'finish-return')?.points[0], [2.1, 61],
      'The common return begins below the separate run-outs');
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

  await test('rendered terrain has outward faces, finite normals and a complete periodic seam', () => {
    const geometry = makeTerrain(), overviewGeometry = makeTerrain(126);
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
        if (normal.lengthSq() < 1e-12) continue; // coincident vertices at map poles
        assert.ok(normal.dot(a) > 0, `Triangle ${index / 3} faces inward and would expose the ocean through land`);
        tested++;
      }
      assert.ok(tested > 100_000, 'Check the actual complete globe terrain, not a small proxy');
      let maximumRadius = 0;
      const peak = new Vector3(), seam = new Map();
      for (let index = 0; index < positions.count; index++) {
        a.fromBufferAttribute(positions, index);
        if (a.length() > maximumRadius) { maximumRadius = a.length(); peak.copy(a); }
        const chart = map.mapCoordinates(a);
        if (Math.abs(chart.x) < 50 && (Math.abs(chart.z - map.MAP_MIN_Z) < .001 || Math.abs(chart.z - map.MAP_SEAM) < .001)) {
          const key = chart.x.toFixed(3), points = seam.get(key) ?? [];
          points.push(a.clone()); seam.set(key, points);
        }
      }
      const peakChart = map.mapCoordinates(peak);
      let overviewMaximumRadius = 0;
      const overviewPeak = new Vector3();
      const overviewPositions = overviewGeometry.getAttribute('position');
      for (let index = 0; index < overviewPositions.count; index++) {
        a.fromBufferAttribute(overviewPositions, index);
        if (a.length() > overviewMaximumRadius) {
          overviewMaximumRadius = a.length();
          overviewPeak.copy(a);
        }
      }
      // The analytic summit is at z153; the two periodic render grids have a
      // crest row at z152.662 instead. A 0.2m allowance is the measured,
      // bounded rasterization error at this sharp small summit, not a height
      // clamp: exact terrain remains 40m and each mesh peak matches the
      // surface sampled at its own vertex.
      const MESH_SUMMIT_SAMPLE_ALLOWANCE = .2;
      const minimumSampledSummitRadius = planet.RADIUS + map.MAP_SUMMIT.height - MESH_SUMMIT_SAMPLE_ALLOWANCE;
      const overviewPeakChart = map.mapCoordinates(overviewPeak);
      assert.ok(maximumRadius >= minimumSampledSummitRadius,
        `Full terrain samples the approved 40m mountain within ${MESH_SUMMIT_SAMPLE_ALLOWANCE}m (observed ${(maximumRadius - planet.RADIUS).toFixed(4)}m at ${peakChart.x.toFixed(3)}, ${peakChart.z.toFixed(3)})`);
      assert.ok(overviewMaximumRadius >= minimumSampledSummitRadius,
        `Overview terrain samples the approved 40m mountain within ${MESH_SUMMIT_SAMPLE_ALLOWANCE}m (observed ${(overviewMaximumRadius - planet.RADIUS).toFixed(4)}m at ${overviewPeakChart.x.toFixed(3)}, ${overviewPeakChart.z.toFixed(3)})`);
      close(maximumRadius, planet.RADIUS + surfaces.groundSurfaceAt(peakChart.x, peakChart.z).height, 1e-4,
        'The full terrain peak is the actual sampled terrain, not an independently clipped proxy');
      close(overviewMaximumRadius, planet.RADIUS + surfaces.groundSurfaceAt(overviewPeakChart.x, overviewPeakChart.z).height, 1e-4,
        'The overview terrain peak is the actual sampled terrain, not an independently clipped proxy');
      assert.ok(geometry.boundingSphere.center.distanceTo(peak) <= geometry.boundingSphere.radius + 1e-4,
        'The computed bounding sphere includes the mountain even when its center is offset');
      assert.ok(seam.size > 150, 'The complete latitude width reaches the periodic chart cut');
      for (const pair of seam.values()) {
        assert.equal(pair.length, 2, 'Both copies of the chart seam must exist');
        assert.ok(pair[0].distanceTo(pair[1]) < 1e-4, 'Periodic render vertices meet without a crack');
      }
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

  await test('mountain v3 moves every approved run and its summit/base connectors in both directions', () => {
    const runIds = mountain.MOUNTAIN_RUNS.map(run => run.id);
    const connectorIds = [
      'resort-trail', 'resort-approach', 'lodge-walk', 'ticket-walk', 'finish-return', 'ski-summit-walk',
      ...runIds.flatMap(id => [`${id}-gate`, `${id}-return`]),
      ...runIds,
    ];
    assert.equal(new Set(connectorIds).size, connectorIds.length, 'The approved route matrix must not accidentally duplicate a connector');
    for (const id of connectorIds) {
      const route = town.TOWN_ROUTES.find(candidate => candidate.id === id);
      assert.ok(route, `Mountain v3 route ${id} is present in the live layout`);
      for (const reverse of [false, true]) {
        const result = walkAuthoredRoute(route, reverse, `mountain ${id}`);
        assert.ok(result.distance > .2, `${id} has physical length in both directions`);
        assert.equal(result.blocked, 0, `${id} remains an unobstructed walking centerline`);
      }
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
      const origin = frame.up.clone().multiplyScalar(37.3).addScaledVector(right, .55);
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

  await test('skate bowl and quarter pipe are traversable changes in the actual ground', () => {
    const metric = map.mapMetric(landmarks.SKATE_CENTER[0], landmarks.SKATE_ELEVATION);
    const point = (x, z) => map.mapDirection(landmarks.SKATE_CENTER[0] + x / metric.x, landmarks.SKATE_CENTER[1] + z / metric.z);
    const height = (x, z) => collision.supportRadius(point(x, z)) - planet.RADIUS;
    assert.ok(height(-1, -4) - height(-1, 0) > .5, 'Bowl center is below its entry rim');
    assert.ok(height(5.2, 0) - height(2.8, 0) > .7, 'Quarter pipe must rise above the park floor');
    for (const path of [[[-1, -4], [-1, 0], [-1, -4]], [[2.8, 0], [5.2, 0], [2.8, 0]]]) {
      let up = point(...path[0]);
      for (const target of path.slice(1)) {
        const walked = walkTo(up, point(...target), 'skate ramp');
        assert.equal(walked.blocked, 0, 'Both climbing and descending the skate terrain remain walkable');
        assert.ok(!walked.supportKinds.has('water')); up = walked.up;
      }
    }
  });

  await test('visible skate stairs have twelve discrete supported treads across their width', () => {
    const stairs = landmarks.SKATE_STAIRS;
    assert.equal(stairs.count, 12); close(stairs.rise, .19);
    for (let step = 0; step < stairs.count; step++) {
      const along = (step + .5) / stairs.count * landmarks.SKATE_STAIR_LENGTH;
      const height = stairs.baseHeight + step * stairs.rise;
      for (const lateral of [-1.1, 0, 1.1]) {
        const point = landmarks.skateStairPointAt(along, lateral, height);
        const chart = map.mapCoordinates(point);
        const surface = landmarks.skateStairSurfaceAt(chart.x, chart.z);
        assert.ok(surface, `Tread ${step} at offset ${lateral} has shared support`);
        assert.equal(surface.step, step);
        close(surface.height, height, 1e-8);
        close(collision.supportRadius(point), map.MAP_RADIUS + height, 1e-8);
      }
    }
    for (let step = 1; step <= stairs.count; step++) {
      const boundary = step / stairs.count * landmarks.SKATE_STAIR_LENGTH;
      const pointBefore = landmarks.skateStairPointAt(boundary - .002, 0, stairs.baseHeight);
      const pointAfter = landmarks.skateStairPointAt(Math.min(boundary + .002, landmarks.SKATE_STAIR_LENGTH), 0, stairs.baseHeight);
      close(collision.supportRadius(pointAfter) - collision.supportRadius(pointBefore), stairs.rise, 1e-8,
        `Riser ${step} is a discrete support change, not a smoothed ramp`);
    }
  });

  await test('all five real doorways allow entry and exit while their walls stay solid', () => {
    assert.equal(town.TOWN_INTERIORS.length, 5);
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
