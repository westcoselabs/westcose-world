import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd(), artifacts = path.join(repository, '.next');
mkdirSync(artifacts, { recursive: true });
const output = mkdtempSync(path.join(artifacts, 'hinterland-audit-'));
const round = value => Math.round(value * 1000) / 1000;
try {
  const sourceRoot = path.join(repository, 'src/features/world');
  const modules = readdirSync(path.join(sourceRoot, 'data')).filter(file => file.endsWith('.ts')).map(file => `data/${file}`)
    .concat(['scene/vegetation/coastalHinterlandGeometry.ts', 'scene/vegetation/coastalPlanting.ts', 'scene/sceneryGeometry.ts', 'scene/kit/context.ts', 'scene/materials/surface-types.ts']);
  for (const relative of modules) {
    const source = path.join(sourceRoot, relative), target = path.join(output, relative.replace(/\.ts$/, '.js'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, ts.transpileModule(readFileSync(source, 'utf8'), { fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const require = createRequire(path.join(repository, 'package.json'));
  const { Vector3 } = require('three');
  const { buildCoastalHinterland, hinterlandMatrix } = require(path.join(output, 'scene/vegetation/coastalHinterlandGeometry.js'));
  const { COASTAL_TREES, plantingClearanceAt } = require(path.join(output, 'scene/vegetation/coastalPlanting.js'));
  const { COASTAL_REGIONS, COASTAL_LOOKOUTS } = require(path.join(output, 'data/coastal-regions.js'));
  const { RADIUS, SEA_LEVEL, directionAt, terrainHeightAt } = require(path.join(output, 'data/planet.js'));
  const { surfaceMaterialAt } = require(path.join(output, 'data/town-surfaces.js'));
  const { TOWN_BUILDINGS } = require(path.join(output, 'data/town-layout.js'));
  const { buildingFrame } = require(path.join(output, 'data/building-shapes.js'));
  const world = buildCoastalHinterland(), { layout, stats } = world;
  const geodesic = (a, b) => RADIUS * a.angleTo(b);
  function arcDistance(up, a, b) {
    const axis = new Vector3().crossVectors(a, b);
    if (axis.lengthSq() < 1e-15) return geodesic(up, a);
    axis.normalize();
    const projected = up.clone().addScaledVector(axis, -up.dot(axis)).normalize();
    if (a.angleTo(projected) + projected.angleTo(b) <= a.angleTo(b) + 1e-8) return geodesic(up, projected);
    return Math.min(geodesic(up, a), geodesic(up, b));
  }
  function buildingClearance(up) {
    let nearest = Infinity;
    for (const building of TOWN_BUILDINGS) {
      const frame = buildingFrame(building), cosine = frame.up.dot(up);
      if (cosine < 0.85) continue;
      const local = up.clone().multiplyScalar((RADIUS + building.floorHeight) / cosine).sub(frame.position).applyQuaternion(frame.inverse);
      const dx = Math.abs(local.x) - building.width / 2, dz = Math.abs(local.z) - building.depth / 2;
      nearest = Math.min(nearest, dx < 0 && dz < 0 ? Math.max(dx, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dz)));
    }
    return nearest;
  }
  const treeNormals = layout.trees.map(tree => new Vector3(...tree.up));
  const existingNormals = COASTAL_TREES.map(tree => directionAt(tree.x / RADIUS, tree.z / RADIUS));
  let minimumTreeSpacing = Infinity, minimumExistingTreeSpacing = Infinity, minimumTrailEdge = Infinity;
  let minimumBuildingClearance = Infinity, minimumTownClearance = Infinity, minimumLandMargin = Infinity, maximumAnchorError = 0;
  let minimumLookoutClearance = Infinity;
  const treeChecks = [];
  assert.equal(new Set(layout.trees.map(tree => tree.id)).size, layout.trees.length, 'Unique tree ids');
  layout.trees.forEach((tree, i) => {
    const up = treeNormals[i], terrain = terrainHeightAt(up), margin = terrain - SEA_LEVEL;
    const point = new Vector3(...tree.position), error = point.distanceTo(up.clone().multiplyScalar(RADIUS + terrain));
    const townClearance = plantingClearanceAt(tree.x, tree.z), buildingGap = buildingClearance(up);
    assert.ok(tree.scale.every(value => Number.isFinite(value) && value > 0), `${tree.id} scale`);
    assert.ok(hinterlandMatrix(tree).elements.every(Number.isFinite), `${tree.id} matrix`);
    assert.ok(Math.abs(up.length() - 1) < 1e-9 && error < 1e-7, `${tree.id} radial ground anchor`);
    assert.ok(margin >= 0.57 - 1e-7, `${tree.id} dry substrate margin`);
    assert.ok(surfaceMaterialAt(tree.x, tree.z) === null && townClearance >= 2.15 - 1e-7, `${tree.id} town routes and doors`);
    minimumLandMargin = Math.min(minimumLandMargin, margin); maximumAnchorError = Math.max(maximumAnchorError, error);
    minimumTownClearance = Math.min(minimumTownClearance, townClearance); minimumBuildingClearance = Math.min(minimumBuildingClearance, buildingGap);
    for (let j = i + 1; j < treeNormals.length; j++) minimumTreeSpacing = Math.min(minimumTreeSpacing, geodesic(up, treeNormals[j]));
    for (const other of existingNormals) minimumExistingTreeSpacing = Math.min(minimumExistingTreeSpacing, geodesic(up, other));
    let trailEdge = Infinity;
    for (const trail of layout.trails) for (let segment = 1; segment < trail.length; segment++) {
      trailEdge = Math.min(trailEdge, arcDistance(up, trail[segment - 1].up, trail[segment].up) - trail[segment].width / 2);
    }
    minimumTrailEdge = Math.min(minimumTrailEdge, trailEdge);
    for (const lookout of COASTAL_LOOKOUTS) minimumLookoutClearance = Math.min(minimumLookoutClearance,
      geodesic(up, directionAt(lookout.center[0] / RADIUS, lookout.center[1] / RADIUS)) - 2.2);
    treeChecks.push({ id: tree.id, region: tree.regionId, species: tree.species, chart: [round(tree.x), round(tree.z)], landMargin: round(margin), townClearance: round(townClearance), trailEdgeClearance: round(trailEdge) });
  });
  assert.ok(minimumTreeSpacing >= 3.3 && minimumExistingTreeSpacing >= 3.3, 'Spherical tree spacing');
  assert.ok(minimumTrailEdge >= 1.5, 'Continuous trail clearance, allowing for generator sample spacing');
  let minimumGroundPlantMargin = Infinity;
  for (const [kind, anchors, clearance] of [['grass', layout.grasses, 0.45], ['scrub', layout.scrub, 1], ['rock', layout.rocks, 1.25]]) {
    for (const anchor of anchors) {
      const margin = terrainHeightAt(anchor.up) - SEA_LEVEL;
      minimumGroundPlantMargin = Math.min(minimumGroundPlantMargin, margin);
      assert.ok(margin >= 0.57 - 1e-7 && surfaceMaterialAt(anchor.x, anchor.z) === null, `${kind} natural dry substrate`);
      assert.ok(plantingClearanceAt(anchor.x, anchor.z) >= clearance - 1e-7, `${kind} route/building clearance`);
      assert.ok(Math.abs(anchor.position.length() - RADIUS - terrainHeightAt(anchor.up) + 0.018) < 1e-7, `${kind} buried base`);
    }
  }
  const geometries = [...Object.values(world.trees), ...world.sectors, world.details];
  for (const geometry of geometries) for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert.ok(attribute.array.every(Number.isFinite), `${name} finite`);
    assert.equal(attribute.count, geometry.getAttribute('position').count, `${name} vertex alignment`);
  }
  const expected = COASTAL_REGIONS.reduce((sum, region) => sum + region.trees, 0);
  const underfilledRegions = COASTAL_REGIONS.filter(region => stats.byRegion[region.id] !== region.trees).map(region => ({ id: region.id, requested: region.trees, accepted: stats.byRegion[region.id] }));
  const existingTreeClearances = COASTAL_TREES.map(tree => ({ id: tree.id, clearance: round(plantingClearanceAt(tree.x, tree.z)) }));
  assert.ok(existingTreeClearances.every(tree => tree.clearance > 0.2), 'Existing town trunks retain clear walking space');
  const report = {
    generatedAt: new Date().toISOString(), method: 'Static generation from exported layout/stats. Tests every accepted anchor against actual spherical terrain, existing planting clearance, independently intersected tangent building footprints, continuous great-circle trail segments, existing and new tree geodesic spacing. Geometry attributes are checked for finite aligned values. No browser, application build or frame-rate measurement.',
    stats, requestedTrees: expected, underfilledRegions,
    minimums: { newTreeSpacing: round(minimumTreeSpacing), existingTreeSpacing: round(minimumExistingTreeSpacing), continuousTrailEdgeClearance: round(minimumTrailEdge), townRouteAndDoorClearance: round(minimumTownClearance), independentBuildingClearance: round(minimumBuildingClearance), treeLandAboveSea: round(minimumLandMargin), lowPlantLandAboveSea: round(minimumGroundPlantMargin), lookoutAreaClearance: round(minimumLookoutClearance) },
    maximumTreeGroundAnchorError: maximumAnchorError, existingTreeClearances, trees: treeChecks,
    limitations: ['Spacing concerns trunk anchors; canopies may overlap naturally.', 'Low plants and lookout furniture are decorative, without individual movement colliders.', 'This check does not establish visual quality, rendered shadow cost or device performance.'],
  };
  const reportPath = path.join(repository, 'docs/qa/westcose-coast/hinterland-static.json');
  mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  geometries.forEach(geometry => geometry.dispose());
  console.log(JSON.stringify({ reportPath, stats, requestedTrees: expected, underfilledRegions, minimums: report.minimums, maximumTreeGroundAnchorError: maximumAnchorError }, null, 2));
} finally {
  if (path.dirname(path.resolve(output)) !== artifacts || !path.basename(output).startsWith('hinterland-audit-')) throw new Error('Unexpected audit artifact path');
  rmSync(output, { recursive: true, force: true });
}
