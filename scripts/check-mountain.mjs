import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import ts from 'typescript';
import { proposal, proposalHeightAt } from '../docs/design/mountain-approval/proposal-data.mjs';

// Compile the actual pure runtime module in memory; no build, browser or generated files.
const source = readFileSync(new URL('../src/features/world/data/mountain-layout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), []);
const mountain = {};
new Function('exports', compiled.outputText)(mountain);
const { MOUNTAIN_LAYOUT: layout, MOUNTAIN_RUNS: runs, mountainHeightAt: heightAt, mountainRouteAt: routeAt } = mountain;
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
const direction = ([x, z]) => [Math.sin(x / 36), Math.cos(x / 36) * Math.sin(z / 36), Math.cos(x / 36) * Math.cos(z / 36)];
const worldPoint = q => direction(q).map(v => v * (36 + q[2]));
const physicalDistance = (a, b) => Math.acos(Math.max(-1, Math.min(1, direction(a).reduce((sum, v, i) => sum + v * direction(b)[i], 0)))) * (36 + (a[2] + b[2]) / 2);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const crosses = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8;

test('runtime routes, polygons and anchors match the approved revision 3 exactly', () => {
  for (const key of ['radius', 'seaLevel', 'summit', 'resort', 'resortTerrace', 'spawnPad', 'decisionApron', 'finishApron', 'ticketHut', 'lodge', 'pedestrianArrival', 'pedestrianLinks', 'snowBoundary', 'mountainBoundary', 'runs']) {
    assert.deepEqual(layout[key], proposal[key], key);
  }
  assert.deepEqual(layout.resort, { x: 1, z: 53.7, height: 2.8 });
});

test('indexed runtime heightfield matches the approved scalar across the entire mountain and base', () => {
  let count = 0, maximumError = 0;
  for (let x = -36; x <= 36; x += .75) for (let z = 40; z <= 170; z += .75) {
    maximumError = Math.max(maximumError, Math.abs(heightAt(x, z) - proposalHeightAt(x, z)));
    count++;
  }
  assert.ok(maximumError < 1e-9, `Grid error ${maximumError} over ${count} samples`);
  close(heightAt(0, 153), 40);
  close(heightAt(0, 151), 39.6);
});

test('base resort plates apply after the alpine fade and preserve unrelated supplied substrate', () => {
  for (const area of [layout.resortTerrace, layout.lodge, layout.ticketHut, layout.pedestrianArrival]) close(heightAt(area.x, area.z, -7), 2.8);
  for (const [x, z] of [[0, 40], [0, 30], [0, -20], [27, 0], [36, -32], [-38, 100], [38, 100], [0, 164], [0, 171]]) {
    for (const existing of [-2.35, .16, 6.2]) close(heightAt(x, z, existing), existing);
  }
});

test('all sampled run centers and intervals descend without height spikes; local query agrees', () => {
  for (const run of runs) {
    let previous = Infinity;
    for (let i = 0; i < run.points.length - 1; i++) {
      const a = run.points[i], b = run.points[i + 1];
      for (let step = 0; step <= 5; step++) {
        const t = step / 5, q = a.map((value, index) => value + (b[index] - value) * t);
        const height = heightAt(q[0], q[1]);
        close(height, q[2]);
        assert.ok(height <= previous + 1e-9, `${run.id}: uphill at ${q}`);
        previous = height;
        const near = routeAt(q[0], q[1]);
        assert.equal(near.run.id, run.id);
        close(near.distance, 0);
        close(near.height, q[2]);
      }
    }
  }
});

test('physical-width ribbons stay in snow without folded quads or self-crossing edges', () => {
  for (const run of runs) {
    const edges = [[], []];
    for (let i = 0; i < run.points.length; i++) {
      const q = run.points[i], a = run.points[Math.max(0, i - 1)], b = run.points[Math.min(run.points.length - 1, i + 1)];
      const k = (36 + q[2]) / 36, kZ = k * Math.cos(q[0] / 36);
      const dx = (b[0] - a[0]) * k, dz = (b[1] - a[1]) * kZ, length = Math.hypot(dx, dz);
      for (let side = 0; side < 2; side++) {
        const sign = side * 2 - 1;
        const edge = [q[0] - sign * dz / length * run.width / 2 / k, q[1] + sign * dx / length * run.width / 2 / kZ];
        assert.ok(mountain.mountainSnowAt(...edge), `${run.id}: snow boundary ${edge}`);
        edges[side].push(edge);
      }
    }
    for (let i = 0; i < run.points.length - 1; i++) assert.ok(!crosses(edges[0][i], edges[1][i], edges[0][i + 1], edges[1][i + 1]), `${run.id}: folded width at ${i}`);
    for (const edge of edges) for (let i = 0; i < edge.length - 1; i++) for (let j = i + 2; j < edge.length - 1; j++) assert.ok(!crosses(edge[i], edge[i + 1], edge[j], edge[j + 1]), `${run.id}: self-crossing edge`);
  }
});

test('run separation and compact same-level resort spacing retain the approved clearances', () => {
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    let minimum = Infinity;
    for (const a of runs[i].points.filter(p => p[1] <= 140)) for (const b of runs[j].points.filter(p => p[1] <= 140)) minimum = Math.min(minimum, physicalDistance(a, b) - (runs[i].width + runs[j].width) / 2);
    assert.ok(minimum >= 4, `${runs[i].id}/${runs[j].id}: ${minimum}m`);
  }
  const buildingGap = (layout.ticketHut.x - layout.lodge.x) * (36 + layout.lodge.height) / 36 - (layout.ticketHut.width + layout.lodge.width) / 2;
  close(buildingGap, 3, 1e-8);
});

test('report bounded heightfield performance and approved curved run lengths', () => {
  const queries = [];
  for (let x = -31; x <= 31; x += 1.1) for (let z = 50; z <= 162; z += 1.1) queries.push([x, z]);
  const measure = fn => { const start = performance.now(); let checksum = 0; for (let round = 0; round < 3; round++) for (const q of queries) checksum += fn(...q); return { milliseconds: performance.now() - start, checksum }; };
  measure(heightAt);
  const indexed = measure(heightAt), reference = measure(proposalHeightAt);
  close(indexed.checksum, reference.checksum, 1e-7);
  console.log('MOUNTAIN_METRICS', JSON.stringify({ queries: queries.length * 3, runtimeMs: +indexed.milliseconds.toFixed(1), previewScanMs: +reference.milliseconds.toFixed(1), speedup: +(reference.milliseconds / indexed.milliseconds).toFixed(2), runs: runs.map(run => ({ id: run.id, width: run.width, length: +run.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...worldPoint(p).map((v, axis) => v - worldPoint(run.points[i])[axis])), 0).toFixed(1) })) }));
});
