import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Skateboard physics, park and scoring checks. Pure and deterministic: the browser's fixed
// step, riding the real park surface, obstacles and grind lines.
const repository = process.cwd();
mkdirSync(path.join(repository, '.next'), { recursive: true });
const output = mkdtempSync(path.join(repository, '.next', 'skate-check-'));
try {
  for (const directory of ['data', 'runtime', 'skate']) {
    const source = path.join(repository, 'src/features/world', directory);
    mkdirSync(path.join(output, directory), { recursive: true });
    for (const file of readdirSync(source).filter(name => name.endsWith('.ts'))) {
      const result = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
      writeFileSync(path.join(output, directory, file.replace(/\.ts$/, '.js')), result.outputText);
    }
  }
  const require = createRequire(path.join(output, 'index.js'));
  const P = require('./skate/physics.js'), tricks = require('./skate/tricks.js'), progress = require('./skate/progress.js');
  const { WORLD_SKATE } = require('./skate/surface.js'), { SKATE: T } = require('./skate/tuning.js');
  const park = require('./data/skatepark-layout.js'), map = require('./data/world-map.js');
  const deck = park.SKATEPARK.deck;

  /** A rider at a park-local point, facing (du, dv), rolling at `speed`. */
  const spawn = (u, v, du, dv, speed = 0) => {
    const s = new P.SkaterState(), t = park.parkTangents(u, v);
    P.placeSkater(s, WORLD_SKATE, park.parkDirection(u, v), t.east.clone().multiplyScalar(du).addScaledVector(t.north, dv).normalize(), speed);
    return s;
  };
  const ride = (s, seconds, controls = () => ({}), onStep) => {
    const events = [];
    for (let i = 0, steps = Math.round(seconds / T.step); i < steps; i++) {
      const t = i * T.step, before = events.length;
      P.stepSkater(s, { ...P.IDLE_INPUT, ...controls(t, s) }, T.step, WORLD_SKATE, events);
      for (let k = before; k < events.length; k++) events[k].t = t;
      onStep?.(t, s);
    }
    return events;
  };
  const local = s => park.parkLocal(s.position);
  const aboveDeck = s => s.position.length() - map.MAP_RADIUS - deck;
  /** The first ground contact after the first launch. */
  const firstAir = (s, seconds, controls) => {
    let launch = null, landing = null;
    ride(s, seconds, controls, (t, s) => {
      if (s.mode === 'air' && !launch) launch = { ...local(s), vert: s.air.vert, transfer: s.air.transfer };
      if (launch && !landing && s.mode !== 'air') landing = { ...local(s), mode: s.mode, height: aboveDeck(s) };
    });
    return { launch, landing };
  };

  await test('a vert air goes straight up and drops back onto its wall, building to the cap', () => {
    // Drop into the Deep End from its north deck and ride it with no input.
    const s = spawn(-8.5, -3.2, 0, -1), airs = [];
    let launch = null, peak = 0;
    const events = ride(s, 16, t => ({ push: t < 1.2 }), (t, s) => {
      if (s.mode === 'air' && !launch) { launch = { ...local(s), vert: s.air.vert, height: aboveDeck(s) }; peak = launch.height; }
      if (s.mode === 'air') peak = Math.max(peak, aboveDeck(s));
      if (s.mode !== 'air' && launch) { const l = local(s); airs.push({ vert: launch.vert, drift: Math.hypot(l.u - launch.u, l.v - launch.v), rise: peak - launch.height, mode: s.mode }); launch = null; }
    });
    assert.equal(events.filter(e => e.type === 'bail').length, 0);
    assert.ok(airs.length >= 4, `only ${airs.length} airs`);
    const cap = T.vertMaxLaunch ** 2 / (2 * T.gravity);
    for (const air of airs) {
      assert.ok(air.vert && air.mode === 'ground', 'Every Deep End air is a vert air that lands');
      assert.ok(air.drift < .01, `A vert air drifted ${air.drift} m from its takeoff`);
      assert.ok(air.rise <= cap + .05, `A vert air rose ${air.rise} m, above the ${cap} m cap`);
    }
    assert.ok(Math.max(...airs.map(air => air.rise)) > cap - .3, 'Pumping the bowl builds airs up to the cap');
  });

  await test('holding up at a lip transfers over the coping onto the deck behind it', () => {
    for (const [label, u, v, du, dv] of [['Deep End west wall', -5, -10, -1, 0], ['Deep End east wall', -12, -10.5, 1, 0], ['Deep End north rim', -12, -12, 0, 1]]) {
      const { launch, landing } = firstAir(spawn(u, v, du, dv, 11), 4, () => ({ push: true }));
      assert.ok(launch?.transfer, `${label}: the lip launch is a transfer`);
      assert.equal(landing?.mode, 'ground', `${label}: the transfer lands`);
      assert.equal(park.parkSurfaceLocal(landing.u, landing.v).feature, 'deck', `${label}: on the deck`);
      const carry = Math.hypot(landing.u - launch.u, landing.v - launch.v);
      assert.ok(carry > .6 && carry < 2, `${label}: landed ${carry} m past the lip`);
    }
    const [, east] = park.HALFPIPE_COPING;
    const { launch, landing } = firstAir(spawn(-10.8, 20, 1, 0, 12), 3, () => ({ push: true }));
    assert.ok(launch?.transfer && landing?.mode === 'ground');
    assert.ok(landing.u > east && landing.u < park.PARK_HALFPIPE.u1, `The halfpipe transfer lands on its 1.8 m deck, not at u ${landing.u}`);
    assert.ok(Math.abs(landing.height - park.HALFPIPE_HEIGHT) < .1);
  });

  await test('the five-stair handrail grinds its full length once and lands clean, even with grind held', () => {
    for (const speed of [4, 5, 6]) for (const held of [false, true]) {
      // Ollie released before the rail, then a grind press: tapped, or held throughout.
      const events = ride(spawn(14, -15.5, 0, 1, speed), 3, (t, s) => {
        const { v } = local(s);
        return { jump: v > -14 && v < -13.3, grind: held ? v > -13.1 : v > -13.1 && v < -12.6 };
      });
      const label = `${speed} m/s, grind ${held ? 'held' : 'tapped'}`;
      const starts = events.filter(e => e.type === 'grind-start' && e.line.id === 'five-stair:rail');
      const end = events.find(e => e.type === 'grind-end' && e.line.id === 'five-stair:rail');
      assert.equal(starts.length, 1, `${label}: one grind, not a re-catch loop`);
      assert.ok(end && !end.bailed && end.time > .3, `${label}: the grind runs the rail`);
      assert.ok(events.some(e => e.type === 'land' && e.t > end.t && e.perfect), `${label}: a clean landing`);
      assert.equal(events.filter(e => e.type === 'bail').length, 0, `${label}: no bail`);
    }
  });

  await test('the snake run carries a rider to its pocket without stray airs', () => {
    let first = null;
    ride(spawn(14.4, -21.3, -1, 0, 5), 6, t => ({ push: t < 1.5 }), (t, s) => {
      if (s.mode === 'air' && !first) { const { u, v } = local(s); first = { along: park.snakeNearest(u, v).along, vert: s.air.vert }; }
    });
    assert.ok(first, 'The rider reaches the pocket');
    assert.ok(first.along > park.SNAKE_RUN.length - 1 && first.vert, `The first air is the pocket's vert air, not a hop at ${first.along} m`);
  });

  await test('each S.K.A.T.E. letter needs its trick', () => {
    const points = Object.fromEntries(park.SKATE_LETTERS.map(letter => [letter.letter, park.skateLetterPoint(letter)]));
    const closest = (letter, s, seconds, controls) => {
      let best = Infinity;
      ride(s, seconds, controls, (t, s) => { best = Math.min(best, s.position.clone().addScaledVector(s.position.clone().normalize(), park.SKATE_LETTER_BODY).distanceTo(points[letter])); });
      return best;
    };
    const reach = park.SKATE_LETTER_REACH;
    assert.ok(closest('S', spawn(15, 1.5, -1, 0, 6.5), 2.2) > reach, 'Rolling over the funbox misses the S');
    assert.ok(closest('S', spawn(15, 1.5, -1, 0, 6.5), 2.2, t => ({ jump: t > .5 && t < .8 })) <= reach, 'An ollie off the funbox takes the S');
    assert.ok(closest('A', spawn(14.6, 6, 0, 1, 6), 2.2) > reach, 'Riding beside the Long Ledge misses the A');
    assert.ok(closest('A', spawn(14.5, 6, .12, 1, 6.5), 2.4, t => ({ jump: t > .05 && t < .25, grind: t > .3 && t < .5 })) <= reach, 'Grinding the Long Ledge takes the A');
    assert.ok(closest('K', spawn(-9, -10.4, -1, 0, 11), 6) <= reach, 'A big Deep End air takes the K');
    assert.ok(closest('T', spawn(14.4, -21.3, -1, 0, 5), 12, t => ({ push: t < 1.5 })) <= reach, 'Airing out of the snake pocket takes the T');
    assert.ok(closest('E', spawn(-10.8, 20, 1, 0, 12), 12) <= reach, 'Big halfpipe air takes the E');
  });

  await test('a combo multiplies by its trick count, repeats lose value and a bail loses it', () => {
    const score = new tricks.SkateScore();
    score.add('Kickflip', 100); score.add('Kickflip', 100); score.add('50-50', 200);
    assert.deepEqual(score.tricks.map(trick => trick.points), [100, 75, 200]);
    assert.equal(score.comboValue, 375 * 3);
    assert.equal(score.bank(), 1125); assert.equal(score.score, 1125); assert.equal(score.bestCombo, 1125);
    for (let i = 0; i < 6; i++) score.add('Ollie', 40);
    assert.equal(score.tricks.at(-1).points, 10, 'Repeats bottom out at a quarter');
    score.lose('BAILED');
    assert.equal(score.score, 1125); assert.equal(score.tricks.length, 0);
  });

  await test('records survive corrupt, blocked and partial storage', () => {
    const withStorage = (getItem, run) => { globalThis.window = { localStorage: { getItem, setItem: () => { throw new Error('blocked'); } } }; try { return run(); } finally { delete globalThis.window; } };
    assert.deepEqual(withStorage(() => '{nope', progress.loadSkateProgress), progress.emptySkateProgress());
    assert.deepEqual(withStorage(() => { throw new Error('blocked'); }, progress.loadSkateProgress), progress.emptySkateProgress());
    const partial = withStorage(() => JSON.stringify({ owned: true, bestScore: -5, bestTime: 'x', bestLetters: 9, games: 3 }), progress.loadSkateProgress);
    assert.deepEqual(partial, { ...progress.emptySkateProgress(), owned: true, games: 3 });
    assert.equal(withStorage(() => null, () => progress.saveSkateProgress(partial)), false);
    const first = progress.recordSkateGame(partial, { complete: false, time: 120, letters: 3, got: ['S', 'K', 'A'], score: 4000, bestCombo: 900 });
    assert.equal(first.newBestTime, false); assert.equal(first.progress.bestLetters, 3);
    const done = progress.recordSkateGame(first.progress, { complete: true, time: 88.5, letters: 5, got: ['S', 'K', 'A', 'T', 'E'], score: 3000, bestCombo: 700 });
    assert.ok(done.newBestTime && !done.newBestScore);
    assert.deepEqual([done.progress.bestTime, done.progress.bestScore, done.progress.games, done.progress.completions], [88.5, 4000, 5, 1]);
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
