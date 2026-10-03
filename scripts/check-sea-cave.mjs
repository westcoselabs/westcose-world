import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

/** The Sea Caves and the climbable lighthouse: the analytic volume, walking, fall-proofing,
 * camera, the stair and balcony, the cut openings and the baked cave mesh. Compiles the real
 * world modules into a disposable folder, like check-planet. Run: npm run test:seacave */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repository, '.next');
mkdirSync(artifactRoot, { recursive: true });
const output = mkdtempSync(path.join(artifactRoot, 'sea-cave-check-'));

try {
  const modules = ['data', 'runtime'].flatMap(directory => readdirSync(path.join(repository, 'src/features/world', directory))
    .filter(file => file.endsWith('.ts')).map(file => `${directory}/${file}`)).concat('scene/TownLandscape.tsx', 'scene/lighting-anchors.ts');
  for (const relative of modules) {
    const source = path.join(repository, 'src/features/world', relative);
    const result = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    const errors = result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
    assert.equal(errors.length, 0, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
    const target = path.join(output, relative.replace(/\.tsx?$/, '.js'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, result.outputText);
  }
  const require = createRequire(import.meta.url);
  const load = name => require(path.join(output, `${name}.js`));
  const map = load('data/world-map'), planet = load('data/planet'), collision = load('runtime/planet-collision');
  const cave = load('data/sea-cave'), layout = load('data/sea-cave-layout'), openings = load('data/sea-cave-openings');
  const caveMesh = load('data/sea-cave-mesh'), tower = load('data/lighthouse-tower'), surfaces = load('data/town-surfaces');
  const downtown = load('data/downtown-layout'), town = load('data/town-layout'), hotspots = load('data/hotspots');
  const anchors = load('scene/lighting-anchors'), runtimeTypes = load('runtime/types');
  const { makeTerrainPartition, makeTerrain, TERRAIN_REGIONS } = load('scene/TownLandscape');
  const { Mesh, MeshBasicMaterial, Raycaster, DoubleSide, Vector3 } = require('three');

  const F = cave.SEA_CAVE_FRAME, R = map.MAP_RADIUS, SEA = map.MAP_SEA_LEVEL, FACE = layout.SEA_CAVE_WALL_OFFSET;
  const CENTER = runtimeTypes.PLAYER_CENTER_HEIGHT;
  const B = cave.SEA_CAVE_LOCAL_BOUNDS;
  const ground = (u, v) => { const c = F.chart(u, v); return surfaces.groundSurfaceAt(c.x, c.z).height; };
  const each = (step, visit) => { for (let u = B.minU; u <= B.maxU; u += step) for (let v = B.minV; v <= B.maxV; v += step) visit(u, v); };
  const random = (() => { let seed = 1234567; return () => (seed = (seed * 16807) % 2147483647) / 2147483647; })();
  const nearWindow = (u, v) => { const face = cave.seaCaveWindowAt(u, v); return face.out > -3 && Math.abs(face.across) < layout.SEA_CAVE_WINDOW.halfWidth + 2; };
  const nearMouth = (u, v) => cave.seaCavePortalAt(u, v).s < 1.6;
  const passage = id => layout.SEA_CAVE_PASSAGES.find(p => p.id === id);
  const chamber = id => layout.SEA_CAVE_CHAMBERS.find(c => c.id === id);

  /** Walk local waypoints with the real movement step, carrying foot and layer like the
   * controller. Returns blocked steps, the layers seen and the end state. */
  function walk(points, { layer = 'upper', elevation, step = .13, maxBlocked = 40 } = {}) {
    let up = F.direction(...points[0]);
    let support = collision.supportAt(up, { layer, footRadius: elevation === undefined ? undefined : R + elevation });
    let foot = support.radius, current = support.layer, blocked = 0, rise = 0, drop = 0, water = false;
    const layers = new Set([current]), zones = new Set();
    for (let k = 1; k < points.length; k++) for (let n = 0; n < 800; n++) {
      const here = F.local(up), [tu, tv] = points[k], du = tu - here.u, dv = tv - here.v, d = Math.hypot(du, dv);
      if (d < .18) break;
      const t = F.tangents(here.u, here.v), direction = t.east.multiplyScalar(du / d).addScaledVector(t.north, dv / d);
      const moved = collision.moveOnSurface(up, direction, Math.min(step, d), foot, current);
      if (moved.distance === 0) { if (++blocked > maxBlocked) return { ok: false, blocked, at: here, foot: foot - R, layer: current, layers, zones, rise, drop, water }; continue; }
      up = moved.up;
      support = collision.supportAt(up, { footRadius: foot, layer: moved.support.layer });
      rise = Math.max(rise, support.radius - foot); drop = Math.max(drop, foot - support.radius);
      foot = support.radius; current = support.layer; layers.add(current);
      if (support.kind === 'water') water = true;
      if (support.id?.startsWith('cave:')) zones.add(support.id.slice(5));
    }
    const end = F.local(up);
    return { ok: true, blocked, end, foot: foot - R, layer: current, layers, zones, rise, drop, water };
  }
  /** Push from a start in one direction for a number of steps; report where it ended up. */
  function push(start, direction, steps, { layer = 'tunnel', elevation } = {}) {
    let up = F.direction(...start);
    let support = collision.supportAt(up, { layer, footRadius: elevation === undefined ? undefined : R + elevation });
    let foot = support.radius, current = support.layer, minFoot = foot, water = false;
    for (let n = 0; n < steps; n++) {
      const here = F.local(up), t = F.tangents(here.u, here.v);
      const moved = collision.moveOnSurface(up, t.east.multiplyScalar(direction[0]).addScaledVector(t.north, direction[1]).normalize(), .13, foot, current);
      up = moved.up;
      support = collision.supportAt(up, { footRadius: foot, layer: moved.support.layer });
      foot = support.radius; current = support.layer; minFoot = Math.min(minFoot, foot);
      if (support.kind === 'water') water = true;
    }
    return { end: F.local(up), foot: foot - R, minFoot: minFoot - R, layer: current, water };
  }

  await test('the plan keeps headroom, width, dry floors and rock cover everywhere', () => {
    let minClear = Infinity, minCrawl = Infinity, minFloor = Infinity, maxSlope = 0, minCover = Infinity, coverAt = null, walkable = 0;
    each(.25, (u, v) => {
      const s = cave.seaCaveLocal(u, v);
      if (s.sdf <= 0) {
        walkable++;
        minClear = Math.min(minClear, s.ceiling - s.floor);
        if (s.zone === 'crawl') minCrawl = Math.min(minCrawl, s.ceiling - s.floor);
        if (cave.seaCavePortalAt(u, v).s > 0) minFloor = Math.min(minFloor, s.floor);
        const e = cave.seaCaveLocal(u + .25, v), n = cave.seaCaveLocal(u, v + .25);
        if (e.sdf <= 0 && n.sdf <= 0) maxSlope = Math.max(maxSlope, Math.atan(Math.hypot(e.floor - s.floor, n.floor - s.floor) / .25) * 180 / Math.PI);
      }
      if (s.sdf <= FACE && !nearMouth(u, v) && !nearWindow(u, v)) {
        const cover = ground(u, v) - s.ceiling;
        if (cover < minCover) { minCover = cover; coverAt = [u, v, s.zone]; }
      }
    });
    assert.ok(walkable * .0625 > 350, `The caves are a real system, not a corridor: ${walkable * .0625}m²`);
    assert.ok(minClear >= 2.8, `Clear height everywhere walkable: ${minClear}`);
    assert.ok(minCrawl >= 2.8 && minCrawl < 3.4, `The Crawl is low but camera-safe: ${minCrawl}`);
    assert.ok(minFloor >= SEA + .7, `Floors stay dry above the sea: ${minFloor}`);
    assert.ok(maxSlope <= 35, `No floor is steeper than a ramp: ${maxSlope}°`);
    assert.ok(minCover >= layout.SEA_CAVE_COVER, `Rock cover over every roof: ${minCover} at ${coverAt}`);
    // The Slot is narrow but always passable along its centreline.
    for (const [u, v] of passage('slot').points) assert.ok(cave.seaCaveLocal(u, v).sdf < -.2, `The Slot stays open at ${u},${v}`);
  });

  await test('the headland stays clear of the town, the trail and the terrain edge', () => {
    const coverageX = Math.max(...TERRAIN_REGIONS.filter(r => r.id === 'town').map(r => r.x0 + r.columns * r.step));
    let maxX = -Infinity, town = 0, trail = 0;
    each(.5, (u, v) => {
      const c = F.chart(u, v), s = surfaces.townSurfaceAt(c.x, c.z), headland = cave.seaCaveMassifWeightAt(c.x, c.z);
      // Ground the caves shape: the headland itself, or the rock cover round the rooms.
      if (headland === 0 && cave.seaCaveLocal(u, v).sdf > FACE + 2.4) return;
      if (s.height > SEA + .05) maxX = Math.max(maxX, c.x);
      if (headland > 0 && downtown.downtownKindAt(c.x, c.z)) town++;
      if (headland > 0 && s.route === 'lighthouse-trail') trail++;
    });
    assert.ok(maxX < coverageX - 1, `The cliffs stay inside the drawn terrain: ${maxX} < ${coverageX}`);
    assert.equal(town, 0, 'No headland on any street or sidewalk');
    assert.equal(trail, 0, 'No headland on the lighthouse trail');
  });

  await test('the Grotto keeps a flat, clear arena disc for the future game', () => {
    const { center, radius } = layout.SEA_CAVE_ARENA, grotto = chamber('grotto');
    for (let a = 0; a < 360; a += 6) for (let r = 0; r <= radius; r += .25) {
      const u = center[0] + r * Math.cos(a * Math.PI / 180), v = center[1] + r * Math.sin(a * Math.PI / 180), s = cave.seaCaveLocal(u, v);
      assert.ok(s.sdf <= 0 && Math.abs(s.floor - grotto.floor) < .2, `Arena disc clear at ${u.toFixed(1)},${v.toFixed(1)}`);
    }
  });

  await test('every room connects: mouth to window, round the Slot loop and the Twin Arches', () => {
    const tunnel = passage('tunnel').points, crawl = passage('crawl').points, slot = passage('slot').points;
    const inward = walk([[-13.6, 5.9], ...tunnel, chamber('undercroft').center, ...crawl, chamber('grotto').center, chamber('window').center]);
    assert.ok(inward.ok && inward.blocked < 5, `Beach to the window: ${JSON.stringify(inward)}`);
    assert.equal(inward.layer, 'tunnel'); assert.equal(inward.water, false);
    for (const zone of ['tunnel', 'undercroft', 'crawl', 'grotto', 'window']) assert.ok(inward.zones.has(zone), `Passed through ${zone}`);
    const outward = walk([chamber('grotto').center, ...[...slot].reverse(), chamber('undercroft').center, ...[...tunnel].reverse(), [-14, 6]], { layer: 'tunnel' });
    assert.ok(outward.ok && outward.blocked < 5 && outward.zones.has('slot'), `Back out through the Slot: ${JSON.stringify(outward)}`);
    assert.equal(outward.layer, 'upper', 'Out on the beach the outdoors takes over');
    const arches = walk([chamber('grotto').center, ...passage('arch-west').points, chamber('tidepool').center, ...[...passage('arch-east').points].reverse(), chamber('grotto').center], { layer: 'tunnel' });
    assert.ok(arches.ok && arches.blocked < 5 && arches.zones.has('arches') && arches.zones.has('tidepool'), `Twin Arches loop: ${JSON.stringify(arches)}`);
  });

  await test('nobody falls into the sea: the window lip and every wall hold', () => {
    const w = layout.SEA_CAVE_WINDOW, l = Math.hypot(...w.outward), out = [w.outward[0] / l, w.outward[1] / l];
    for (let k = 0; k < 40; k++) {
      const across = -w.halfWidth + .5 + (2 * w.halfWidth - 1) * k / 39;
      const start = [w.center[0] - out[1] * across - out[0] * 1.6, w.center[1] + out[0] * across - out[1] * 1.6];
      if (cave.seaCaveLocal(...start).sdf > 0) continue;
      const pushed = push(start, [out[0] + (random() - .5) * .6, out[1] + (random() - .5) * .6], 200);
      const s = cave.seaCaveLocal(pushed.end.u, pushed.end.v);
      assert.equal(pushed.layer, 'tunnel'); assert.equal(pushed.water, false);
      assert.ok(s.sdf <= .01, `Stayed on the ledge: sdf ${s.sdf}`);
      assert.ok(pushed.minFoot >= s.floor - .2 && pushed.foot > 2, `Never dropped off the lip: ${pushed.minFoot}`);
    }
    let pushes = 0;
    while (pushes < 220) {
      const u = B.minU + random() * (B.maxU - B.minU), v = B.minV + random() * (B.maxV - B.minV), s = cave.seaCaveLocal(u, v);
      if (s.sdf > -.2 || nearMouth(u, v)) continue;
      const angle = random() * Math.PI * 2, pushed = push([u, v], [Math.cos(angle), Math.sin(angle)], 90);
      assert.equal(pushed.water, false);
      if (pushed.layer === 'tunnel') assert.ok(cave.seaCaveLocal(pushed.end.u, pushed.end.v).sdf <= .01, `Rock held at ${pushed.end.u},${pushed.end.v}`);
      else assert.ok(cave.seaCavePortalAt(pushed.end.u, pushed.end.v).s < 0, `Only the mouth leads outdoors (${pushed.end.u},${pushed.end.v})`);
      pushes++;
    }
  });

  await test('walls slide instead of sticking, and a swimmer cannot climb in at the window', () => {
    // 45° into the Grotto's west wall keeps most of the stride.
    const grotto = chamber('grotto'), start = [grotto.center[0] - 5, grotto.center[1]];
    const pushed = push(start, [-Math.SQRT1_2, Math.SQRT1_2], 60);
    const travelled = Math.hypot(pushed.end.u - start[0], pushed.end.v - start[1]);
    assert.ok(travelled > .4 * 60 * .13, `Sliding keeps moving along the wall: ${travelled}`);
    const w = layout.SEA_CAVE_WINDOW, l = Math.hypot(...w.outward), sea = [w.center[0] + w.outward[0] / l * 4, w.center[1] + w.outward[1] / l * 4];
    const swim = walk([sea, chamber('window').center], { layer: 'upper', maxBlocked: 25 });
    assert.ok(!swim.layers.has('tunnel') && swim.foot < 1, `The sea cliff under the window is not climbable: ${JSON.stringify({ ok: swim.ok, foot: swim.foot })}`);
  });

  await test('the tunnel and the lighthouse terrace stack: hints keep each layer', () => {
    const direction = F.direction(0, .5);
    const upper = collision.supportAt(direction, { layer: 'upper', footRadius: R + 6.3 });
    const lower = collision.supportAt(direction, { layer: 'tunnel', footRadius: R });
    assert.equal(lower.layer, 'tunnel'); assert.ok(!lower.solid);
    assert.ok(upper.radius - lower.radius > 5, 'Terrace and tunnel are separate floors');
    assert.equal(collision.supportAt(direction).layer, 'upper', 'Without a hint, the outdoors');
  });

  await test('the camera never ends inside rock in the caves', () => {
    let samples = 0, crawlMin = Infinity;
    while (samples < 300) {
      const u = B.minU + random() * (B.maxU - B.minU), v = B.minV + random() * (B.maxV - B.minV), s = cave.seaCaveLocal(u, v);
      if (s.sdf > -.25 || nearMouth(u, v)) continue;
      const target = F.point(u, v, s.floor + CENTER + .55), up = target.clone().normalize();
      const t = F.tangents(u, v);
      for (let k = 0; k < 16; k++) for (const pitch of [.15, .35, .6]) {
        const angle = k / 16 * Math.PI * 2;
        const direction = t.east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(t.north, Math.sin(angle)).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
        const distance = collision.cameraClearDistance(target, direction, 4.8, null, 'tunnel');
        const end = target.clone().addScaledVector(direction, distance), local = F.local(end), there = cave.seaCaveLocal(local.u, local.v);
        const height = end.length() - R;
        const inVoid = there.sdf <= FACE + .05 && height >= there.floor - .2 && height <= there.ceiling + .2;
        const openAir = height > ground(local.u, local.v) + .1;
        assert.ok(inVoid || openAir || distance <= .7 + 1e-9, `Camera inside rock from ${u.toFixed(1)},${v.toFixed(1)}`);
        if (s.zone === 'crawl' && pitch === .15) crawlMin = Math.min(crawlMin, distance);
      }
      samples++;
    }
    assert.ok(crawlMin >= .7, `The Crawl keeps a usable camera: ${crawlMin}`);
  });

  await test('the lighthouse stair climbs to the balcony and back in every lane, with no falls', () => {
    const towerLocal = (x, y, z) => { const q = F.local(tower.lighthousePoint(x, y, z)); return [q.u, q.v]; };
    const balcony = azimuth => towerLocal(Math.cos(azimuth * Math.PI / 180) * 2.52, tower.LIGHTHOUSE_TOWER.gallery, -Math.sin(azimuth * Math.PI / 180) * 2.52);
    const top = tower.LIGHTHOUSE_TOWER.terrace + tower.LIGHTHOUSE_TOWER.gallery;
    for (const lateral of [-.42, 0, .42]) {
      const stair = [];
      for (let f = 0; f <= 1.0001; f += .01) { const p = tower.stairPoint(f, lateral); stair.push(towerLocal(p.x, p.y, p.z)); }
      const up = walk([[-3.4, 4.3], ...stair, balcony(-72)]);
      assert.ok(up.ok && up.blocked === 0, `Climb lane ${lateral}: ${JSON.stringify(up)}`);
      assert.ok(Math.abs(up.foot - top) < .15, `Arrives on the balcony: ${up.foot}`);
      assert.ok(up.rise <= collision.STEP_HEIGHT && up.drop < .05, `Smooth climb: rise ${up.rise}`);
      const down = walk([balcony(-72), ...[...stair].reverse(), [-3.4, 4.3]], { elevation: top });
      assert.ok(down.ok && down.blocked === 0 && down.drop <= .22, `Descent lane ${lateral}: drop ${down.drop}, blocked ${down.blocked}`);
    }
    // Outward pushes from the stair and the balcony never fall; inward ones meet the shaft.
    for (let k = 0; k < 16; k++) {
      const f = .1 + .85 * k / 15, p = tower.stairPoint(f, 0), start = towerLocal(p.x, p.y, p.z), rad = [Math.cos(p.azimuth * Math.PI / 180), Math.sin(p.azimuth * Math.PI / 180)];
      const out = push(start, rad, 40, { layer: 'upper', elevation: tower.LIGHTHOUSE_TOWER.terrace + p.height });
      assert.ok(out.minFoot > tower.LIGHTHOUSE_TOWER.terrace + p.height - 1, `Stair edge holds at ${f.toFixed(2)}: ${out.minFoot}`);
      const into = push(start, [-rad[0], -rad[1]], 30, { layer: 'upper', elevation: tower.LIGHTHOUSE_TOWER.terrace + p.height });
      assert.ok(tower.lighthouseLocal(F.point(into.end.u, into.end.v, into.foot)).radius > tower.towerRadiusAt(p.height), 'The shaft is solid');
    }
    for (let k = 0; k < 16; k++) {
      const azimuth = -180 + k * 22.5;
      if (tower.inHatch(azimuth)) continue;
      const out = push(balcony(azimuth), [Math.cos(azimuth * Math.PI / 180), Math.sin(azimuth * Math.PI / 180)], 40, { layer: 'upper', elevation: top });
      assert.ok(out.minFoot > top - 1, `Balcony rail holds at ${azimuth}°`);
    }
    // Under the stair's low end it is masonry; the hotspot is reached only up top.
    const low = tower.stairPoint(.06, 0), lowDirection = F.direction(...towerLocal(low.x, 0, low.z));
    assert.equal(collision.supportAt(lowDirection, { layer: 'upper', footRadius: R + tower.LIGHTHOUSE_TOWER.terrace }).solid, true);
    const note = hotspots.HOTSPOTS.find(h => h.id === 'beach'), notePoint = new Vector3(...note.position);
    const stand = tower.LIGHTHOUSE_GALLERY_STAND;
    const standPoint = map.mapDirection(stand.x, stand.z).multiplyScalar(R + stand.elevation + CENTER);
    assert.ok(standPoint.distanceTo(notePoint) < note.radius, 'The field note is in reach on the balcony');
    const belowPoint = notePoint.clone().normalize().multiplyScalar(R + tower.LIGHTHOUSE_TOWER.terrace + CENTER);
    assert.ok(belowPoint.distanceTo(notePoint) > note.radius + 10, 'and not from the terrace below');
  });

  await test('the camera never ends inside the tower, stair or balcony', () => {
    for (let k = 0; k < 40; k++) {
      const f = k / 39, p = tower.stairPoint(f, 0), foot = tower.lighthousePoint(p.x, p.y, p.z);
      const target = foot.clone().addScaledVector(foot.clone().normalize(), CENTER + .55), up = target.clone().normalize();
      for (let a = 0; a < 12; a++) {
        const angle = a / 12 * Math.PI * 2, t = F.tangents(...Object.values(F.local(target)));
        const direction = t.east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(t.north, Math.sin(angle)).multiplyScalar(Math.cos(.3)).addScaledVector(up, Math.sin(.3)).normalize();
        const distance = collision.cameraClearDistance(target, direction, 4.8, null, 'upper');
        const end = target.clone().addScaledVector(direction, distance);
        assert.ok(!tower.lighthouseCameraBlocked(end) || distance <= .7 + 1e-9, `Camera inside the tower from stair ${f.toFixed(2)}`);
      }
    }
  });

  await test('both openings are actually open through the drawn terrain', () => {
    const { localPatch, portal } = makeTerrainPartition('full');
    const coarse = makeTerrain('coarse');
    try {
      assert.ok(portal.getAttribute('position').count > 0, 'Seal panels close the cut edges');
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const meshes = [new Mesh(localPatch, material), new Mesh(coarse, material)];
      const ray = (from, to) => {
        const a = F.point(...from), b = F.point(...to), direction = b.clone().sub(a), length = direction.length();
        const caster = new Raycaster(a, direction.normalize(), 0, length);
        return meshes.map(mesh => caster.intersectObject(mesh).length);
      };
      const w = layout.SEA_CAVE_WINDOW, l = Math.hypot(...w.outward), o = [w.outward[0] / l, w.outward[1] / l];
      for (const across of [-4, 0, 4]) for (const h of [3.6, 5.5, 7.5]) {
        const inside = [w.center[0] - o[1] * across - o[0] * 2.5, w.center[1] + o[0] * across - o[1] * 2.5, h];
        const outside = [w.center[0] - o[1] * across + o[0] * 6, w.center[1] + o[0] * across + o[1] * 6, h];
        const [detail, far] = ray(inside, outside);
        assert.equal(detail, 0, `The window is open at ${across},${h}`);
        assert.equal(far, 0, `The coarse terrain keeps the window open at ${across},${h}`);
      }
      const m = layout.SEA_CAVE_MOUTH, ml = Math.hypot(...m.inward), i = [m.inward[0] / ml, m.inward[1] / ml];
      for (const h of [.8, 1.8, 2.8]) {
        const [detail] = ray([m.center[0] - i[0] * 3.5, m.center[1] - i[1] * 3.5, h], [m.center[0] + i[0] * 4, m.center[1] + i[1] * 4, h]);
        assert.equal(detail, 0, `The mouth is open at ${h}m`);
      }
      material.dispose();
    } finally { localPatch.dispose(); portal.dispose(); coarse.dispose(); }
  });

  await test('the cave mesh is finite, sized, and keeps every rock out of the walkable space', () => {
    const started = Date.now(), built = caveMesh.buildSeaCaveMesh(), elapsed = Date.now() - started;
    assert.ok(elapsed < 4000, `Builds quickly: ${elapsed}ms`);
    const { positions, colors } = built.rock;
    assert.ok(built.stats.rockTriangles > 8000 && built.stats.rockTriangles < 45000, JSON.stringify(built.stats));
    assert.ok(positions.every(Number.isFinite) && colors.every(Number.isFinite));
    let low = Infinity, high = -Infinity;
    for (const value of colors) { low = Math.min(low, value); high = Math.max(high, value); }
    assert.ok(low >= 0 && high < 1.5, `Baked light stays in range: ${low}..${high}`);
    let intrusions = 0;
    for (let k = 0; k < positions.length; k += 3) {
      const point = new Vector3(positions[k], positions[k + 1], positions[k + 2]), local = F.local(point), s = cave.seaCaveLocal(local.u, local.v);
      const height = point.length() - R;
      if (s.sdf < -.02 && height > s.floor + .06 && height < s.floor + 2.55) intrusions++;
    }
    assert.equal(intrusions, 0, 'No rock vertex inside the walkable volume below 2.55m');
  });

  await test('cave rooms name themselves, and the cave lights only light the caves', () => {
    const grotto = chamber('grotto');
    assert.equal(planet.areaAt(F.point(grotto.center[0], grotto.center[1], grotto.floor + 1)), 'The Grotto');
    const slot = passage('slot').points[2];
    assert.equal(planet.areaAt(F.point(slot[0], slot[1], 1.4)), 'The Slot');
    const stand = tower.LIGHTHOUSE_GALLERY_STAND;
    assert.equal(planet.areaAt(map.mapDirection(stand.x, stand.z).multiplyScalar(R + stand.elevation + CENTER)), 'Lighthouse Gallery');
    const window = anchors.LANTERN_ANCHORS.find(anchor => anchor.id === 'seacave:window');
    assert.equal(window.layer, 'tunnel');
    assert.equal(anchors.LANTERN_ANCHORS.find(anchor => anchor.id === 'lighthouse:lantern').layer, 'upper');
    assert.equal(town.TOWN_ROUTES.some(route => route.id === 'cave'), false);
  });

  await test('the opening cuts and seals stay local to the two openings', () => {
    // Chart z is squeezed by cos(x / R) out at the headland, so the window's box looks long in z.
    for (const bounds of openings.SEA_CAVE_CUT_CHART) assert.ok(bounds.maxX - bounds.minX < 25 && bounds.maxZ - bounds.minZ < 40, JSON.stringify(bounds));
    assert.ok(openings.SEA_CAVE_CUTS.mouth.length >= 5 && openings.SEA_CAVE_CUTS.window.length === 4);
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
