import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Pier Pressure checks: the fight and the tide are pure and deterministic, the difficulty bands
// hold for bots that react like people, records survive bad storage, and the cast fan is open
// water the camera can see. `node scripts/check-fishing.mjs --calibrate` prints the bot table.
const repository = process.cwd();
const calibrate = process.argv.includes('--calibrate');
mkdirSync(path.join(repository, '.next'), { recursive: true });
const output = mkdtempSync(path.join(repository, '.next', 'fishing-check-'));
try {
  for (const directory of ['data', 'runtime', 'fishing']) {
    const source = path.join(repository, 'src/features/world', directory);
    mkdirSync(path.join(output, directory), { recursive: true });
    for (const file of readdirSync(source).filter(name => name.endsWith('.ts'))) {
      const result = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
      writeFileSync(path.join(output, directory, file.replace(/\.ts$/, '.js')), result.outputText);
    }
  }
  const require = createRequire(path.join(output, 'index.js'));
  const F = require('./fishing/fight.js'), tide = require('./fishing/tide.js'), bots = require('./fishing/bots.js');
  const S = require('./fishing/species.js'), R = require('./fishing/rng.js'), tackle = require('./fishing/tackle.js');
  const progress = require('./fishing/progress.js'), spot = require('./fishing/spot.js'), { FISHING: T } = require('./fishing/tuning.js');
  const map = require('./data/world-map.js'), surfaces = require('./data/town-surfaces.js'), pier = require('./data/pier-layout.js');
  const MAXED = { line: 3, reel: 3, rod: 3, bucket: 3, charm: 3 };

  /** One fight against a fish of `tier`, played by a bot. */
  function fightOnce(tier, kind, seed, gear = F.BASE_GEAR) {
    const rng = R.createRng(seed), botRng = R.createRng(seed ^ 0x9E3779B9);
    const species = R.pick(rng, S.speciesOfTier(tier));
    const fight = F.createFight(species, R.between(rng, T.cast.minDistance, T.cast.maxDistance), gear);
    const bot = bots.fightBot(kind, botRng), events = [];
    for (let i = 0; i < 180 / T.step && fight.outcome === 'fighting'; i++) {
      F.stepFight(fight, bot.input(fight, T.step), T.step, rng, events);
      events.length = 0;
    }
    return fight;
  }
  function rates(tier, kind, count, gear) {
    const tally = { landed: 0, snapped: 0, spat: 0, fighting: 0, time: 0 };
    for (let i = 0; i < count; i++) { const f = fightOnce(tier, kind, 1000 * tier + i + 1, gear); tally[f.outcome]++; tally.time += f.elapsed; }
    return { landed: tally.landed / count, snapped: tally.snapped / count, spat: tally.spat / count, unfinished: tally.fighting / count, seconds: tally.time / count };
  }
  /** Step a tide with an input function until a condition holds (or a time limit passes). */
  function run(t, input, until, seconds = 120, events = []) {
    for (let i = 0; i < seconds / T.step && t.phase !== 'over' && !until(t, events); i++) tide.stepTide(t, input(t), T.step, events);
    return events;
  }
  const idle = () => tide.IDLE_TIDE;
  /** Drive a tide's fight with a fight bot, idle otherwise. */
  const fighting = bot => t => {
    if (!t.fight) return tide.IDLE_TIDE;
    const f = bot.input(t.fight, T.step);
    return { ...tide.IDLE_TIDE, primary: f.reel, steer: f.steer, bowPressed: f.bow };
  };
  const press = (field = 'primaryPressed') => ({ ...tide.IDLE_TIDE, [field]: true, primary: field === 'primaryPressed' });
  /** A whole tide played by a bot with a bait policy. */
  function playTide(seed, kind, policy, upgrades = tackle.NO_UPGRADES, options = {}) {
    const t = tide.createTide({ seed, upgrades, ...options }), bot = bots.tideBot(kind, R.createRng(seed + 7), policy), events = [];
    for (let i = 0; i < 1800 / T.step && t.phase !== 'over'; i++) tide.stepTide(t, bot.input(t, T.step), T.step, events);
    return { t, events };
  }

  if (calibrate) {
    const table = [];
    for (let tier = 0; tier <= S.TOP_TIER; tier++) for (const kind of ['expert', 'casual', 'masher', 'afk']) {
      const r = rates(tier, kind, 150);
      table.push({ tier, kind, landed: r.landed.toFixed(2), snapped: r.snapped.toFixed(2), spat: r.spat.toFixed(2), unfinished: r.unfinished.toFixed(2), seconds: r.seconds.toFixed(1) });
    }
    for (const tier of [5, 6, 7]) { const r = rates(tier, 'expert', 150, tackle.gearFor(MAXED)); table.push({ tier, kind: 'expert+maxed', landed: r.landed.toFixed(2), snapped: r.snapped.toFixed(2), spat: r.spat.toFixed(2), unfinished: r.unfinished.toFixed(2), seconds: r.seconds.toFixed(1) }); }
    console.table(table);
    // Tide pacing and pay: minutes per tide, clams banked and the best tier, by bot and greed.
    const tides = [];
    for (const [kind, goal] of [['casual', 0], ['casual', 2], ['casual', 4], ['expert', 2], ['expert', 4], ['expert', 7]]) for (const upgrades of [tackle.NO_UPGRADES, MAXED]) {
      let minutes = 0, clams = 0, best = 0;
      for (let seed = 1; seed <= 30; seed++) { const r = playTide(seed, kind, bots.baitUpTo(goal), upgrades).t.result; minutes += r.time / 60; clams += r.clams; best += r.bestTier; }
      tides.push({ kind, baitBelow: goal, gear: upgrades === MAXED ? 'maxed' : 'base', minutes: (minutes / 30).toFixed(1), clams: Math.round(clams / 30), bestTier: (best / 30).toFixed(1) });
    }
    console.table(tides);
  } else {
    await test('the same seed and inputs replay the same fight and the same tide', () => {
      const a = fightOnce(3, 'expert', 42), b = fightOnce(3, 'expert', 42);
      assert.equal(a.outcome, b.outcome); assert.equal(a.elapsed, b.elapsed); assert.equal(a.distance, b.distance);
      const one = playTide(7, 'expert', bots.baitUpTo(2)).t.result, two = playTide(7, 'expert', bots.baitUpTo(2)).t.result;
      assert.ok(one); assert.deepEqual(one, two);
    });

    await test('skill matters: experts land, casual players struggle up the chain, mashers snap and the AFK never land', () => {
      for (let tier = 0; tier <= 5; tier++) assert.ok(rates(tier, 'expert', 150).landed >= .85, `expert lands tier ${tier}`);
      assert.ok(rates(S.TOP_TIER, 'expert', 150, tackle.gearFor(MAXED)).landed >= .6, 'a maxed expert lands the Sun');
      for (const tier of [0, 1]) assert.ok(rates(tier, 'casual', 150).landed >= .9, `casual lands tier ${tier}`);
      const boss = rates(3, 'casual', 150).landed;
      assert.ok(boss >= .55 && boss <= .75, `casual lands a boss ${boss.toFixed(2)} of the time`);
      assert.ok(rates(5, 'casual', 150).landed <= .3, 'casual rarely lands a myth');
      assert.ok(rates(S.TOP_TIER, 'casual', 150).landed <= .05, 'casual almost never lands the Sun');
      for (let tier = 2; tier <= S.TOP_TIER; tier++) assert.ok(rates(tier, 'masher', 60).snapped >= .7, `masher snaps at tier ${tier}`);
      for (let tier = 0; tier <= S.TOP_TIER; tier++) assert.equal(rates(tier, 'afk', 30).landed, 0, `afk never lands tier ${tier}`);
    });

    await test('every bait climbs the chain: one tier, sometimes two, and only a legend draws the Sun', () => {
      let climbs = 0, skips = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { t, events } = playTide(seed, 'expert', bots.baitUpTo(S.TOP_TIER), MAXED);
        assert.equal(t.phase, 'over', `tide ${seed} ends`);
        // An ambush mid-fight adds one more tier on top of whatever the bait drew.
        const ambushed = new Set();
        let pending = false;
        for (const e of events) {
          if (e.type === 'hooked') pending = false;
          if (e.type === 'ambush') pending = true;
          if (e.type === 'landed' && pending) ambushed.add(e.catch.id);
        }
        for (let i = 1; i < t.landed.length; i++) {
          const c = t.landed[i], before = t.landed[i - 1];
          if (c.chain < 2) continue;
          const step = c.tier - before.tier - (ambushed.has(c.id) ? 1 : 0);
          assert.ok(step === 1 || step === 2, `a live ${before.species} drew a ${c.species}`);
          if (c.species === 'sun') assert.equal(before.tier, 6);
          climbs++; if (step === 2) skips++;
        }
      }
      assert.ok(climbs > 60, 'bots baited their way up');
      assert.ok(skips > 0 && skips / climbs < .2, 'tier skips are rare but real');
    });

    await test('a tide spends worms on plain casts, ends when they and the live bait run out, and banks the cooler', () => {
      const { t, events } = playTide(11, 'expert', bots.baitUpTo(2));
      const r = t.result;
      assert.equal(r.clams, r.cooler.reduce((sum, c) => sum + c.clams, 0));
      assert.equal(t.worms, 0); assert.equal(t.live, null);
      assert.equal(events.filter(e => e.type === 'cast' && !e.live).length - events.filter(e => e.type === 'spooked' || e.type === 'reeled').length, tackle.wormsFor(tackle.NO_UPGRADES));
      assert.ok(r.headline.startsWith('LOCAL') || /[A-Z]/.test(r.headline));
      assert.ok(r.time > 30 && r.time < 900, `a tide takes ${r.time.toFixed(0)} s`);
      assert.equal(playTide(11, 'expert', bots.baitUpTo(2), MAXED).t.worms, 0);
    });

    await test('striking early keeps the bait; striking late loses it; perfect hooksets pay more', () => {
      const early = tide.createTide({ seed: 3, upgrades: tackle.NO_UPGRADES });
      run(early, t => t.phase === 'ready' ? press() : t.phase === 'charging' ? { ...tide.IDLE_TIDE, primary: t.charge < .5 } : idle(t), t => t.phase === 'nibble');
      const worms = early.worms;
      tide.stepTide(early, press(), T.step, []);
      assert.equal(early.phase, 'recover'); assert.equal(early.worms, worms + 1, 'the worm stays on');
      const late = tide.createTide({ seed: 3, upgrades: tackle.NO_UPGRADES });
      tide.forceBite(late, 'mackerel');
      const events = run(late, idle, t => t.phase === 'recover');
      assert.ok(events.some(e => e.type === 'stolen'));
      assert.equal(late.worms, tackle.wormsFor(tackle.NO_UPGRADES) - 1, 'the worm is gone');
      const hook = (delay) => {
        const t = tide.createTide({ seed: 5, upgrades: tackle.NO_UPGRADES });
        tide.forceBite(t, 'sardine', 'normal');
        run(t, idle, t => t.phase === 'bite');
        run(t, idle, () => false, delay);
        tide.stepTide(t, press(), T.step, []);
        run(t, fighting(bots.fightBot('expert', R.createRng(9))), t => t.phase === 'catch');
        return t.catch;
      };
      const quick = hook(.05), slow = hook(.3);
      assert.equal(quick.perfect, true); assert.equal(slow.perfect, false);
    });

    await test('Gary takes an undecided catch, never the Sun, and leaves the first tutorial catch alone', () => {
      const t = tide.createTide({ seed: 21, upgrades: tackle.NO_UPGRADES });
      tide.forceBite(t, 'boot');
      run(t, idle, t => t.phase === 'bite'); tide.stepTide(t, press(), T.step, []);
      assert.equal(t.phase, 'catch');
      const events = run(t, idle, t => t.phase !== 'catch', T.gary + 1);
      assert.ok(events.some(e => e.type === 'gary'), 'Gary took the boot');
      const tutorial = tide.createTide({ seed: 22, upgrades: tackle.NO_UPGRADES, tutorial: true }), tutor = bots.tideBot('expert', R.createRng(1));
      run(tutorial, t => tutor.input(t, T.step), t => t.phase === 'catch', 60);
      assert.equal(tutorial.catch.species, 'sardine');
      assert.equal(tutorial.gary, Infinity);
      // A maxed expert lands the Sun within a few tries.
      let sun = null;
      for (let seed = 23; seed < 33 && !sun; seed++) {
        const t = tide.createTide({ seed, upgrades: MAXED }), bot = bots.tideBot('expert', R.createRng(seed), () => 'keep');
        tide.forceBite(t, 'sun');
        run(t, t => bot.input(t, T.step), t => t.phase === 'catch' || t.phase === 'recover', 120);
        if (t.phase === 'catch') sun = t;
      }
      assert.ok(sun, 'the Sun was landed');
      assert.equal(sun.catch.species, 'sun'); assert.equal(sun.gary, Infinity);
      run(sun, idle, () => false, 10);
      assert.equal(sun.phase, 'catch', 'Gary never takes the Sun');
      tide.stepTide(sun, press('baitPressed'), T.step, []);
      assert.equal(sun.phase, 'catch', 'nothing bites the Sun');
    });

    await test('junk comes up without a fight, can be tossed and never becomes bait', () => {
      const t = tide.createTide({ seed: 31, upgrades: tackle.NO_UPGRADES });
      tide.forceBite(t, 'bottle');
      run(t, idle, t => t.phase === 'bite'); tide.stepTide(t, press(), T.step, []);
      assert.equal(t.phase, 'catch'); assert.equal(t.catch.junk, true); assert.ok(t.catch.note);
      assert.equal(tide.canBait(t.catch), false);
      run(t, idle, () => false, .6);
      const events = []; tide.stepTide(t, press('baitPressed'), T.step, events);
      assert.ok(events.some(e => e.type === 'tossed')); assert.equal(t.live, null);
    });

    await test('an overcharged cast plays a gag and spends nothing', () => {
      const t = tide.createTide({ seed: 41, upgrades: tackle.NO_UPGRADES });
      const events = run(t, t => t.phase === 'ready' ? press() : { ...tide.IDLE_TIDE, primary: true }, t => t.phase === 'gag', 5);
      assert.ok(events.some(e => e.type === 'gag')); assert.equal(t.worms, tackle.wormsFor(tackle.NO_UPGRADES));
    });

    await test('ambushes swap in the next tier up, below tier 6 only, about 6% of the time', () => {
      let fights = 0, ambushes = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const { events } = playTide(seed, 'expert', bots.baitUpTo(S.TOP_TIER), MAXED);
        fights += events.filter(e => e.type === 'hooked' && S.speciesById(e.species).tier >= 0).length;
        for (const e of events.filter(e => e.type === 'ambush')) {
          ambushes++;
          assert.equal(S.speciesById(e.species).tier, S.speciesById(e.swallowed).tier + 1);
          assert.ok(S.speciesById(e.swallowed).tier < 6);
        }
      }
      assert.ok(ambushes / fights > .02 && ambushes / fights < .12, `ambush rate ${(ambushes / fights).toFixed(3)}`);
    });

    await test('the food chain: values rise about 3x a tier, every tier has fish, everyone has lines', () => {
      for (let tier = 1; tier < S.TIERS.length; tier++) {
        const ratio = S.TIERS[tier].clams / S.TIERS[tier - 1].clams;
        assert.ok(ratio >= 2.5 && ratio <= 3.7, `tier ${tier} pays ${ratio.toFixed(2)}x`);
        assert.ok(S.TIERS[tier].force > S.TIERS[tier - 1].force && S.TIERS[tier].tell < S.TIERS[tier - 1].tell);
      }
      for (let tier = 0; tier <= S.TOP_TIER; tier++) assert.ok(S.speciesOfTier(tier).length >= 1, `tier ${tier} has fish`);
      assert.deepEqual(S.speciesOfTier(S.TOP_TIER).map(s => s.id), ['sun']);
      assert.equal(new Set(S.ALL_CATCHES.map(s => s.id)).size, S.ALL_CATCHES.length, 'ids are unique');
      for (const s of S.SPECIES) {
        assert.ok(s.lines.catch && s.lines.bait && s.lines.escape, `${s.id} has its lines`);
        assert.ok(s.lines.heckles.length >= 3, `${s.id} heckles`);
        assert.ok(s.weight[0] > 0 && s.weight[1] >= s.weight[0]);
      }
      for (const j of S.JUNK) { assert.ok(j.lines.catch && j.clams > 0 && S.JUNK_WEIGHTS[j.id] > 0, `${j.id} is junk`); }
      assert.match(S.tideHeadline({ bestTier: 7, bestSpecies: 'sun', garyThefts: 0, snaps: 0, junkOnly: false, clams: 1 }), /SUN/);
    });

    await test('records survive corrupt, blocked and partial storage; upgrades cost clams and cap', () => {
      const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
      assert.deepEqual(progress.loadFishingProgress(storage), progress.emptyFishingProgress());
      store.set(progress.FISHING_PROGRESS_KEY, '{nope');
      assert.deepEqual(progress.loadFishingProgress(storage), progress.emptyFishingProgress());
      store.set(progress.FISHING_PROGRESS_KEY, JSON.stringify({ clams: -5, upgrades: { line: 9, reel: 'x' }, dex: { sardine: { caught: 2, best: .2, variants: ['shiny', 'rainbow'] }, dragon: {} }, daily: { date: 'soon' } }));
      const partial = progress.loadFishingProgress(storage);
      assert.equal(partial.clams, 0); assert.equal(partial.upgrades.line, 3); assert.equal(partial.upgrades.reel, 0);
      assert.deepEqual(partial.dex.sardine.variants, ['shiny']); assert.equal(partial.dex.dragon, undefined); assert.equal(partial.daily.date, '');
      const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
      assert.deepEqual(progress.loadFishingProgress(blocked), progress.emptyFishingProgress());
      assert.equal(progress.saveFishingProgress(partial, blocked), false);
      assert.equal(progress.loadFishingProgress(null).clams, 0);

      const { t } = playTide(5, 'expert', bots.baitUpTo(2));
      const outcome = progress.recordTide(progress.emptyFishingProgress(), t.result, '2026-10-01');
      assert.equal(outcome.progress.clams, t.result.clams); assert.equal(outcome.progress.tides, 1);
      assert.ok(outcome.newSpecies.length >= 1); assert.equal(outcome.progress.tutorialDone, true);
      assert.equal(progress.saveFishingProgress(outcome.progress, storage), true);
      assert.deepEqual(progress.loadFishingProgress(storage), outcome.progress);

      let rich = { ...progress.emptyFishingProgress(), clams: 3150 };
      const first = progress.buyUpgrade(rich, 'line'); assert.equal(first.bought, true); assert.equal(first.progress.clams, 3000);
      rich = progress.buyUpgrade(progress.buyUpgrade(first.progress, 'line').progress, 'line').progress;
      assert.equal(rich.upgrades.line, 3); assert.equal(progress.buyUpgrade(rich, 'line').bought, false, 'level 3 is the cap');
      assert.equal(progress.buyUpgrade(progress.emptyFishingProgress(), 'reel').bought, false, 'no clams, no reel');
    });

    await test('the Catch of the Day is stable for a date, varies by date, and stays in reach', () => {
      assert.deepEqual(progress.dailyCatch('2026-10-01'), progress.dailyCatch('2026-10-01'));
      const days = Array.from({ length: 30 }, (_, i) => progress.dailyCatch(`2026-11-${String(i + 1).padStart(2, '0')}`));
      assert.ok(new Set(days.map(d => d.species)).size >= 4);
      for (const d of days) { assert.ok(S.speciesById(d.species).tier <= 3); assert.ok(['normal', 'chonky', 'shiny'].includes(d.variant)); }
      assert.match(progress.localDate(new Date(2026, 9, 1)), /^2026-10-01$/);
      // The wanted fish pays triple.
      const t = tide.createTide({ seed: 2, upgrades: tackle.NO_UPGRADES, daily: { species: 'sardine', variant: 'normal' } });
      tide.forceBite(t, 'sardine', 'normal');
      const bot = bots.tideBot('expert', R.createRng(3));
      run(t, t => bot.input(t, T.step), t => t.phase === 'catch');
      assert.equal(t.catch.daily, true); assert.ok(t.catch.clams >= 3 * 8);
    });

    await test('the spot stands on the pier deck and its cast fan is open water the camera sees over the rail', () => {
      assert.ok(pier.pierSurfaceAt(spot.ANGLER.x, spot.ANGLER.z), 'the angler stands on the deck');
      assert.ok(pier.pierSurfaceAt(spot.PROMPT.x, spot.PROMPT.z), 'the prompt is on the deck');
      const C = T.camera, camera = map.mapPoint(spot.ANGLER.x, spot.RAIL_Z + C.back, spot.DECK + C.height);
      for (const aim of [-T.cast.aim, 0, T.cast.aim]) for (const distance of [T.cast.minDistance, T.cast.pilings, T.cast.channel, T.cast.maxDistance]) {
        const chart = spot.castChart(aim, distance);
        assert.ok(chart.z > map.MAP_MIN_Z + 1, 'the fan stays clear of the chart seam');
        assert.ok(surfaces.townSurfaceAt(chart.x, chart.z).height < map.MAP_SEA_LEVEL - .5, `open water at ${distance} m, aim ${aim.toFixed(2)}`);
        const water = map.mapPoint(chart.x, chart.z, map.MAP_SEA_LEVEL), ray = water.clone().sub(camera);
        let clearedRail = false;
        for (let k = 1; k < 200; k++) {
          const point = camera.clone().addScaledVector(ray, k / 200), here = map.mapCoordinates(point), height = point.length() - map.MAP_RADIUS;
          assert.ok(height > map.MAP_SEA_LEVEL + 1e-4, `the sightline to ${distance} m (aim ${aim.toFixed(2)}) stays above the sea, but sample ${k} is at ${height.toFixed(3)}`);
          if (!clearedRail && here.z <= spot.RAIL_Z) { clearedRail = true; assert.ok(height > spot.RAIL_TOP + .1, `the rail hides nothing at ${distance} m`); }
        }
        const graze = Math.asin(camera.clone().sub(water).normalize().dot(water.clone().normalize())) * 180 / Math.PI;
        assert.ok(graze >= 8, `the bobber at ${distance} m is seen ${graze.toFixed(1)}° above the water`);
      }
    });
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
