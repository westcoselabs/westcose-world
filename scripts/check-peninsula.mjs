import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd(), world = path.join(repository, 'src/features/world');
const destination = path.join(repository, 'docs/qa/peninsula-underpass');
const immutableDirectory = path.join(repository, 'docs/qa/peninsula-rebuild');
const artifactRoot = path.join(repository, '.next');
mkdirSync(destination, { recursive: true }); mkdirSync(artifactRoot, { recursive: true });
const revision = 3;
const baselinePath = path.join(destination, 'preservation-baseline-v3.json');
const baselineMode = false;
if(process.argv.includes('--baseline')||process.argv.includes('--rescope'))throw new Error('Never recapture the mutated world as a baseline. Use --derive-v3 to filter immutable v2 evidence.');
const searchMode = process.argv.includes('--search-sightlines');
const currentSightlineMode = process.argv.includes('--current-sightlines');
if (searchMode || process.argv.includes('--sightlines')) throw new Error('Lighthouse placement is fixed by the corrected reference topology. Historical city-frustum anchor searches are retained only in peninsula-rebuild; use --current-sightlines for observation, never relocation acceptance.');
const coveMode = process.argv.includes('--cove-grid');
const continuityMode = process.argv.includes('--local-continuity');
const sightlineMode = process.argv.includes('--sightlines') || searchMode || currentSightlineMode;
const sha = value => createHash('sha256').update(value).digest('hex');
const filesBelow = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const protectedTerrain = (x, z) => !((x >= 15 && z >= -47 && z < -18) || (x > 24 && z >= -18 && z <= 30));
const fragments = source => ({
  mountainInfrastructure: source.slice(source.indexOf('  // Static lift infrastructure:'), source.indexOf('  // Blank art and graffiti walls')),
  forest: source.slice(source.indexOf('  // Sparse procedural forest'), source.indexOf('  return { structure:')),
  stairs: source.slice(source.indexOf('function addStairs('), source.indexOf('function buildLandmarks(')),
});

if(process.argv.includes('--derive-v3')){
  assert.ok(!existsSync(baselinePath),'Immutable v3 already exists; refusing to overwrite it');
  const sourcePath=path.join(immutableDirectory,'preservation-baseline-v2.json');
  const originalBytes=readFileSync(sourcePath),original=JSON.parse(originalBytes);
  const samples=original.samples.filter(([x,z])=>protectedTerrain(x,z));
  const removed=original.samples.filter(([x,z])=>!protectedTerrain(x,z));
  assert.ok(removed.every(([x,z])=>x>=15&&z>=-47&&z< -43),'Only the explicitly authorized southern fringe may leave preservation');
  const scope={...original.scope,mutableZone:'(x >= 15 and -47 <= z < -18) OR (x > 24 and -18 <= z <= 30); all x <=24 at z >=-18 remain protected',
    changeFromV2:'Only x>=15, -47<=z<-43 added for removing the old detached southern headland fringe. Town, boardwalk, pier, mountain and all other protected regions unchanged.'};
  const baseline={revision,derivedAt:new Date().toISOString(),source:path.relative(repository,sourcePath).replaceAll('\\','/'),sourceSha256:sha(originalBytes),
    method:'Filter the immutable v2 sample rows; never sample current/mutated terrain. Protected snapshot carried forward without modification.',scope,snapshot:original.snapshot,samples};
  assert.equal(sha(JSON.stringify(baseline.snapshot)),sha(JSON.stringify(original.snapshot)),'Protected snapshot must remain byte-equivalent when serialized');
  writeFileSync(baselinePath,JSON.stringify(baseline)+'\n');
  writeFileSync(path.join(destination,'preservation-scope.json'),JSON.stringify({revision,source:baseline.source,sourceSha256:baseline.sourceSha256,originalSampleCount:original.samples.length,protectedSampleCount:samples.length,removedSampleCount:removed.length,snapshotSha256:sha(JSON.stringify(baseline.snapshot)),...scope},null,2)+'\n');
  console.log(JSON.stringify({baseline:baselinePath,originalSampleCount:original.samples.length,protectedSampleCount:samples.length,removedSampleCount:removed.length,snapshotUnchanged:true}));
  process.exit(0);
}
const temporary = mkdtempSync(path.join(artifactRoot, 'peninsula-check-'));

try {
  for (const directory of ['data', 'runtime']) for (const name of readdirSync(path.join(world, directory)).filter(name => name.endsWith('.ts'))) {
    const source = path.join(world, directory, name);
    const savedSource = path.join(immutableDirectory, 'baseline-v2-' + name + '.txt');
    const input = sightlineMode && !currentSightlineMode && directory === 'data' && existsSync(savedSource) ? savedSource : source;
    const result = ts.transpileModule(readFileSync(input, 'utf8'), { fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    mkdirSync(path.join(temporary, directory), { recursive: true });
    writeFileSync(path.join(temporary, directory, name.replace(/\.ts$/, '.js')), result.outputText);
  }
  const require = createRequire(path.join(repository, 'package.json'));
  const town = require(path.join(temporary, 'data/town-layout.js'));
  const terrain = require(path.join(temporary, 'data/town-surfaces.js'));
  const landmarks = require(path.join(temporary, 'data/concept-landmarks.js'));
  const map = require(path.join(temporary, 'data/world-map.js'));
  const planet = require(path.join(temporary, 'data/planet.js'));
  if (continuityMode) {
    const samples=[],step=.001;
    const compare=(x,z,axis)=>{
      const before=terrain.groundSurfaceAt(x-(axis==='x'?step:0),z-(axis==='z'?step:0)).height;
      const after=terrain.groundSurfaceAt(x+(axis==='x'?step:0),z+(axis==='z'?step:0)).height;
      samples.push({x,z,axis,before,after,jump:Math.abs(after-before)});
    };
    for(let z=-18;z<=30+.0001;z+=.05)compare(24,Math.round(z*100)/100,'x');
    for(let x=15;x<=24+.0001;x+=.05)compare(Math.round(x*100)/100,-18,'z');
    for(let z=-47;z<-18;z+=.05)compare(15,Math.round(z*100)/100,'x');
    for(let x=15;x<=56.5+.0001;x+=.05)compare(Math.round(x*100)/100,-47,'z');
    for(let x=24.05;x<=56.5+.0001;x+=.05)compare(Math.round(x*100)/100,30,'z');
    const failures=samples.filter(sample=>sample.jump>.08);
    const report={checkedAt:new Date().toISOString(),passed:failures.length===0,method:'Entire editable-polygon boundary sampled every.05 chart metres, comparing final ground at±.001 across the boundary; normal gradients permitted, steps above.08m reported.',sampleCount:samples.length,maximumJump:Math.max(...samples.map(sample=>sample.jump)),failures};
    writeFileSync(path.join(destination,'boundary-continuity.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,failures:failures.slice(0,25)},null,2));
    if(!report.passed)process.exitCode=1;
  } else if (coveMode) {
    const collision = require(path.join(temporary, 'runtime/planet-collision.js'));
    const types = require(path.join(temporary, 'runtime/types.js'));
    const results = [];
    const cove=town.COASTAL_RADIO;
    for (let x = cove.x-3; x <= cove.x+3; x += .5) for (let z = cove.z-5; z <= cove.z+5; z += .5) {
      const up = map.mapDirection(x,z), height = collision.supportRadius(up) - map.MAP_RADIUS;
      const frame = map.mapFrame(x,z,height), center = frame.position.clone().addScaledVector(up,types.PLAYER_CENTER_HEIGHT);
      const contact = collision.buildingContact(center);
      const cameras = {};
      for (const [heading,forward] of [['east',frame.east],['west',frame.east.clone().negate()],['north',frame.north],['south',frame.north.clone().negate()]]) {
        const right=forward.clone().cross(up).normalize();
        const target=frame.position.clone().addScaledVector(up,types.PLAYER_CENTER_HEIGHT+.55).addScaledVector(right,.55);
        const direction=forward.clone().multiplyScalar(-types.CAMERA_FOLLOW_DISTANCE).addScaledVector(up,3).normalize();
        cameras[heading]=collision.cameraClearDistance(target,direction,types.CAMERA_FOLLOW_DISTANCE,null);
      }
      results.push({x,z,height,groundHeight:terrain.groundSurfaceAt(x,z).height,support:collision.supportAt(up).kind,contact:contact?.id||null,cameras,minimumCamera:Math.min(...Object.values(cameras))});
    }
    const viable = results.filter(row=>row.support!=='water'&&row.height<=.3&&!row.contact&&row.cameras.east>=2.6).sort((a,b)=>b.minimumCamera-a.minimumCamera||b.cameras.east-a.cameras.east);
    const current=results.find(row=>row.x===town.COASTAL_RADIO.x&&row.z===town.COASTAL_RADIO.z);
    const acceptance={point:town.COASTAL_RADIO,minimumCameraDistance:2.6,passed:Boolean(current&&current.support!=='water'&&current.height<=.3&&!current.contact&&current.minimumCamera>=2.6),evidence:current};
    const report={generatedAt:new Date().toISOString(),method:'Current ordinary third-person camera, no framing changes: height3, shoulder.55, distance4.8. Data-centered grid covers x±3,z±5 around the fixed cove exploration point. The2.6m minimum matches focused traversal QA; this diagnostic does not choose lighthouse or cave placement.',results,viable,acceptance};
    writeFileSync(path.join(destination,'cove-camera-grid.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({viableCount:viable.length,best:viable.slice(0,15)},null,2));
    if(!acceptance.passed)process.exitCode=1;
  } else if (sightlineMode) {
    const collision = require(path.join(temporary, 'runtime/planet-collision.js'));
    const types = require(path.join(temporary, 'runtime/types.js'));
    const shapes = require(path.join(temporary, 'data/building-shapes.js'));
    const { Vector3, PerspectiveCamera } = require('three');
    const buildingBoxes = town.TOWN_BUILDINGS.flatMap(building => {
      const frame = shapes.buildingFrame(building);
      return shapes.buildingWallSegments(building).map(segment => ({ id: building.id, segment: segment.id,
        center: new Vector3(...segment.center).applyQuaternion(frame.quaternion).add(frame.position),
        inverse: frame.inverse, half: new Vector3(...segment.size).multiplyScalar(.5) }));
    });
    function boxHit(origin, target, box) {
      const point = origin.clone().sub(box.center).applyQuaternion(box.inverse), delta = target.clone().sub(origin).applyQuaternion(box.inverse);
      let near = 0, far = 1;
      for (const axis of ['x', 'y', 'z']) {
        if (Math.abs(delta[axis]) < 1e-10) { if (Math.abs(point[axis]) > box.half[axis]) return false; continue; }
        const a = (-box.half[axis] - point[axis]) / delta[axis], b = (box.half[axis] - point[axis]) / delta[axis];
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
      return far > 0 && near < 1;
    }
    const results = [];
    const candidates = searchMode ? Array.from({ length: 8 }, (_, i) => Array.from({ length: 15 }, (_, j) => ({ x: 24 + i, z: -20 - j, elevation: 2.8, height: 12 }))).flat()
      : currentSightlineMode ? [landmarks.LIGHTHOUSE] : [{ x: 27, z: -22, elevation: 2.8, height: 12 }, { x: 29, z: -23, elevation: 2.8, height: 12 }];
    const sources = searchMode ? [{ id: 'courtyard', x: 0, z: 8 }, { id: 'courtyard-west', x: -4, z: 8 }, { id: 'courtyard-northwest', x: -4, z: 11 }, { id: 'courtyard-east', x: 4, z: 8 }, { id: 'courtyard-front', x: 0, z: 3 }, { id: 'courtyard-southwest', x: -4, z: 4 }, { id: 'courtyard-southeast', x: 4, z: 4 }, { id: 'boulevard-center', x: 0, z: 0 }, { id: 'main-street-waterfront', x: 0, z: -10 }, { id: 'boardwalk-center', x: 0, z: -16 }]
      : [{ id: 'courtyard', x: 0, z: 8 }, { id: 'boulevard-center', x: 0, z: 0 }, { id: 'main-street-waterfront', x: 0, z: -10 }, { id: 'boardwalk-west', x: -12, z: -16 }, { id: 'boardwalk-center', x: 0, z: -16 }, { id: 'boardwalk-east', x: 16, z: -16 }, { id: 'boardwalk-end', x: 23, z: -16 }];
    for (const candidate of candidates) {
      const towerFrame = map.mapFrame(candidate.x, candidate.z, candidate.elevation);
      for (const source of sources) {
        for (const heading of (searchMode ? ['turned-toward-tower'] : ['default-south', 'turned-toward-tower'])) {
          const up = map.mapDirection(source.x, source.z), frame = map.mapFrame(source.x, source.z, collision.supportRadius(up) - map.MAP_RADIUS);
          const forward = heading === 'default-south' ? frame.north.clone().negate() : towerFrame.position.clone().sub(frame.position).projectOnPlane(up).normalize();
          const right = forward.clone().cross(up).normalize();
          const look = frame.position.clone().addScaledVector(up, types.PLAYER_CENTER_HEIGHT + .55).addScaledVector(right, .55);
          const cameraDirection = forward.clone().multiplyScalar(-types.CAMERA_FOLLOW_DISTANCE).addScaledVector(up, 3).normalize();
          const cameraDistance = collision.cameraClearDistance(look, cameraDirection, types.CAMERA_FOLLOW_DISTANCE, null);
          const eye = look.clone().addScaledVector(cameraDirection, cameraDistance);
          const projections = {};
          for (const [profile, aspect] of [['desktop', 1440 / 900], ['phone', 390 / 844]]) {
            const camera = new PerspectiveCamera(52, aspect, .08, 550);
            camera.position.copy(eye); camera.up.copy(up); camera.lookAt(look.clone().addScaledVector(forward, 1.2)); camera.updateMatrixWorld();
            projections[profile] = Object.fromEntries([['base', 0], ['stripe', 6], ['lantern', 10.425], ['top', 12]].map(([name, height]) => {
              const point = towerFrame.position.clone().addScaledVector(towerFrame.up, height), ndc = point.clone().project(camera);
              return [name, { x: ndc.x, y: ndc.y, z: ndc.z, inFrustum: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1 }];
            }));
          }
          const rays = Object.fromEntries([['base', 0], ['stripe', 6], ['lantern', 10.425], ['top', 12]].map(([name, height]) => {
            const point = towerFrame.position.clone().addScaledVector(towerFrame.up, height);
            const buildingHits = [...new Set(buildingBoxes.filter(box => boxHit(eye, point, box)).map(box => box.id))];
            if (searchMode && (buildingHits.length || !projections.desktop[name].inFrustum || !projections.phone[name].inFrustum)) return [name, { protectedBuildingHits: buildingHits, skippedTerrain: 'Already blocked by a fixed building or outside unchanged-camera framing' }];
            let minimum = Infinity, protectedMinimum = Infinity, obstruction = null;
            for (let step = 1; step < 600; step++) {
              const sample = eye.clone().lerp(point, step / 600), chart = map.mapCoordinates(sample), ground = terrain.groundSurfaceAt(chart.x, chart.z).height;
              const clearance = sample.length() - map.MAP_RADIUS - Math.max(map.MAP_SEA_LEVEL, ground);
              if (clearance < minimum) { minimum = clearance; obstruction = { x: chart.x, z: chart.z, groundHeight: ground, rayHeight: sample.length() - map.MAP_RADIUS }; }
              if (protectedTerrain(chart.x, chart.z)) protectedMinimum = Math.min(protectedMinimum, clearance);
            }
            return [name, { baselineTerrainClearance: minimum, protectedTerrainClearance: Number.isFinite(protectedMinimum) ? protectedMinimum : null,
              minimumAt: obstruction, protectedBuildingHits: buildingHits }];
          }));
          results.push({ candidate, source, heading, cameraDistance, camera: eye, projections, rays });
        }
      }
    }
    const report = { generatedAt: new Date().toISOString(), baselineRevision: revision, method: 'Baseline third-person camera: actual support and camera collision, height3, shoulder0.55, follow4.8, target-forward1.2, FOV52. No camera framing change. Default south and ordinary heading turned toward candidate are separate. Fixed building wall OBBs tested; roof/eave decoration is not included. Baseline local terrain is expected to be rebuilt; protected-terrain and building obstructions cannot be removed.', results };
    if (searchMode) {
      const visible = row => ['top', 'lantern'].every(part => row.projections.desktop[part].inFrustum && row.projections.phone[part].inFrustum && row.rays[part].protectedBuildingHits.length === 0 && row.rays[part].protectedTerrainClearance > 0);
      report.viableViews = results.filter(visible).map(row => ({ candidate: row.candidate, source: row.source, topNdcY: row.projections.desktop.top.y, protectedTopClearance: row.rays.top.protectedTerrainClearance, protectedLanternClearance: row.rays.lantern.protectedTerrainClearance }));
      report.sourceCounts = Object.fromEntries(sources.map(source => [source.id, report.viableViews.filter(row => row.source.id === source.id).length]));
      report.dualViewCandidates = candidates.filter(candidate => report.viableViews.some(row => row.candidate.x === candidate.x && row.candidate.z === candidate.z && row.source.id === 'boardwalk-center') && report.viableViews.some(row => row.candidate.x === candidate.x && row.candidate.z === candidate.z && row.source.id.startsWith('courtyard')));
      console.log(JSON.stringify({ candidateCount: candidates.length, sourceCounts: report.sourceCounts, dualViewCandidates: report.dualViewCandidates, preferredAnchorViews: report.viableViews.filter(row => row.candidate.x === 27 && row.candidate.z === -22) }, null, 2));
    } else console.log(JSON.stringify(results.filter(row => row.heading === 'turned-toward-tower').map(row => ({ candidate: row.candidate, source: row.source.id, desktopTop: row.projections.desktop.top, phoneTop: row.projections.phone.top, topRay: row.rays.top, lanternRay: row.rays.lantern })), null, 2));
    if (currentSightlineMode) {
      report.geometry = 'Current rebuilt terrain, unchanged third-person camera and fixed buildings';
      report.method = report.method.replace('Baseline third-person', 'Current third-person').replace('Baseline local terrain is expected to be rebuilt; protected-terrain and building obstructions cannot be removed.', 'All current terrain is tested; baselineTerrainClearance is retained as a stable field name and means current terrain clearance in this report.');
      const failures = [];
      for (const id of ['main-street-waterfront', 'boardwalk-center']) {
        const row = results.find(row => row.source.id === id && row.heading === 'turned-toward-tower');
        for (const part of ['stripe', 'lantern', 'top']) {
          if (!row.projections.desktop[part].inFrustum || !row.projections.phone[part].inFrustum || row.rays[part].protectedBuildingHits.length || row.rays[part].baselineTerrainClearance <= 0) failures.push({ source: id, part, ray: row.rays[part] });
        }
      }
      report.visibilityObservations = { sources: ['main-street-waterfront', 'boardwalk-center'], parts: ['stripe', 'lantern', 'top'], allObservedPartsVisible: failures.length === 0, occludedOrCroppedParts:failures,
        courtyardLimitation: results.find(row => row.source.id === 'courtyard' && row.heading === 'turned-toward-tower').rays.lantern.protectedBuildingHits };
      report.placementAcceptance = 'Not evaluated by town camera. Fixed outer-tip lighthouse and under-foundation passage are the source of truth; ordinary curvature and protected-building occlusion are reported without changing camera, tower, or placement.';
    }
    writeFileSync(path.join(destination, searchMode ? 'lighthouse-anchor-search.json' : currentSightlineMode ? 'lighthouse-current-sightlines.json' : 'lighthouse-candidate-sightlines.json'), JSON.stringify(report, null, 2) + '\n');
  } else {
  const fixedFiles = [...filesBelow(path.join(world, 'runtime')), ...filesBelow(path.join(world, 'player')),
    ...filesBelow(path.join(world, 'scene/vegetation')), ...filesBelow(path.join(world, 'scene/interiors')),
    ...['WorldRuntime.tsx', 'data/world-map.ts', 'data/pier-layout.ts', 'data/pier-rails.ts', 'data/building-shapes.ts', 'data/town-types.ts',
      'scene/Pier.tsx', 'scene/pierGeometry.ts', 'scene/Ocean.tsx', 'scene/Environment.tsx', 'scene/CoastalLighting.tsx', 'scene/lighting-anchors.ts']
      .map(relative => path.join(world, relative))];
  const fixedFileHashes = Object.fromEntries(fixedFiles.map(file => [path.relative(world, file).replaceAll('\\', '/'), sha(readFileSync(file))]));
  const sceneSource = readFileSync(path.join(world, 'scene/ConceptLandmarks.tsx'), 'utf8');
  const protectedFragments = Object.fromEntries(Object.entries(fragments(sceneSource)).map(([name, source]) => {
    assert.ok(source.length > 100, `${name} preservation source fragment must exist`); return [name, sha(source)];
  }));
  const snapshot = {
    fixedFileHashes, protectedFragments,
    buildings: town.TOWN_BUILDINGS,
    areas: town.TOWN_AREAS.filter(area => area.id !== 'lighthouse-view'),
    routes: town.TOWN_ROUTES.filter(route => !['lighthouse-trail', 'cave', 'beach-east'].includes(route.id)),
    spawn: town.TOWN_SPAWN,
    fixtures: Object.fromEntries(Object.entries(planet.PLANET_FIXTURES).filter(([id]) => !['lighthouse', 'cave', 'hiddenbeach'].includes(id))),
    skate: Object.fromEntries(['SKATE_CENTER', 'SKATE_SIZE', 'SKATE_ELEVATION', 'SKATE_STAIRS'].map(key => [key, landmarks[key]])),
    otherSolids: landmarks.landmarkSolids.filter(solid => !['lighthouse', 'cave-rock'].includes(solid.buildingId)),
  };
  const samples = [];
  const points = new Set();
  const sample = (x, z) => {
    const key = `${x},${z}`;
    if (!protectedTerrain(x, z) || points.has(key)) return;
    points.add(key);
    samples.push([x, z, terrain.naturalTerrainAt(x, z), terrain.substrateAt(x, z), terrain.groundSurfaceAt(x, z).height]);
  };
  // Whole canonical globe at 0.5 chart metres, plus denser town/boundary samples.
  for (let x = -56.5; x <= 56.5; x += .5) for (let z = -50; z <= 176; z += .5) sample(x, z);
  for (let x = 14; x <= 25; x += .125) for (let z = -43; z <= 30; z += .125) sample(x, z);
  for (let x = 22; x <= 50; x += .25) for (const z of [-43.125, 30.125]) sample(x, z);
  for (let x = -56.5; x <= 56.5; x += .5) for (const z of [map.MAP_MIN_Z, map.MAP_SEAM - 1e-6]) sample(x, z);
  const scope = {
    mutableZone: '(x >= 15 and -47 <= z < -18) OR (x > 24 and -18 <= z <= 30); all x <= 24 at z >= -18 remain protected',
    protectedTerrainFields: ['naturalTerrainAt', 'substrateAt', 'groundSurfaceAt.height'],
    sampleColumns: ['mapX', 'mapZ', 'naturalHeight', 'substrateHeight', 'groundHeight'],
    wholeGlobeSpacing: .5, townBoundarySpacing: .125, heightTolerance: 1e-8,
    mutableAreaIds: ['lighthouse-view'], mutableRouteIds: ['lighthouse-trail', 'cave', 'beach-east'],
    mutableFixtureIds: ['lighthouse', 'cave', 'hiddenbeach'],
    note: 'Changing an allowed route does not waive terrain preservation outside the local zone. Source hashes protect fixed runtime/camera/pier/vegetation/interiors; mixed scene source fragments protect mountain/lift, forest and skate stairs.',
  };
  if (baselineMode) {
    assert.ok(!existsSync(baselinePath), 'Preservation baseline already exists; never overwrite the pre-rebuild evidence');
    const baseline = { revision, generatedAt: new Date().toISOString(), scope, snapshot, samples };
    writeFileSync(baselinePath, JSON.stringify(baseline) + '\n');
    for (const relative of ['data/town-surfaces.ts', 'data/town-layout.ts', 'data/concept-landmarks.ts', 'scene/ConceptLandmarks.tsx']) {
      writeFileSync(path.join(destination, (revision === 2 ? 'baseline-v2-' : 'baseline-') + path.basename(relative) + '.txt'), readFileSync(path.join(world, relative)));
    }
    writeFileSync(path.join(destination, 'preservation-scope.json'), JSON.stringify({ generatedAt: baseline.generatedAt, ...scope, sampleCount: samples.length, fixedFileCount: fixedFiles.length, protectedBuildingCount: snapshot.buildings.length, protectedRouteCount: snapshot.routes.length, fixedFileHashes, protectedFragments }, null, 2) + '\n');
    console.log(JSON.stringify({ baseline: baselinePath, sampleCount: samples.length, fixedFileCount: fixedFiles.length, protectedRoutes: snapshot.routes.length, protectedBuildings: snapshot.buildings.length }));
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const changes = [];
    const authorizationPath=path.join(destination,'runtime-change-scope.json');
    const authorizations=existsSync(authorizationPath)?JSON.parse(readFileSync(authorizationPath,'utf8')).files:[];
    const fixedFileChanges=[...new Set([...Object.keys(snapshot.fixedFileHashes),...Object.keys(baseline.snapshot.fixedFileHashes)])]
      .filter(file=>snapshot.fixedFileHashes[file]!==baseline.snapshot.fixedFileHashes[file])
      .map(file=>({file,before:baseline.snapshot.fixedFileHashes[file]??null,after:snapshot.fixedFileHashes[file]??null,
        authorized:Boolean(authorizations.find(item=>item.path===file)),purpose:authorizations.find(item=>item.path===file)?.purpose??null}));
    if(fixedFileChanges.some(change=>!change.authorized))changes.push('fixedFileHashes');
    for (const key of Object.keys(snapshot).filter(key=>key!=='fixedFileHashes')) if (JSON.stringify(snapshot[key]) !== JSON.stringify(baseline.snapshot[key])) changes.push(key);
    // The tower may move, but its component dimensions, materials and detail model may not.
    const savedPrefix = 'baseline-v2-';
    const range = (source, start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
    const towerModelSource = readFileSync(path.join(world, 'data/concept-landmarks.ts'), 'utf8');
    const savedTowerModel = readFileSync(path.join(immutableDirectory, savedPrefix + 'concept-landmarks.ts.txt'), 'utf8');
    const savedScene = readFileSync(path.join(immutableDirectory, savedPrefix + 'ConceptLandmarks.tsx.txt'), 'utf8');
    const lighthousePreserved = {
      components: range(towerModelSource, 'const towerParts:', 'const towerSolids') === range(savedTowerModel, 'const towerParts:', 'const towerSolids'),
      visibleDetails: range(sceneSource, '  const towerFrame =', '  // Static lift infrastructure:') === range(savedScene, '  const towerFrame =', '  // Static lift infrastructure:'),
    };
    if (!lighthousePreserved.components || !lighthousePreserved.visibleDetails) changes.push('unchangedLighthouseModel');
    const terrainChanges = [];
    let changedSampleCount = 0, maximumDelta = 0;
    for (const row of baseline.samples) {
      const current = [terrain.naturalTerrainAt(row[0], row[1]), terrain.substrateAt(row[0], row[1]), terrain.groundSurfaceAt(row[0], row[1]).height];
      const delta = Math.max(...current.map((value, index) => Math.abs(value - row[index + 2])));
      if (delta > baseline.scope.heightTolerance) {
        changedSampleCount++; maximumDelta = Math.max(maximumDelta, delta);
        if (terrainChanges.length < 80) terrainChanges.push({ x: row[0], z: row[1], before: row.slice(2), after: current, maximumDelta: delta });
      }
    }
    const report = { checkedAt: new Date().toISOString(), passed: !changes.length && !changedSampleCount, snapshotChanges: changes, fixedFileChanges, lighthousePreserved, protectedSampleCount: baseline.samples.length, changedSampleCount, maximumDelta, firstTerrainChanges: terrainChanges };
    writeFileSync(path.join(destination, 'preservation-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
  }
} finally {
  if (path.dirname(path.resolve(temporary)) !== artifactRoot || !path.basename(temporary).startsWith('peninsula-check-')) throw new Error('Unexpected peninsula temporary directory');
  rmSync(temporary, { recursive: true, force: true });
}
