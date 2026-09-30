import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Captures the radius-72 world and snowboard mountain from the real game cameras.
// Usage: WORLD_CAPTURE_URL=http://127.0.0.1:3100 node scripts/capture-snowboard-world.mjs
const repository = process.cwd();
const world = path.join(repository, 'src/features/world');
const destination = path.resolve(process.env.WORLD_SNOWBOARD_CAPTURE_DIR || 'docs/qa/snowboard-v1/world');
const base = process.env.WORLD_CAPTURE_URL || 'http://127.0.0.1:3000';
const settleMilliseconds = Number(process.env.WORLD_CAPTURE_SETTLE_MS || 1800);
mkdirSync(path.join(destination, 'views'), { recursive: true });
const allFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? allFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sourceFingerprint = () => {
  const hash = createHash('sha256');
  for (const file of allFiles(world).sort()) { hash.update(path.relative(world, file)); hash.update(readFileSync(file)); }
  return hash.digest('hex');
};

// Compile the pure data modules so views follow the real run centerlines.
mkdirSync(path.join(repository, '.next'), { recursive: true });
const compiled = mkdtempSync(path.join(repository, '.next', 'snowboard-capture-'));
for (const file of readdirSync(path.join(world, 'data')).filter(name => name.endsWith('.ts'))) {
  const source = readFileSync(path.join(world, 'data', file), 'utf8');
  writeFileSync(path.join(compiled, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
}
const require = createRequire(path.join(compiled, 'index.js'));
const { SKI_RUNS } = require('./ski-runs.js');
const { MOUNTAIN_LAYOUT } = require('./mountain-layout.js');
const { MAP_RADIUS } = require('./world-map.js');
rmSync(compiled, { recursive: true, force: true });

const along = (run, progress) => {
  const target = progress * run.length;
  const index = Math.max(0, run.samples.findIndex(sample => sample.s >= target));
  const a = run.samples[Math.max(0, index - 3)], b = run.samples[Math.min(run.samples.length - 1, index + 6)];
  const sample = run.samples[index];
  return { x: sample.x, z: sample.z, facing: { east: b.x - a.x, north: (b.z - a.z) * Math.cos(sample.x / MAP_RADIUS) } };
};
const views = [
  { id: 'pier-seaward', fixture: 'pieroutward', critical: true },
  { id: 'pier-landward', fixture: 'pierhead', critical: true },
  { id: 'courtyard', fixture: 'entry', critical: true },
  { id: 'resort-forecourt', x: MOUNTAIN_LAYOUT.pedestrianArrival.x, z: MOUNTAIN_LAYOUT.pedestrianArrival.z, facing: 'north', critical: true },
  { id: 'ticket-booth', fixture: 'tickets', critical: true },
  { id: 'resort-finish-uphill', x: MOUNTAIN_LAYOUT.finishAreas.resort.x, z: MOUNTAIN_LAYOUT.finishAreas.resort.z, facing: 'north', critical: true },
  { id: 'summit-plateau', fixture: 'summit', critical: true },
  ...SKI_RUNS.flatMap(run => [['start', .04], ['middle', .5]].map(([section, progress]) => ({ id: `run-${run.number}-${section}`, ...along(run, progress), critical: section === 'middle' }))),
  { id: 'west-run-out', x: MOUNTAIN_LAYOUT.finishAreas.west.x, z: MOUNTAIN_LAYOUT.finishAreas.west.z, facing: 'south' },
  { id: 'east-run-out', x: MOUNTAIN_LAYOUT.finishAreas.east.x, z: MOUNTAIN_LAYOUT.finishAreas.east.z, facing: 'south' },
  { id: 'lighthouse-cove', fixture: 'hiddenbeach' },
];
const globeViews = [
  { id: 'globe-town', fixture: 'entry', globe: true, critical: true },
  { id: 'globe-mountain-front', x: 0, z: 120, facing: 'north', globe: true, critical: true },
  { id: 'globe-mountain-rear', x: 0, z: 280, facing: 'south', globe: true },
];
const report = {
  capturedAt: new Date().toISOString(), base, sourceBefore: sourceFingerprint(), settleMilliseconds,
  method: 'Actual live third-person and globe cameras. Debug placement changes player position and heading only.',
  errors: [], consoleErrors: [], views: [],
};
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const profile of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }].filter(p => !process.env.WORLD_CAPTURE_PROFILES || process.env.WORLD_CAPTURE_PROFILES.split(',').includes(p.id))) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, isMobile: profile.id === 'phone', hasTouch: profile.id === 'phone' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ profile: profile.id, type: 'page', message: error.message }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const entry = { profile: profile.id, type: 'console', message: message.text() };
      report.consoleErrors.push(entry);
      if (/THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) report.errors.push(entry);
    });
    const started = Date.now();
    await page.goto(base + '/world');
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 90000 });
    report[`${profile.id}ReadyMs`] = Date.now() - started;
    await page.getByTestId('enter-world').click();
    const state = () => page.evaluate(() => window.__WESTCOSE_WORLD__.getState());
    await expect.poll(async () => (await state()).overviewTransition, { timeout: 15000 }).toBeLessThan(.005);
    const selected = [...views, ...globeViews].filter(view => (profile.id === 'desktop' || view.critical) && (!process.env.WORLD_SNOWBOARD_VIEWS || process.env.WORLD_SNOWBOARD_VIEWS.split(',').includes(view.id)));
    for (const view of selected) {
      await page.evaluate(view => {
        if (view.fixture) window.__WESTCOSE_WORLD__.spawn(view.fixture);
        else window.__WESTCOSE_WORLD__.spawnAt(view.x, view.z, view.facing);
      }, view);
      await expect.poll(async () => (await state()).overviewTransition, { timeout: 15000 }).toBeLessThan(.005);
      if (view.globe) {
        await page.getByRole('button', { name: 'Planet view', exact: true }).click();
        await expect.poll(async () => (await state()).overviewTransition, { timeout: 15000 }).toBeGreaterThan(.995);
      }
      await page.waitForTimeout(settleMilliseconds);
      const filename = `${profile.id}-${view.id}.jpg`;
      await page.screenshot({ path: path.join(destination, 'views', filename), type: 'jpeg', quality: 88 });
      const actual = await state();
      report.views.push({ filename, profile: profile.id, fixture: view, area: actual.currentArea, mapX: actual.mapX, mapZ: actual.mapZ, radius: actual.radius, counters: actual.counters, summitVisible: actual.landmarkFraming.summitVisible });
      if (view.globe) await page.getByRole('button', { name: 'Back to walking', exact: true }).first().click();
      console.log(`${profile.id}: ${view.id} captured (${actual.currentArea})`);
    }
    await context.close();
  }
} catch (error) {
  report.errors.push({ type: 'capture', message: error.message });
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  report.sourceAfter = sourceFingerprint();
  report.sourceUnchanged = report.sourceBefore === report.sourceAfter;
  writeFileSync(path.join(destination, 'capture-state.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ destination, views: report.views.length, sourceUnchanged: report.sourceUnchanged, errors: report.errors, desktopReadyMs: report.desktopReadyMs, phoneReadyMs: report.phoneReadyMs }));
}
if (report.errors.length) process.exitCode = 1;
