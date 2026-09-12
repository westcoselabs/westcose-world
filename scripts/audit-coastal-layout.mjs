import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(repository, '.next');
mkdirSync(artifacts, { recursive: true });
const output = mkdtempSync(path.join(artifacts, 'coastal-audit-'));
const round = value => Math.round(value * 1000) / 1000;
const minimumSetback = Number(process.env.WORLD_COAST_MIN_SETBACK || 3);
if (!Number.isFinite(minimumSetback) || minimumSetback < 0) throw new Error('Invalid coastal setback');

try {
  const data = path.join(repository, 'src/features/world/data');
  for (const file of readdirSync(data).filter(name => name.endsWith('.ts'))) {
    const source = path.join(data, file);
    const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    mkdirSync(path.join(output, 'data'), { recursive: true });
    writeFileSync(path.join(output, 'data', file.replace(/\.ts$/, '.js')), compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const town = require(path.join(output, 'data/town-layout.js'));
  const { RADIUS, SEA_LEVEL, coordinatesAt } = require(path.join(output, 'data/planet.js'));
  const { mapDirection } = require(path.join(output, 'data/world-map.js'));
  const { substrateAt, townCoordinates, townSurfaceAt } = require(path.join(output, 'data/town-surfaces.js'));
  const { buildingLocalPoint, buildingFrame } = require(path.join(output, 'data/building-shapes.js'));

  // Locate the actual substrate/sea intersection, rather than the decorative shore formula.
  const shoreline = [];
  for (let x = -40; x <= 40; x += 0.1) {
    let low = -42, high = -7;
    if (substrateAt(x, low) >= SEA_LEVEL || substrateAt(x, high) <= SEA_LEVEL) continue;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (substrateAt(x, mid) < SEA_LEVEL) low = mid; else high = mid;
    }
    const z = (low + high) / 2;
    shoreline.push({ x, z, normal: mapDirection(x, z) });
  }
  function sample(building, x, z) {
    const point = buildingLocalPoint(building, [x, 0, z]);
    const chart = townCoordinates(point);
    const substrate = substrateAt(chart.x, chart.z);
    const surface = townSurfaceAt(chart.x, chart.z);
    const floor = point.length() - RADIUS;
    const normal = point.clone().normalize();
    let coast = Infinity;
    for (const shore of shoreline) coast = Math.min(coast, RADIUS * Math.acos(Math.max(-1, Math.min(1, normal.dot(shore.normal)))));
    return { local: [round(x), round(z)], chart: [round(chart.x), round(chart.z)], substrate, surface: surface.height,
      supportKind: surface.kind, floor, coast: (substrate >= SEA_LEVEL ? 1 : -1) * coast };
  }
  function audit(building, others) {
    const samples = [];
    const nx = Math.ceil(building.width / 0.35), nz = Math.ceil(building.depth / 0.35);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      samples.push(sample(building, (i / nx - 0.5) * building.width, (j / nz - 0.5) * building.depth));
    }
    const corners = [-1, 1].flatMap(x => [-1, 1].map(z => sample(building, x * building.width / 2, z * building.depth / 2)));
    const intersecting = [];
    for (const other of others.filter(other => other.id !== building.id)) {
      const frame = buildingFrame(other);
      if (buildingFrame(building).position.distanceTo(frame.position) > (Math.hypot(building.width, building.depth) + Math.hypot(other.width, other.depth)) / 2) continue;
      if (samples.some(s => {
        const p = buildingLocalPoint(building, [s.local[0], 0, s.local[1]]).sub(frame.position).applyQuaternion(frame.inverse);
        return Math.abs(p.x) < other.width / 2 && Math.abs(p.z) < other.depth / 2;
      })) intersecting.push(other.id);
    }
    return {
      id: building.id, center: [building.x, building.z], rotation: round(building.rotation), floorHeight: building.floorHeight,
      samples: samples.length, minSubstrate: round(Math.min(...samples.map(s => s.substrate))),
      submergedSamples: samples.filter(s => s.substrate < SEA_LEVEL).length,
      minCoastClearance: round(Math.min(...samples.map(s => s.coast))),
      floorGapToSubstrate: [round(Math.min(...samples.map(s => s.floor - s.substrate))), round(Math.max(...samples.map(s => s.floor - s.substrate)))],
      floorGapToSurface: [round(Math.min(...samples.map(s => s.floor - s.surface))), round(Math.max(...samples.map(s => s.floor - s.surface)))],
      intersecting,
      corners: corners.map(s => ({ chart: s.chart, substrate: round(s.substrate), floor: round(s.floor), gap: round(s.floor - s.substrate), coastClearance: round(s.coast), supportKind: s.supportKind })),
    };
  }
  const overrides = JSON.parse(process.env.WORLD_COAST_CANDIDATES || '[]');
  const buildings = town.TOWN_BUILDINGS.map(building => {
    const change = overrides.find(candidate => candidate.id === building.id);
    if (!change) return building;
    return { ...building, ...change, ...coordinatesAt(mapDirection(change.x ?? building.x, change.z ?? building.z)) };
  });
  const results = buildings.map(building => audit(building, buildings));
  const dryFootprintFailures = results.filter(building => building.submergedSamples || building.minCoastClearance < minimumSetback);
  const spacingWarnings = results.filter(building => building.intersecting.length);
  const findings = results.filter(building => dryFootprintFailures.includes(building) || spacingWarnings.includes(building));
  const report = {
    generatedAt: new Date().toISOString(), seaLevel: SEA_LEVEL, minimumSetback, candidates: overrides,
    method: 'Actual rotated tangent footprints, including every corner and an interior grid no coarser than 0.35 m. Substrate is sampled independently of paving/pier support. Coastal distance is a signed spherical distance to a 0.1-chart-metre sampled zero-sea intersection over the authored town longitude range; negative means submerged. Floor gap is radial floor minus substrate/surface, not proof of a missing rendered foundation. Overlap detection samples exact transformed footprints and is conservative at 0.35 m resolution.',
    coastline: shoreline.filter((_, index) => index % 50 === 0).map(s => ({ x: round(s.x), z: round(s.z) })),
    findings: findings.map(building => ({ id: building.id, submergedSamples: building.submergedSamples, minCoastClearance: building.minCoastClearance, intersecting: building.intersecting })),
    dryFootprintFailures: dryFootprintFailures.map(building => building.id),
    spacingWarnings: spacingWarnings.map(building => ({ id: building.id, intersecting: building.intersecting })),
    buildings: results,
  };
  const reportPath = path.resolve(repository, process.env.WORLD_COAST_AUDIT_OUTPUT || 'docs/qa/globe-concept/coastal-layout.json');
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath, findings: report.findings, coastal: results.filter(building => ['surf-shack', 'coast-radio', 'beach-hut', 'arcade', 'pier-kiosk'].includes(building.id)) }, null, 2));
  // Attached sheds/carports are advisory. Dryness and the shore setback are asserted.
  if ((dryFootprintFailures.length || (process.env.WORLD_COAST_STRICT_SPACING && spacingWarnings.length)) && !process.env.WORLD_COAST_ALLOW_FINDINGS) process.exitCode = 1;
} finally {
  const resolved = path.resolve(output);
  if (path.dirname(resolved) !== artifacts || !path.basename(resolved).startsWith('coastal-audit-')) throw new Error('Unexpected audit artifact path');
  rmSync(resolved, { recursive: true, force: true });
}
