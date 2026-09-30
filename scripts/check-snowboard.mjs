import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Snowboard physics, course and scoring checks. Pure and deterministic: the same fixed
// step as the browser, a flat test planet and the real mountain surface.
const repository = process.cwd();
mkdirSync(path.join(repository, '.next'), { recursive: true });
const output = mkdtempSync(path.join(repository, '.next', 'snowboard-check-'));
try {
  for (const directory of ['data', 'snowboard']) {
    const source = path.join(repository, 'src/features/world', directory);
    mkdirSync(path.join(output, directory), { recursive: true });
    for (const file of readdirSync(source).filter(name => name.endsWith('.ts'))) {
      const result = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
      writeFileSync(path.join(output, directory, file.replace(/\.ts$/, '.js')), result.outputText);
    }
  }
  const require = createRequire(path.join(output, 'index.js'));
  const THREE = require('three');
  const physics = require('./snowboard/physics.js'), course = require('./snowboard/course.js'), scoring = require('./snowboard/scoring.js');
  const progress = require('./snowboard/progress.js'), terrain = require('./snowboard/terrain.js');
  const { SNOWBOARD: T } = require('./snowboard/tuning.js');
  const runs = require('./data/ski-runs.js'), map = require('./data/world-map.js');
  const R = map.MAP_RADIUS, DT = T.step;
  const FLAT = { height: () => 0, kind: () => 'groomed', obstacle: () => null };
  const input = (overrides = {}) => ({ ...physics.IDLE_INPUT, ...overrides });
  const vector = (x, y, z) => new THREE.Vector3(x, y, z);
  const tangentAt = direction => { const up = direction.clone().normalize(); return vector(1, 0, 0).addScaledVector(up, -up.x).normalize(); };
  const ride = (board, sampler, seconds, controls = () => input()) => {
    const events = [];
    for (let t = 0; t < seconds; t += DT) physics.stepBoard(board, typeof controls === 'function' ? controls(board, t) : controls, DT, sampler, events);
    return events;
  };

  await test('a board at rest on flat snow stays put; friction and drag slow a moving one', () => {
    const board = new physics.BoardState(), start = vector(.3, .4, .866).normalize();
    physics.placeBoard(board, FLAT, start, tangentAt(start), 0);
    const before = board.position.clone();
    ride(board, FLAT, 2);
    assert.ok(board.position.distanceTo(before) < .01, `resting board drifted ${board.position.distanceTo(before)}`);
    physics.placeBoard(board, FLAT, start, tangentAt(start), 10);
    ride(board, FLAT, 3);
    const speed = board.velocity.length(), up = board.position.clone().normalize();
    assert.ok(speed > 2 && speed < 9.5, `friction and drag slow the board (${speed.toFixed(2)} m/s)`);
    assert.ok(Math.abs(board.position.length() - (R + T.boardOffset)) < 1e-6, 'the board stays on the snow');
    assert.ok(Math.abs(board.heading.dot(up)) < 1e-6 && Math.abs(board.heading.length() - 1) < 1e-9, 'the heading stays a unit tangent');
  });

  await test('riding straight over a geographic pole stays smooth and finite', () => {
    const board = new physics.BoardState(), start = vector(0, Math.cos(.12), Math.sin(.12));
    physics.placeBoard(board, FLAT, start, vector(0, -Math.sin(.12), Math.cos(.12)).negate(), 12);
    let previous = board.position.clone(), maxStep = 0, crossed = false;
    for (let t = 0; t < 3; t += DT) {
      physics.stepBoard(board, input({ tuck: true }), DT, FLAT, []);
      maxStep = Math.max(maxStep, board.position.distanceTo(previous)); previous.copy(board.position);
      assert.ok(Number.isFinite(board.position.x + board.heading.x + board.velocity.x), 'state stays finite');
      if (board.position.y / board.position.length() > .9999) crossed = true;
    }
    assert.ok(crossed, 'the path passes over the pole');
    assert.ok(maxStep < 14 * DT, `no jump at the pole (${maxStep.toFixed(4)} m per step)`);
  });

  await test('curvature compensation keeps a 25 m/s board on flat snow', () => {
    const board = new physics.BoardState(), start = vector(0, 0, 1);
    physics.placeBoard(board, FLAT, start, tangentAt(start), 25);
    const events = ride(board, FLAT, 4, board => input({ tuck: true, steer: board.velocity.length() < 25 ? 0 : 0 }));
    assert.equal(events.filter(event => event.type === 'launch').length, 0, 'no launch on the convex planet');
    assert.equal(board.airborne, false);
  });

  await test('a full-edge carve holds the sidecut radius, and the clean-carve assist holds at speed', () => {
    for (const [speed, expected, tolerance] of [[12, T.sidecutRadius / Math.sin(T.maxEdge), .15], [24, 24 * 24 / (T.carveAssist * T.gripLimit * T.gravity), .2]]) {
      const board = new physics.BoardState(), start = vector(0, 0, 1);
      physics.placeBoard(board, FLAT, start, tangentAt(start), speed);
      let skidded = false;
      const keep = board => { const v = board.velocity.length(); if (v > 0) board.velocity.multiplyScalar(speed / v); return input({ steer: 1 }); };
      ride(board, FLAT, .8, board => { skidded ||= board.skidding; return keep(board); });
      const h0 = board.heading.clone(), p0 = board.position.clone().normalize();
      ride(board, FLAT, .25, board => { skidded ||= board.skidding; return keep(board); });
      const up = board.position.clone().normalize();
      const turn = h0.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(p0, up)).angleTo(board.heading);
      const radius = speed * .25 / turn;
      assert.ok(Math.abs(radius - expected) / expected < tolerance, `${speed} m/s carve radius ${radius.toFixed(1)} m, expected about ${expected.toFixed(1)} m`);
      assert.equal(skidded, false, `${speed} m/s full carve stays clean`);
    }
  });

  await test('a hockey stop halts a 15 m/s board inside 20 m', () => {
    const board = new physics.BoardState(), start = vector(0, 0, 1);
    physics.placeBoard(board, FLAT, start, tangentAt(start), 15);
    const from = board.position.clone();
    let time = 0;
    while (board.velocity.length() > .3 && time < 6) { physics.stepBoard(board, input({ brake: true, steer: 1 }), DT, FLAT, []); time += DT; }
    const distance = board.position.distanceTo(from);
    assert.ok(board.velocity.length() <= .3, 'the board stops');
    assert.ok(distance > 8 && distance < 20, `stopping distance ${distance.toFixed(1)} m`);
  });

  await test('a charged ollie pops about 0.8 s of air and lands clean', () => {
    const board = new physics.BoardState(), start = vector(0, 0, 1);
    physics.placeBoard(board, FLAT, start, tangentAt(start), 10);
    const events = ride(board, FLAT, 2.2, (_, t) => input({ jump: t < .55 }));
    const launch = events.find(event => event.type === 'launch'), land = events.find(event => event.type === 'land');
    assert.ok(launch?.popped, 'the release pops');
    assert.ok(land && !land.hop, 'it lands as a real air');
    assert.ok(Math.abs(land.air.time - 2 * T.ollieMax / T.gravity) < .12, `air time ${land.air.time.toFixed(2)} s`);
    assert.ok(land.quality === 'perfect' || land.quality === 'clean', `landing ${land.quality}`);
  });

  // A rider bot: turn-aware speed control and pure-pursuit steering along a line.
  const target = vector(0, 0, 0), up = vector(0, 0, 0), desired = vector(0, 0, 0), travel = vector(0, 0, 0), cross = vector(0, 0, 0);
  function steerToward(board, run, s, lateral) {
    const point = runs.runPointAt(run, s, lateral);
    target.copy(map.mapDirection(point.x, point.z)).multiplyScalar(board.position.length());
    up.copy(board.position).normalize();
    desired.copy(target).sub(board.position).addScaledVector(up, -target.clone().sub(board.position).dot(up)).normalize();
    const speed = board.velocity.length();
    travel.copy(speed > 1 ? board.velocity : board.heading).addScaledVector(up, -(speed > 1 ? board.velocity : board.heading).dot(up)).normalize();
    return Math.max(-1, Math.min(1, -Math.atan2(cross.crossVectors(travel, desired).dot(up), travel.dot(desired)) * 2.6));
  }
  const CRUISE = { 'sunday-cruise': 13, 'lighthouse-line': 15, 'timber-chute': 14, 'dead-coast-couloir': 17 };
  function botRun(run) {
    const board = new physics.BoardState(), line = new course.RunCourse(run), score = scoring.createScore();
    const start = course.runPose(run, .5);
    physics.placeBoard(board, terrain.WORLD_SNOW, start.direction, start.forward, T.startPush);
    line.relocate(board.position);
    const events = [], courseEvents = [], crashes = [];
    let time = 0;
    while (time < 120 && !line.finished) {
      const speed = board.velocity.length();
      let curvature = 0;
      for (let ahead = 0; ahead <= 18; ahead += 1.5) {
        const sample = run.samples.find(candidate => candidate.s >= Math.min(run.length, line.location.s + ahead)) ?? run.samples.at(-1);
        curvature = Math.max(curvature, Math.abs(sample.curvature));
      }
      // Slow for turns, and like a careful rider, for mogul fields, chutes and drops ahead.
      let limit = Math.min(CRUISE[run.id], Math.sqrt(12 / Math.max(curvature, 1e-3)));
      for (const feature of run.features) {
        const [from, to] = runs.featureSpan(feature), s = line.location.s;
        if (s < from - 12 || s > to) continue;
        limit = Math.min(limit, feature.kind === 'moguls' ? 7 : feature.kind === 'narrows' ? 10 : feature.kind === 'drop' ? 11 : feature.kind === 'kicker' ? 13 : limit);
      }
      // Line up on a kicker well before its ramp, then hold that line off the lip.
      const kicker = run.features.find(feature => feature.kind === 'kicker' && line.location.s > feature.s - feature.ramp - 22 && line.location.s < feature.s);
      const steer = kicker
        ? steerToward(board, run, line.location.s + 3 + speed * .25, kicker.offset)
        : steerToward(board, run, line.location.s + 4 + speed * .35, 0);
      events.length = 0; courseEvents.length = 0;
      physics.stepBoard(board, input({ steer: board.airborne ? 0 : steer, tuck: speed < limit - 2, brake: speed > limit + .5 }), DT, terrain.WORLD_SNOW, events);
      time += DT;
      line.update(board.position, board.velocity.length(), board.airborne, board.crashed, DT, courseEvents);
      for (const event of events) { scoring.applyBoardEvent(score, event); if (event.type === 'crash') crashes.push(`${event.reason}@${line.location.s.toFixed(0)}`); }
      for (const event of courseEvents) scoring.applyCourseEvent(score, event);
      if (board.crashed && board.crashTimer <= 0) break;
    }
    return { finished: line.finished, time, crashes, tokens: line.tokenCount };
  }

  await test('a bot rider finishes every run without crashing, within 0.6 to 1.6 times par', () => {
    const report = {};
    for (const run of runs.SKI_RUNS) {
      const result = botRun(run);
      report[run.id] = { time: +result.time.toFixed(1), par: run.par, ratio: +(result.time / run.par).toFixed(2), crashes: result.crashes, tokens: result.tokens };
      assert.ok(result.finished, `${run.id} reaches the finish (${JSON.stringify(report[run.id])})`);
      assert.deepEqual(result.crashes, [], `${run.id} is ridden clean`);
      assert.ok(result.time / run.par >= .6 && result.time / run.par <= 1.6, `${run.id} takes ${result.time.toFixed(1)} s against par ${run.par}`);
    }
    console.log('SNOWBOARD_BOT', JSON.stringify(report));
  });

  await test('every kicker launches near its lip and the rider lands it', () => {
    for (const run of runs.SKI_RUNS) for (const feature of run.features.filter(candidate => candidate.kind === 'kicker')) {
      const board = new physics.BoardState(), line = new course.RunCourse(run);
      const start = course.runPose(run, feature.s - feature.ramp - 14);
      physics.placeBoard(board, terrain.WORLD_SNOW, start.direction, start.forward, 11);
      line.relocate(board.position);
      // Keep the biggest air that leaves between the ramp's foot and the far end of its landing.
      const airs = [];
      let launchAt = null, crashed = false;
      const done = feature.s + feature.table + feature.landing + 6;
      for (let t = 0; t < 8 && line.location.s < done && !crashed; t += DT) {
        const events = [];
        physics.stepBoard(board, input({ steer: board.airborne ? 0 : steerToward(board, run, line.location.s + 6, feature.offset) }), DT, terrain.WORLD_SNOW, events);
        line.update(board.position, board.velocity.length(), board.airborne, board.crashed, DT, []);
        for (const event of events) {
          if (event.type === 'launch' && line.location.s > feature.s - feature.ramp) launchAt = line.location.s;
          if (event.type === 'land' && launchAt !== null) { airs.push({ from: launchAt, to: line.location.s, air: event.air.time }); launchAt = null; }
          if (event.type === 'crash') crashed = true;
        }
      }
      const label = `${run.id} kicker at ${feature.s}`;
      const best = airs.sort((a, b) => b.air - a.air)[0];
      assert.ok(!crashed, `${label} is ridden without a crash`);
      assert.ok(best && Math.abs(best.from - feature.s) < 1.6, `${label} launches at its lip (${best?.from.toFixed(1)})`);
      assert.ok(best.air > .3, `${label} gives real air (${best.air.toFixed(2)} s)`);
      assert.ok(best.to > feature.s + 1, `${label} lands past the lip (${best.to.toFixed(1)})`);
    }
  });

  await test('tricks, combos, multipliers, gates and tokens score by the rules', () => {
    const air = (spin, overrides = {}) => ({ time: .9, spin, flip: 0, grab: null, grabTime: 0, maxHeight: 1, popped: true, switchTakeoff: false, ...overrides });
    const trick = scoring.trickFor(air(Math.PI * 2), 'clean', false);
    assert.equal(trick.name, 'FS 360');
    assert.equal(trick.points, 250 + 50, 'a clean 360 with 0.9 s of air scores 300');
    assert.equal(scoring.trickFor(air(-Math.PI * 2), 'perfect', false).points, Math.round(300 * 1.25), 'a perfect landing adds 25%');
    assert.equal(scoring.trickFor(air(Math.PI), 'clean', true).points, Math.round((100 + 50) * 1.1), 'a switch landing adds 10%');
    assert.equal(scoring.trickFor(air(0, { flip: -Math.PI * 2, grab: 'indy', grabTime: 1 }), 'clean', false).name, 'BACKFLIP INDY');
    assert.equal(scoring.trickFor(air(0, { time: .35 }), 'clean', false), null, 'a short straight air is not a trick');
    assert.deepEqual([0, 180, 360, 540, 720, 900, 1080, 1260].map(scoring.spinPoints), [0, 100, 250, 450, 700, 1000, 1400, 1800]);

    const state = scoring.createScore();
    const land = (spin, quality = 'clean') => scoring.applyBoardEvent(state, { type: 'land', quality, air: air(spin), switchStance: false, speed: 10, hop: false });
    land(Math.PI * 2); land(Math.PI * 2);
    assert.equal(state.multiplier, 2, 'a chained air raises the multiplier');
    assert.equal(state.combo, 600);
    scoring.tickScore(state, scoring.FLOW_WINDOW + .1, false);
    assert.equal(state.combo, 0);
    assert.equal(state.score, 1200, 'the combo banks at the multiplier when the flow window closes');
    for (let i = 0; i < 12; i++) land(Math.PI * 2, 'perfect');
    assert.equal(state.multiplier, scoring.MAX_MULTIPLIER, 'the multiplier caps');
    scoring.applyBoardEvent(state, { type: 'crash', reason: 'landing' });
    assert.equal(state.combo, 0); assert.equal(state.multiplier, 1); assert.equal(state.stats.crashes, 1);
    assert.equal(state.score, 1200, 'a crash loses the open combo');

    const gates = scoring.createScore();
    for (let i = 0; i < 3; i++) scoring.applyCourseEvent(gates, { type: 'gate', index: i, passed: true });
    assert.equal(gates.combo, 150 + 200 + 250, 'gate streaks pay more per gate');
    assert.equal(gates.multiplier, 2, 'three gates in a row raise the multiplier');
    scoring.applyCourseEvent(gates, { type: 'gate', index: 3, passed: false });
    assert.equal(gates.gateStreak, 0);
    scoring.applyCourseEvent(gates, { type: 'token', index: 0, count: 1, total: 1 });
    assert.equal(gates.score, 50, 'tokens bank directly');
    const run = runs.skiRunById('sunday-cruise');
    const result = scoring.finishScore(gates, run, run.par - 2, 1);
    assert.equal(result.totals.tokenBonus, scoring.ALL_TOKENS_BONUS);
    assert.equal(result.totals.timeBonus, 200);
    assert.equal(scoring.medalFor('sunday-cruise', 5999), 'silver');
    assert.equal(scoring.medalFor('sunday-cruise', 10000), 'westcose');
  });

  await test('a course counts each token and gate once, in run order', () => {
    const run = runs.skiRunById('lighthouse-line'), line = new course.RunCourse(run), events = [];
    for (let s = 1; s < run.length - 1; s += .25) {
      const gate = run.gates.find(candidate => Math.abs(candidate.s - s) < 3);
      const token = run.tokens.find(candidate => Math.abs(candidate.s - s) < 1.2);
      const lateral = gate ? gate.offset : token ? token.offset : 0;
      const point = runs.runPointAt(run, s, lateral);
      const position = map.mapPoint(point.x, point.z, (token ? token.lift - course.CHEST_HEIGHT : 0) + require('./data/town-surfaces.js').groundSurfaceAt(point.x, point.z).height);
      line.update(position, 12, false, false, .02, events);
    }
    for (let s = run.length - 1; s > run.length - 60; s -= 2) {
      const point = runs.runPointAt(run, s, 0);
      line.update(map.mapPoint(point.x, point.z, 1), 12, false, false, .02, events);
    }
    const gateEvents = events.filter(event => event.type === 'gate');
    assert.equal(gateEvents.length, run.gates.length, 'every gate is judged exactly once');
    assert.ok(gateEvents.every(event => event.passed), 'gates ridden through their middle pass');
    const tokenEvents = events.filter(event => event.type === 'token');
    assert.equal(new Set(tokenEvents.map(event => event.index)).size, tokenEvents.length, 'no token counts twice');
    assert.ok(tokenEvents.length >= run.tokens.length * .8, `most tokens on the line are collected (${tokenEvents.length}/${run.tokens.length})`);
    assert.equal(events.filter(event => event.type === 'finish').length, 1, 'the finish fires once');
  });

  await test('records survive corrupt, blocked and partial storage', () => {
    const memory = value => ({ getItem: () => value, setItem() {} });
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.deepEqual(progress.loadProgress(memory('{nope')), progress.emptyProgress());
    assert.deepEqual(progress.loadProgress(blocked), progress.emptyProgress());
    assert.deepEqual(progress.loadProgress(null), progress.emptyProgress());
    assert.equal(progress.saveProgress(progress.emptyProgress(), blocked), false);
    const partial = progress.loadProgress(memory(JSON.stringify({ runs: { 'timber-chute': { best: 4200.4, bestTime: 30, medal: 'gold', stars: [true, 'yes', true], rides: 3 }, 'sunday-cruise': { best: -5, medal: 'platinum' } } })));
    assert.deepEqual(partial['timber-chute'], { best: 4200, bestTime: 30, medal: 'gold', stars: [true, false, true], rides: 3 });
    assert.deepEqual(partial['sunday-cruise'], { best: 0, bestTime: null, medal: null, stars: [false, false, false], rides: 0 });
    const result = { runId: 'timber-chute', score: 5000, time: 28, par: 26, medal: 'silver', challenges: [false, true, false], totals: {}, stats: {}, tokenTotal: 16, gateTotal: 0 };
    const outcome = progress.recordResult(partial, result);
    assert.deepEqual(outcome.progress['timber-chute'], { best: 5000, bestTime: 28, medal: 'gold', stars: [true, true, true], rides: 4 });
    assert.equal(outcome.newBest, true); assert.equal(outcome.newMedal, false); assert.deepEqual(outcome.newStars, [false, true, false]);
    let stored = null;
    assert.equal(progress.saveProgress(outcome.progress, { getItem: () => stored, setItem: (_, value) => { stored = value; } }), true);
    assert.deepEqual(progress.loadProgress({ getItem: () => stored, setItem() {} }), outcome.progress);
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
