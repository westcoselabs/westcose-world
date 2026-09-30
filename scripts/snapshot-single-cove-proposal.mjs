import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Read the CURRENT source into an approval-drawing snapshot. No app/source,
 * Next build output, module sidecar or live-browser state is written. The only
 * generated file is docs/design/single-cove-approval/current-world.json.
 */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = path.join(repository, 'src/features/world');
const destination = path.join(repository, 'docs/design/single-cove-approval/current-world.json');
const require = createRequire(import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const filesBelow = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const round = number => Number(number.toFixed(3));
const xy = point => [round(point.x), round(point.z)];
const polygonPath = points => points.length ? `M${points.map(point => point.join(',')).join('L')}Z` : '';

function sourceSnapshot() {
  const hash = createHash('sha256'), fileHashes = {};
  for (const file of filesBelow(world).sort()) {
    const relative = path.relative(world, file), bytes = readFileSync(file);
    // Preserve the exact fingerprint convention used by the verified world
    // captures: native relative path followed by raw bytes, sorted by file.
    hash.update(relative); hash.update(bytes);
    fileHashes[relative.replaceAll('\\', '/')] = sha256(bytes);
  }
  return { fingerprint: hash.digest('hex'), fileHashes };
}

function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [], upper = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of sorted.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const before = sourceSnapshot();
const previousTsHandler = require.extensions['.ts'];
const loadedSourceModules = new Set();
let snapshot;
try {
  // CommonJS compilation is entirely in memory. Node resolves extensionless
  // relative imports through this temporary process-local .ts handler.
  require.extensions['.ts'] = (module, filename) => {
    const relative = path.relative(world, filename);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Only world TypeScript modules may be compiled');
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      reportDiagnostics: true,
    });
    const errors = compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
    assert.equal(errors.length, 0, errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
    loadedSourceModules.add(relative.replaceAll('\\', '/'));
    module._compile(compiled.outputText, filename);
  };
  const load = name => require(path.join(world, 'data', `${name}.ts`));
  const map = load('world-map'), town = load('town-layout'), ground = load('town-surfaces');
  const pier = load('pier-layout'), landmarks = load('concept-landmarks');
  const peninsula = load('peninsula-layout'), cliffs = load('peninsula-cliffs');
  const { buildingLocalPoint } = load('building-shapes');

  const grid = { minX: -42, maxX: 52, minZ: -48, maxZ: 176, step: 1,
    sampling: '1m cells within half-open bounds; groundSurfaceAt sampled at each cell center. SVG paths use unmodified x,z coordinates, so z increases inland/up only after the drawing transform.' };
  const columns = (grid.maxX - grid.minX) / grid.step, rows = (grid.maxZ - grid.minZ) / grid.step;
  const names = ['sand', 'land', 'rock', 'high'];
  const labels = Array.from({ length: rows }, () => Array(columns).fill(null));
  const counts = { water: 0, sand: 0, land: 0, rock: 0, high: 0 };
  const paths = Object.fromEntries(names.map(name => [name, '']));
  const rectangles = Object.fromEntries(names.map(name => [name, 0]));
  let minimumHeight = Infinity, maximumHeight = -Infinity;
  const dryBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = grid.minX + (column + .5) * grid.step, z = grid.minZ + (row + .5) * grid.step;
    const height = ground.groundSurfaceAt(x, z).height;
    assert.ok(Number.isFinite(height), `Non-finite current terrain at [${x},${z}]`);
    minimumHeight = Math.min(minimumHeight, height); maximumHeight = Math.max(maximumHeight, height);
    const label = height <= map.MAP_SEA_LEVEL ? null : height < .35 ? 'sand' : height < 3 ? 'land' : height < 8 ? 'rock' : 'high';
    labels[row][column] = label; counts[label ?? 'water']++;
    if (label) {
      dryBounds.minX = Math.min(dryBounds.minX, x); dryBounds.maxX = Math.max(dryBounds.maxX, x);
      dryBounds.minZ = Math.min(dryBounds.minZ, z); dryBounds.maxZ = Math.max(dryBounds.maxZ, z);
    }
  }

  // Horizontal run-length rectangles; each height class is one compact SVG d.
  for (let row = 0; row < rows; row++) {
    let start = 0;
    while (start < columns) {
      const label = labels[row][start]; let end = start + 1;
      while (end < columns && labels[row][end] === label) end++;
      if (label) {
        const x = grid.minX + start * grid.step, z = grid.minZ + row * grid.step, width = (end - start) * grid.step;
        paths[label] += `M${x},${z}h${width}v${grid.step}h${-width}Z`; rectangles[label]++;
      }
      start = end;
    }
  }

  // Merge collinear water/land cell edges. Height-band boundaries are excluded:
  // this path describes only the CURRENT sampled coastline, not the proposal.
  const horizontal = new Map(), vertical = new Map();
  const addEdge = (collection, fixed, along) => {
    if (!collection.has(fixed)) collection.set(fixed, []);
    collection.get(fixed).push(along);
  };
  const isDry = (row, column) => row >= 0 && row < rows && column >= 0 && column < columns && labels[row][column] !== null;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (!isDry(row, column)) continue;
    const x = grid.minX + column * grid.step, z = grid.minZ + row * grid.step;
    if (!isDry(row - 1, column)) addEdge(horizontal, z, x);
    if (!isDry(row + 1, column)) addEdge(horizontal, z + grid.step, x);
    if (!isDry(row, column - 1)) addEdge(vertical, x, z);
    if (!isDry(row, column + 1)) addEdge(vertical, x + grid.step, z);
  }
  let coastlinePath = '', coastlineRuns = 0;
  for (const [collection, orientation] of [[horizontal, 'h'], [vertical, 'v']]) {
    for (const [fixed, values] of [...collection].sort((a, b) => a[0] - b[0])) {
      values.sort((a, b) => a - b);
      for (let start = 0; start < values.length;) {
        let end = start + 1;
        while (end < values.length && values[end] === values[end - 1] + grid.step) end++;
        const length = values[end - 1] + grid.step - values[start];
        const point = orientation === 'h' ? [values[start], fixed] : [fixed, values[start]];
        coastlinePath += `M${point.join(',')}${orientation}${length}`; coastlineRuns++;
        start = end;
      }
    }
  }

  const headNorth = pier.PIER_LAYOUT.head.center[1] + pier.PIER_LAYOUT.head.depth / 2;
  const tipZ = pier.PIER_LAYOUT.head.center[1] - pier.PIER_LAYOUT.head.depth / 2;
  const halfNeck = pier.PIER_LAYOUT.width / 2, halfHead = pier.PIER_LAYOUT.head.width / 2;
  const pierOutline = [[-halfNeck, pier.PIER_LAYOUT.approach.start[1]], [-halfNeck, headNorth], [-halfHead, headNorth],
    [-halfHead, tipZ], [halfHead, tipZ], [halfHead, headNorth], [halfNeck, headNorth], [halfNeck, pier.PIER_LAYOUT.approach.start[1]]]
    .map(([across, z]) => xy(pier.pierChartAt(across, z)));
  const buildingFootprints = town.TOWN_BUILDINGS.map(building => {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => xy(map.mapCoordinates(
      buildingLocalPoint(building, [x * building.width / 2, 0, z * building.depth / 2]))));
    return { id: building.id, points: corners, path: polygonPath(corners) };
  });
  const cliffFootprints = cliffs.peninsulaCliffWedges.map(wedge => {
    const points = convexHull(wedge.vertices.map(vertex => xy(map.mapCoordinates(vertex))));
    return { id: wedge.id, color: wedge.color, points, path: polygonPath(points) };
  });
  snapshot = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'Current live layout only; proposed single-cove geometry has not been applied.',
    source: { ...before, root: 'src/features/world', fingerprintMethod: 'SHA256 of sorted native relative paths followed by raw file bytes; same convention as current-world captures.',
      loadMethod: 'Process-local TypeScript transpileModule + module._compile, entirely in memory; no compiled files or app writes.',
      loadedModules: [...loadedSourceModules].sort(), unchanged: false },
    map: { radius: map.MAP_RADIUS, seaLevel: map.MAP_SEA_LEVEL, maxHeight: map.MAP_MAX_HEIGHT, summit: map.MAP_SUMMIT,
      circumference: map.MAP_CIRCUMFERENCE, seam: map.MAP_SEAM, minZ: map.MAP_MIN_Z, maxZExclusive: map.MAP_SEAM,
      minX: -Math.PI * map.MAP_RADIUS / 2, maxX: Math.PI * map.MAP_RADIUS / 2,
      projection: '(sin(x/R), cos(x/R)*sin(z/R), cos(x/R)*cos(z/R))',
      metricNote: 'Chart x/z are not uniformly physical metres. Use mapMetric or projected actual geometry; z scale is cos(x/R)*(R+height)/R.' },
    buildings: town.TOWN_BUILDINGS, buildingFootprints, areas: town.TOWN_AREAS, routes: town.TOWN_ROUTES,
    pier: { ...pier.PIER_LAYOUT, tip: [pier.PIER_LAYOUT.entrance[0], tipZ], outline: pierOutline, path: polygonPath(pierOutline) },
    skate: { center: landmarks.SKATE_CENTER, elevation: landmarks.SKATE_ELEVATION, size: landmarks.SKATE_SIZE, stairs: landmarks.SKATE_STAIRS },
    artWalls: landmarks.ART_WALLS,
    peninsula: { lighthouse: peninsula.PENINSULA_LIGHTHOUSE, cave: peninsula.PENINSULA_CAVE, cove: peninsula.PENINSULA_COVE,
      coast: peninsula.PENINSULA_COAST, sand: peninsula.PENINSULA_SAND, cap: peninsula.PENINSULA_CAP,
      terrace: peninsula.PENINSULA_TERRACE, upper: peninsula.PENINSULA_UPPER,
      cliffRim: cliffs.PENINSULA_CLIFF_RIM, cliffFootprints },
    terrain: { grid: { ...grid, columns, rows, sampleCount: columns * rows },
      classes: { sand: { minimumExclusive: map.MAP_SEA_LEVEL, maximumExclusive: .35 }, land: { minimum: .35, maximumExclusive: 3 },
        rock: { minimum: 3, maximumExclusive: 8 }, high: { minimum: 8 } },
      classNote: 'Height classes, not proposed art/materials; sand also includes low paved ground. Water at/below sea level is omitted.',
      paths, rectangles, counts, coastlinePath, coastlineRuns, drySampleBounds: dryBounds,
      heightRange: { minimum: minimumHeight, maximum: maximumHeight },
      note: 'Upper ground only. Draw the physical pier, actual cliff footprints and lower tunnel separately; this underlay must not be replaced by proposed coast geometry.' },
  };
} finally {
  if (previousTsHandler) require.extensions['.ts'] = previousTsHandler;
  else delete require.extensions['.ts'];
}

const after = sourceSnapshot();
assert.equal(after.fingerprint, before.fingerprint, 'World source changed while sampling; refusing to publish a mixed snapshot');
assert.deepEqual(after.fileHashes, before.fileHashes, 'World file inventory changed while sampling');
snapshot.source.unchanged = true;
snapshot.source.fingerprintAfter = after.fingerprint;
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify({ file: destination, sourceFingerprint: before.fingerprint, sourceFiles: Object.keys(before.fileHashes).length,
  samples: snapshot.terrain.grid.sampleCount, counts: snapshot.terrain.counts, rectangleCount: snapshot.terrain.rectangles,
  coastlineRuns: snapshot.terrain.coastlineRuns, sourceUnchanged: snapshot.source.unchanged }));
