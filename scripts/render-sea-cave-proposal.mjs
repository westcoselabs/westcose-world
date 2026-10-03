import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Sea Caves approval drawings. Reads the world and the sea-cave and lighthouse data
 * (src/features/world/data/sea-cave-layout.ts, sea-cave.ts, lighthouse-tower.ts), samples
 * both, and writes:
 *   docs/design/sea-cave-approval/proposal.json  the sampled snapshot and its source fingerprint
 *   docs/design/sea-cave-approval/index.html     the drawing set (an Artifact-ready page)
 * Nothing in src/ is written. Before the caves were built the world was sampled as "current"
 * and the proposal applied on top of it; now that the world includes them, the "current"
 * (before) state is carried over from the last snapshot, and "proposed" is the live world.
 * Run: node scripts/render-sea-cave-proposal.mjs
 */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = path.join(repository, 'src/features/world');
const destination = path.join(repository, 'docs/design/sea-cave-approval');
const require = createRequire(import.meta.url);

const previousTsHandler = require.extensions['.ts'];
const loaded = new Set();
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
  loaded.add(relative.replaceAll('\\', '/'));
  module._compile(compiled.outputText, filename);
};

let previous = null;
try { previous = JSON.parse(readFileSync(path.join(destination, 'proposal.json'), 'utf8')); } catch { /* first render */ }
let snapshot;
try {
  const load = name => require(path.join(world, 'data', `${name}.ts`));
  const map = load('world-map'), surfaces = load('town-surfaces'), downtown = load('downtown-layout');
  const cave = load('sea-cave'), layout = load('sea-cave-layout'), tower = load('lighthouse-tower');
  const town = load('town-layout'), peninsula = load('peninsula-layout'), props = load('town-props');
  const F = cave.SEA_CAVE_FRAME;
  /** Built: the live world already carries the caves, and the old tunnel data is gone. */
  const built = peninsula.PLACED_CAVE_POINTS === undefined;
  assert.ok(!built || previous?.grid?.current, 'The before state comes from the last snapshot once the caves are built');
  const r2 = n => Math.round(n * 100) / 100;
  const localOf = ([x, z]) => { const p = F.localAtChart(x, z); return [r2(p.u), r2(p.v)]; };
  // East edge of the town terrain region (scene/TownLandscape.tsx TERRAIN_REGIONS).
  const COVERAGE_X = -52 + .45 * 290;

  // --- Plan grid: current ground and the proposal, in local metres. --------------------
  const grid = { minU: -16, maxU: 32, minV: -8, maxV: 54, step: .5 };
  const columns = Math.round((grid.maxU - grid.minU) / grid.step) + 1, rows = Math.round((grid.maxV - grid.minV) / grid.step) + 1;
  const zoneIndex = Object.keys(cave.SEA_CAVE_ZONE_NAMES);
  const current = [], proposed = [], sdf = [], zone = [], floor = [], ceiling = [], flags = [];
  let maxProposedX = -Infinity;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const u = grid.minU + i * grid.step, v = grid.minV + j * grid.step, c = F.chart(u, v);
    const surface = surfaces.townSurfaceAt(c.x, c.z), k = current.length;
    const h0 = built ? previous.grid.current[k] / 100 : surface.height;
    const h1 = built ? surface.height : cave.seaCaveTerrainLocal(u, v, h0), sample = cave.seaCaveLocal(u, v);
    assert.ok(Number.isFinite(h0) && Number.isFinite(h1), `Non-finite terrain at ${u},${v}`);
    if ((built ? cave.seaCaveMassifWeightAt(c.x, c.z) > 0 || sample.sdf < layout.SEA_CAVE_WALL_OFFSET + 2.4 : h1 > h0 + .02) && h1 > map.MAP_SEA_LEVEL) maxProposedX = Math.max(maxProposedX, c.x);
    current.push(Math.round(h0 * 100)); proposed.push(Math.round(h1 * 100));
    sdf.push(Math.round(Math.max(-9.99, Math.min(9.99, sample.sdf)) * 100));
    zone.push(zoneIndex.indexOf(sample.zone));
    floor.push(Math.round(sample.floor * 100)); ceiling.push(Math.round(sample.ceiling * 100));
    // 1 paved downtown, 2 lighthouse trail, 4 beyond the terrain coverage limit.
    flags.push((downtown.downtownKindAt(c.x, c.z) ? 1 : 0) | (surface.route === 'lighthouse-trail' ? 2 : 0) | (c.x > COVERAGE_X ? 4 : 0));
  }

  // --- Overlays. -----------------------------------------------------------------------
  const trail = town.TOWN_ROUTES.find(route => route.id === 'lighthouse-trail');
  const mainCul = downtown.CUL_DE_SACS[0];
  const overlook = Array.from({ length: 31 }, (_, k) => localOf(Object.values(props.overlookPoint(props.OVERLOOK.from + (props.OVERLOOK.to - props.OVERLOOK.from) * k / 30))));
  const labelPoint = (u, v, text, kind = 'site') => ({ u, v, text, kind });
  const overlays = {
    trail: trail.points.map(localOf),
    // The proposal drops the trail's last point; it ends at the stair foot.
    trailEnd: localOf(trail.points.at(-2)),
    oldCave: built ? previous.overlays.oldCave : peninsula.PLACED_CAVE_POINTS.map(localOf),
    oldCaveWidth: built ? previous.overlays.oldCaveWidth : peninsula.PENINSULA_CAVE.width,
    overlook,
    culDeSac: { center: localOf(mainCul.center), name: mainCul.name },
    mouth: layout.SEA_CAVE_MOUTH, window: layout.SEA_CAVE_WINDOW, arena: layout.SEA_CAVE_ARENA,
    pillars: layout.SEA_CAVE_PILLARS, chambers: layout.SEA_CAVE_CHAMBERS, passages: layout.SEA_CAVE_PASSAGES,
    footprint: layout.SEA_CAVE_MASSIF.footprint.map(([u, v]) => [u, v]),
    labels: [
      labelPoint(-12.5, 28.5, mainCul.name, 'town'), labelPoint(-12.5, 47.5, downtown.CUL_DE_SACS[1].name, 'town'),
      labelPoint(-13, -4.5, 'Public beach', 'site'), labelPoint(27, 6, 'Open sea', 'sea'), labelPoint(-6.5, 14, 'Trail', 'site'),
    ],
  };

  // --- Sections. -----------------------------------------------------------------------
  const ground = (u, v) => { const c = F.chart(u, v); return surfaces.townSurfaceAt(c.x, c.z).height; };
  /** Before the build, the proposal is the world plus the caves; after, it is the world. */
  const proposedGround = (u, v, h) => built ? h : cave.seaCaveTerrainLocal(u, v, h);
  function section(points, step = .2) {
    const out = [];
    let s = 0;
    for (let k = 0; k < points.length - 1; k++) {
      const [au, av] = points[k], [bu, bv] = points[k + 1], length = Math.hypot(bu - au, bv - av), n = Math.max(1, Math.ceil(length / step));
      for (let q = k === 0 ? 0 : 1; q <= n; q++) {
        const t = q / n, u = au + (bu - au) * t, v = av + (bv - av) * t, h0 = ground(u, v), sample = cave.seaCaveLocal(u, v);
        const open = sample.sdf <= layout.SEA_CAVE_WALL_OFFSET;
        // Outside the mouth the apron is open air: its roof is the sky, not the profile.
        const h1 = proposedGround(u, v, h0), roof = Math.min(sample.ceiling, h1);
        out.push([r2(s + length * t), r2(h0), r2(h1), open ? r2(sample.floor) : null, open ? r2(roof) : null, open ? zoneIndex.indexOf(sample.zone) : -1]);
      }
      s += length;
    }
    return out;
  }
  const passage = id => layout.SEA_CAVE_PASSAGES.find(p => p.id === id).points;
  const chamber = id => layout.SEA_CAVE_CHAMBERS.find(c => c.id === id).center;
  const longPath = [...passage('tunnel'), chamber('undercroft'), ...passage('crawl'), chamber('grotto'), chamber('window'), layout.SEA_CAVE_WINDOW.center, [31, 27.9]];
  const sections = {
    long: { title: 'Long section: beach mouth to the Ocean Window', path: longPath, samples: section(longPath) },
    tunnel: { title: 'A. Tunnel beneath the lighthouse', path: [[-1.3, -6.5], [.3, 7.5]], samples: section([[-1.3, -6.5], [.3, 7.5]]) },
    crawlSlot: { title: 'B. The Crawl and the Slot', path: [[-6, 13], [22, 13]], samples: section([[-6, 13], [22, 13]]) },
    grotto: { title: 'C. Grotto, Twin Arches and Tide Pool', path: [[14, 13.5], [14, 50]], samples: section([[14, 13.5], [14, 50]]) },
  };
  // Built: today's ground (the dashed line) is the snapshot's, where the sampling matches.
  if (built) for (const [id, current] of Object.entries(sections)) {
    const before = previous.sections?.[id]?.samples;
    current.samples = current.samples.map((sample, k) => [sample[0], before && before.length === current.samples.length ? before[k][1] : null, ...sample.slice(2)]);
  }

  // --- What the Cliff Cul-de-sac overlook sees (current and proposed skylines). --------
  const eyeChart = props.overlookPoint(18, props.OVERLOOK.radius - .55), eyeLocal = F.localAtChart(eyeChart.x, eyeChart.z);
  const eyeHeight = downtown.WALK_LEVEL + 1.6, R = map.MAP_RADIUS;
  const skyline = [];
  for (let az = -80; az <= 110; az += 1) {
    // Highest dry land in each direction (sea surface excluded): where it stays below the
    // sea horizon, open water reaches the horizon.
    let a0 = -90, a1 = -90;
    for (let d = .8; d <= 90; d += .25) {
      const u = eyeLocal.u + d * Math.cos(az * Math.PI / 180), v = eyeLocal.v + d * Math.sin(az * Math.PI / 180);
      const h0 = ground(u, v), h1 = proposedGround(u, v, h0);
      const phi = d / R, angle = h => Math.atan2((R + h) * Math.cos(phi) - (R + eyeHeight), (R + h) * Math.sin(phi)) * 180 / Math.PI;
      if (h0 > map.MAP_SEA_LEVEL + .05) a0 = Math.max(a0, angle(h0));
      if (h1 > map.MAP_SEA_LEVEL + .05) a1 = Math.max(a1, angle(h1));
    }
    skyline.push([az, built ? previous.panorama.skyline.find(row => row[0] === az)?.[1] ?? r2(a0) : r2(a0), r2(a1)]);
  }
  const horizon = -Math.acos((R + map.MAP_SEA_LEVEL) / (R + eyeHeight)) * 180 / Math.PI;
  const bearing = (u, v) => r2(Math.atan2(v - eyeLocal.v, u - eyeLocal.u) * 180 / Math.PI);
  const panorama = { eye: [r2(eyeLocal.u), r2(eyeLocal.v)], eyeHeight: r2(eyeHeight), horizon: r2(horizon), skyline,
    marks: [{ az: bearing(0, 0), text: 'Lighthouse' }, { az: bearing(...layout.SEA_CAVE_WINDOW.center), text: 'Window' }, { az: bearing(...layout.SEA_CAVE_ARENA.center), text: 'Grotto' }] };

  // --- Lighthouse stair variants. ------------------------------------------------------
  const T = tower.LIGHTHOUSE_TOWER;
  const stairVariant = turns => {
    let run = 0, inner = 0;
    const at = f => { const h = f * tower.STAIR_RISE, ri = tower.towerRadiusAt(h); return { h, ri, az: (T.stair.start + T.stair.spin * f * turns * 360) * Math.PI / 180 }; };
    for (let k = 0; k < 600; k++) {
      const a = at(k / 600), b = at((k + 1) / 600), ra = a.ri + T.stair.width / 2, rb = b.ri + T.stair.width / 2;
      run += Math.hypot(rb * Math.cos(b.az) - ra * Math.cos(a.az), rb * Math.sin(b.az) - ra * Math.sin(a.az));
      inner += Math.hypot((b.ri + .31) * Math.cos(b.az) - (a.ri + .31) * Math.cos(a.az), (b.ri + .31) * Math.sin(b.az) - (a.ri + .31) * Math.sin(a.az));
    }
    return { turns, run: r2(run), slope: r2(Math.atan2(tower.STAIR_RISE, run) * 180 / Math.PI), innerSlope: r2(Math.atan2(tower.STAIR_RISE, inner) * 180 / Math.PI),
      runStepRise: r2(tower.STAIR_RISE / inner * .13), hatch: r2((T.stair.headroom + T.balcony.slab) / tower.STAIR_RISE * turns * 360),
      gap: r2(tower.STAIR_RISE / turns) };
  };
  const lighthouse = { tower: T, rise: tower.STAIR_RISE, variants: [1, 1.5, 2].map(stairVariant), oldHeight: built ? previous.lighthouse.oldHeight : peninsula.PENINSULA_LIGHTHOUSE.height };

  // --- Key numbers. --------------------------------------------------------------------
  let minClear = Infinity, minCover = Infinity, area = 0, arenaClear = true;
  for (let u = -14; u <= 31; u += .25) for (let v = -4; v <= 52; v += .25) {
    const sample = cave.seaCaveLocal(u, v), portal = cave.seaCavePortalAt(u, v), face = cave.seaCaveWindowAt(u, v);
    if (sample.sdf <= 0) {
      area += .0625; minClear = Math.min(minClear, sample.ceiling - sample.floor);
      if (Math.hypot(u - layout.SEA_CAVE_ARENA.center[0], v - layout.SEA_CAVE_ARENA.center[1]) < layout.SEA_CAVE_ARENA.radius && Math.abs(sample.floor - layout.SEA_CAVE_CHAMBERS[1].floor) > .2) arenaClear = false;
    } else if (Math.hypot(u - layout.SEA_CAVE_ARENA.center[0], v - layout.SEA_CAVE_ARENA.center[1]) < layout.SEA_CAVE_ARENA.radius) arenaClear = false;
    const nearWindow = face.out > -3 && Math.abs(face.across) < layout.SEA_CAVE_WINDOW.halfWidth + 2;
    if (sample.sdf <= layout.SEA_CAVE_WALL_OFFSET && portal.s > 1.5 && !nearWindow) minCover = Math.min(minCover, proposedGround(u, v, ground(u, v)) - sample.ceiling);
  }
  const grotto = layout.SEA_CAVE_CHAMBERS.find(c => c.id === 'grotto'), stair = stairVariant(T.stair.turns);
  const numbers = {
    caveArea: Math.round(area), minClear: r2(minClear), minCover: r2(minCover), arenaClear,
    grottoSize: [grotto.radii[0] * 2, grotto.radii[1] * 2], grottoCrown: grotto.crown, windowWidth: layout.SEA_CAVE_WINDOW.halfWidth * 2,
    windowSill: layout.SEA_CAVE_WINDOW.sill, windowAboveSea: r2(layout.SEA_CAVE_WINDOW.sill - map.MAP_SEA_LEVEL),
    maxProposedX: r2(maxProposedX), coverageX: COVERAGE_X, towerTop: r2(T.terrace + T.finial), galleryAbs: r2(T.terrace + T.gallery),
    stairSlope: stair.slope, panoramaHorizon: r2(horizon),
  };

  const sources = [...loaded].sort();
  const hash = createHash('sha256');
  for (const relative of sources) { hash.update(relative); hash.update(readFileSync(path.join(world, relative))); }
  snapshot = {
    generatedBy: 'scripts/render-sea-cave-proposal.mjs', frame: 'local metres, origin on the lighthouse axis, u east, v north',
    sourceFingerprint: hash.digest('hex'), sources, zones: zoneIndex.map(id => cave.SEA_CAVE_ZONE_NAMES[id]), built,
    grid: { ...grid, columns, rows, current, proposed, sdf, zone, floor, ceiling, flags },
    overlays, sections, panorama, lighthouse, numbers, wallOffset: layout.SEA_CAVE_WALL_OFFSET, seaLevel: map.MAP_SEA_LEVEL,
  };
} finally {
  require.extensions['.ts'] = previousTsHandler;
}

mkdirSync(destination, { recursive: true });
writeFileSync(path.join(destination, 'proposal.json'), `${JSON.stringify(snapshot)}\n`);
const template = readFileSync(path.join(destination, 'template.html'), 'utf8');
const page = template.replace('/*PROPOSAL_DATA*/null', JSON.stringify(snapshot));
assert.notEqual(page, template, 'template.html must contain the /*PROPOSAL_DATA*/null placeholder');
writeFileSync(path.join(destination, 'index.html'), page);
console.log(JSON.stringify({ written: ['proposal.json', 'index.html'].map(file => path.join('docs/design/sea-cave-approval', file)), fingerprint: snapshot.sourceFingerprint, numbers: snapshot.numbers }, null, 1));
