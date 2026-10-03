import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Pins the sea-cave layout data to the approved drawing set's snapshot
 * (docs/design/sea-cave-approval/proposal.json, rendered from that data). A layout change
 * must go through a re-rendered, re-approved drawing. Run: node scripts/check-sea-cave-layout.mjs */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repository, 'src/features/world/data/sea-cave-layout.ts');
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const layout = {};
new Function('exports', compiled.outputText)(layout);
const approved = JSON.parse(readFileSync(path.join(repository, 'docs/design/sea-cave-approval/proposal.json'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(approved.built, true, 'The approved snapshot is of the built caves');
assert.deepEqual(plain(layout.SEA_CAVE_PASSAGES), approved.overlays.passages, 'Passages match the approved drawing');
assert.deepEqual(plain(layout.SEA_CAVE_CHAMBERS), approved.overlays.chambers, 'Chambers match the approved drawing');
assert.deepEqual(plain(layout.SEA_CAVE_PILLARS), approved.overlays.pillars, 'Pillars match the approved drawing');
assert.deepEqual(plain(layout.SEA_CAVE_WINDOW), approved.overlays.window, 'The ocean window matches the approved drawing');
assert.deepEqual(plain(layout.SEA_CAVE_MOUTH), approved.overlays.mouth, 'The mouth matches the approved drawing');
assert.deepEqual(plain(layout.SEA_CAVE_ARENA), approved.overlays.arena, 'The arena matches the approved drawing');
assert.deepEqual(layout.SEA_CAVE_MASSIF.footprint.map(([u, v]) => [u, v]), approved.overlays.footprint, 'The headland footprint matches the approved drawing');
// The approved decisions themselves.
assert.deepEqual(approved.numbers.grottoSize, [18, 14]);
assert.equal(approved.numbers.windowWidth, 12.4);
assert.equal(approved.lighthouse.tower.stair.turns, 1.5);
assert.equal(approved.lighthouse.tower.gallery + approved.lighthouse.tower.terrace, 26);
console.log('sea-cave layout matches the approved drawing set');
