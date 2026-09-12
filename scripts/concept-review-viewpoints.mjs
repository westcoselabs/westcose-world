import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Shared by browser capture and actual-support/collision preflight. */
export function conceptApproachViews(landmarks, town, pier) {
  const lighthouse = landmarks.LIGHTHOUSE;
  const lighthouseTrail = town.TOWN_ROUTES.find(route => route.id === 'lighthouse-trail');
  const destination = lighthouseTrail.points.at(-1);
  const approach = lighthouseTrail.points.find(point => point[1] < 0);
  const entry = landmarks.CAVE_POINTS[0], exit = landmarks.CAVE_POINTS.at(-1);
  const towardsTower = point => ({ east: lighthouse.x - point[0], north: lighthouse.z - point[1] });
  return [
    { label: 'lighthouse-approach', x: approach[0], z: approach[1], facing: towardsTower(approach) },
    { label: 'lighthouse-from-beach', x: lighthouse.x - 22, z: lighthouse.z - 2, facing: { east: 22, north: 2 } },
    { label: 'lighthouse-from-pier', x: pier.PIER_LAYOUT.head.center[0], z: pier.PIER_LAYOUT.head.center[1], facing: { east: 1, north: .25 } },
    { label: 'lighthouse-destination', x: destination[0], z: destination[1], facing: towardsTower(destination) },
    { label: 'hidden-beach-open', x: exit[0] + 1, z: exit[1] + 4, facing: 'east' },
    { label: 'cave-exterior-entry', x: entry[0] - 4, z: entry[1] - 4, facing: { east: 4, north: 4 } },
  ];
}

/** Capture runs outside Next: read the same small, pure authoring data modules. */
export function loadConceptApproachViews() {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const artifacts = path.join(repository, '.next');
  mkdirSync(artifacts, { recursive: true });
  const temporary = mkdtempSync(path.join(artifacts, 'review-views-'));
  try {
    for (const name of ['world-map', 'concept-landmarks', 'town-layout', 'pier-layout']) {
      const source = path.join(repository, 'src/features/world/data', `${name}.ts`);
      const compiled = ts.transpileModule(readFileSync(source, 'utf8'), { fileName: source,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
      writeFileSync(path.join(temporary, `${name}.js`), compiled.outputText);
    }
    const require = createRequire(import.meta.url);
    return conceptApproachViews(require(path.join(temporary, 'concept-landmarks.js')), require(path.join(temporary, 'town-layout.js')), require(path.join(temporary, 'pier-layout.js')));
  } finally {
    if (path.dirname(path.resolve(temporary)) !== artifacts || !path.basename(temporary).startsWith('review-views-')) throw new Error('Unexpected review viewpoints artifact path');
    rmSync(temporary, { recursive: true, force: true });
  }
}
