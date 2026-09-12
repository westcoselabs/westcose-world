import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { conceptApproachViews } from './concept-review-viewpoints.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(repository, '.next');
mkdirSync(artifacts, { recursive: true });
const output = mkdtempSync(path.join(artifacts, 'town-audit-'));

try {
  const modules = ['data', 'runtime'].flatMap(directory => readdirSync(path.join(repository, 'src/features/world', directory))
    .filter(file => file.endsWith('.ts')).map(file => `${directory}/${file.slice(0, -3)}`));
  for (const relative of modules) {
    const source = path.join(repository, 'src/features/world', `${relative}.ts`);
    const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const target = path.join(output, `${relative}.js`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const town = require(path.join(output, 'data/town-layout.js'));
  const landmarks = require(path.join(output, 'data/concept-landmarks.js'));
  const pier = require(path.join(output, 'data/pier-layout.js'));
  const { mapDirection } = require(path.join(output, 'data/world-map.js'));
  const collision = require(path.join(output, 'runtime/planet-collision.js'));
  const buildings = town.TOWN_BUILDINGS;

  function visitorPoint(x, z) {
    const up = mapDirection(x, z);
    return up.multiplyScalar(collision.supportRadius(up) + 0.85);
  }

  function touchingWalls(x, z) {
    const contact = collision.buildingContact(visitorPoint(x, z));
    return contact ? [contact.segmentId] : [];
  }

  let sampleCount = 0;
  const findings = [];
  for (const route of town.TOWN_ROUTES) {
    const obstacles = new Map();
    for (let segment = 1; segment < route.points.length; segment++) {
      const a = route.points[segment - 1];
      const b = route.points[segment];
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12);
      assert.ok(count > 0, `${route.id} contains an empty segment`);
      for (let step = 0; step <= count; step++) {
        const x = a[0] + (b[0] - a[0]) * step / count;
        const z = a[1] + (b[1] - a[1]) * step / count;
        sampleCount++;
        for (const wall of touchingWalls(x, z)) {
          const point = [Number(x.toFixed(3)), Number(z.toFixed(3))];
          if (!obstacles.has(wall)) obstacles.set(wall, { wall, first: point, last: point, samples: 0 });
          const hit = obstacles.get(wall);
          hit.last = point;
          hit.samples++;
        }
      }
    }
    if (obstacles.size) findings.push({ route: route.id, hits: [...obstacles.values()] });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    method: 'Authored route centerlines sampled every 0.12 chart metres using the actual spherical support and capsule collision modules, including segmented walls, furniture, tangent floors and pier rails. This static check complements actual movement tests; it does not prove every road edge or camera view.',
    primaryBuildings: buildings.filter(building => !building.secondary).length,
    secondaryBuildings: buildings.filter(building => building.secondary).length,
    interiors: town.TOWN_INTERIORS.map(building => building.id),
    routes: town.TOWN_ROUTES.length, sampleCount, findings,
    reviewApproaches: conceptApproachViews(landmarks, town, pier).map(view => {
      const position = visitorPoint(view.x, view.z), support = collision.supportAt(position);
      return { ...view, supportKind: support.kind, interior: collision.activeInteriorAt(position), contact: collision.buildingContact(position)?.segmentId ?? null };
    }),
  };
  const reportPath = path.resolve(repository, process.env.WORLD_LAYOUT_OUTPUT || 'docs/qa/globe-refinement/layout-preflight.json');
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (findings.length || report.reviewApproaches.some(view => view.interior || view.contact || view.supportKind === 'water')) process.exitCode = 1;
} finally {
  const resolved = path.resolve(output);
  if (path.dirname(resolved) !== artifacts || !path.basename(resolved).startsWith('town-audit-')) throw new Error('Unexpected audit artifact path');
  rmSync(resolved, { recursive: true, force: true });
}
