import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Layout invariants for mountain revision 4 and its snowboard runs. Pure data only.
const repository = process.cwd();
mkdirSync(path.join(repository, '.next'), { recursive: true });
const output = mkdtempSync(path.join(repository, '.next', 'ski-mountain-check-'));
try {
  const data = path.join(repository, 'src/features/world/data');
  for (const file of readdirSync(data).filter(name => name.endsWith('.ts'))) {
    const result = ts.transpileModule(readFileSync(path.join(data, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    writeFileSync(path.join(output, file.replace(/\.ts$/, '.js')), result.outputText);
  }
  const require = createRequire(path.join(output, 'index.js'));
  const runs = require('./ski-runs.js'), obstacles = require('./ski-obstacles.js');
  const mountain = require('./mountain-layout.js'), surfaces = require('./town-surfaces.js'), map = require('./world-map.js');
  const R = map.MAP_RADIUS;
  const physical = (a, b, h = 0) => {
    const k = (R + h) / R, x = (a.x + b.x) / 2;
    return Math.hypot((a.x - b.x) * k, (a.z - b.z) * Math.cos(x / R) * k);
  };

  await test('features sit on straight sections inside the run, clear of each other', () => {
    for (const run of runs.SKI_RUNS) {
      const spans = [];
      for (const feature of run.features) {
        const [a, b] = runs.featureSpan(feature);
        assert.ok(a >= 2 && b <= run.length - 4, `${run.id} ${feature.kind} fits inside the run (${a.toFixed(1)}-${b.toFixed(1)} of ${run.length.toFixed(1)})`);
        if (feature.kind === 'kicker') {
          for (const sample of run.samples.filter(sample => sample.s >= a && sample.s <= b)) {
            assert.ok(Math.abs(sample.curvature) < .045, `${run.id} kicker at ${feature.s} needs a straight run-in and landing (curvature ${sample.curvature.toFixed(3)})`);
          }
          assert.ok(Math.abs(feature.offset) + feature.width / 2 <= run.width / 2 + .01, `${run.id} kicker at ${feature.s} fits the groomed width`);
        }
        if (feature.kind !== 'roller' && feature.kind !== 'narrows') spans.push([a, b, feature]);
      }
      spans.sort((p, q) => p[0] - q[0]);
      for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1] + 4, `${run.id} features ${spans[i - 1][2].kind}@${spans[i - 1][0].toFixed(0)} and ${spans[i][2].kind}@${spans[i][0].toFixed(0)} leave recovery room`);
    }
  });

  await test('gates, tokens and checkpoints stay on the groomed run', () => {
    for (const run of runs.SKI_RUNS) {
      for (const gate of run.gates) assert.ok(Math.abs(gate.offset) + 2.1 <= runs.runWidthAt(run, gate.s) / 2 + .01, `${run.id} gate at ${gate.s} fits between the edges`);
      for (const token of run.tokens) assert.ok(Math.abs(token.offset) <= runs.runWidthAt(run, token.s) / 2 - .4, `${run.id} token at ${token.s.toFixed(1)} is on the run`);
      assert.equal(run.checkpoints[0], 0);
      const spans = run.features.filter(feature => feature.kind !== 'narrows').map(runs.featureSpan);
      for (const checkpoint of run.checkpoints.slice(1)) assert.ok(!spans.some(([a, b]) => checkpoint > a - 4 && checkpoint < b + 4), `${run.id} checkpoint ${checkpoint} is clear of features`);
    }
  });

  await test('no obstacle stands on groomed snow outside the glade, the plateau or a finish area', () => {
    let trees = 0;
    for (const obstacle of obstacles.SKI_OBSTACLES) {
      assert.ok(Number.isFinite(obstacle.ground) && obstacle.ground > map.MAP_SEA_LEVEL, `${obstacle.id} stands on land`);
      if (obstacle.kind === 'tree') trees++;
      const sample = runs.skiRunSampleAt(obstacle.x, obstacle.z);
      if (sample && sample.s > 0 && sample.s < sample.run.length) {
        const half = runs.runWidthAt(sample.run, sample.s) / 2;
        const glade = sample.run.id === 'timber-chute' && sample.s > 76 && sample.s < 104;
        assert.ok(glade || sample.distance >= half + 2, `${obstacle.id} is clear of ${sample.run.id} (${sample.distance.toFixed(2)}m from centre)`);
      }
      assert.equal(mountain.mountainFinishAreaAt(obstacle.x, obstacle.z), undefined, `${obstacle.id} is outside finish areas`);
    }
    assert.ok(trees > 200, 'The mountain is forested between the runs');
  });

  await test('separate runs keep clearance and the whole mountain fits the planet envelope', () => {
    const list = runs.SKI_RUNS;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      let min = Infinity;
      for (const a of list[i].samples.filter((_, index) => index % 3 === 0)) {
        if (a.z >= 203 || a.z < 70) continue;
        for (const b of list[j].samples.filter((_, index) => index % 3 === 0)) {
          if (b.z >= 203 || b.z < 70) continue;
          min = Math.min(min, physical(a, b, (a.h + b.h) / 2) - (list[i].width + list[j].width) / 2);
        }
      }
      assert.ok(min > 2.5, `${list[i].id} and ${list[j].id} keep ${min.toFixed(2)}m between groomed edges`);
    }
    let highest = -Infinity;
    for (let z = 50; z <= 310; z += 1.5) for (let x = -90; x <= 90; x += 1.5) highest = Math.max(highest, surfaces.groundSurfaceAt(x, z).height);
    assert.ok(highest <= map.MAP_MAX_HEIGHT - 2, `Mountain peak ${highest.toFixed(2)}m stays inside the ${map.MAP_MAX_HEIGHT}m envelope`);
    console.log('SKI_MOUNTAIN', JSON.stringify(Object.fromEntries(list.map(run => [run.id, {
      length: +run.length.toFixed(1), drop: +run.drop.toFixed(1), features: run.features.length, gates: run.gates.length, tokens: run.tokens.length, checkpoints: run.checkpoints.length,
    }]))), 'obstacles', obstacles.SKI_OBSTACLES.length);
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
