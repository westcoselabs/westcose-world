import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd();
const world = path.join(repository, 'src/features/world');
const destination = path.resolve(process.env.WORLD_MOUNTAIN_CAPTURE_DIR || 'docs/qa/approved-layout-implementation/mountain');
const base = process.env.WORLD_CAPTURE_URL || 'http://127.0.0.1:3000';
const settleMilliseconds = Number(process.env.WORLD_CAPTURE_SETTLE_MS || 1800);
mkdirSync(path.join(destination, 'views'), { recursive: true });
const allFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? allFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sourceFingerprint = () => {
  const hash = createHash('sha256');
  for (const file of allFiles(world).sort()) { hash.update(path.relative(world, file)); hash.update(readFileSync(file)); }
  return hash.digest('hex');
};
const runtime = {};
new Function('exports', ts.transpileModule(readFileSync(path.join(world, 'data/mountain-layout.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(runtime);
const { MOUNTAIN_LAYOUT: layout } = runtime;
const toward = (x, z, targetX, targetZ) => {
  const a = x / 36, b = z / 36, ta = targetX / 36, tb = targetZ / 36;
  const target = [Math.sin(ta), Math.cos(ta) * Math.sin(tb), Math.cos(ta) * Math.cos(tb)];
  const east = [Math.cos(a), -Math.sin(a) * Math.sin(b), -Math.sin(a) * Math.cos(b)];
  const north = [0, Math.cos(b), -Math.sin(b)];
  return { east: target.reduce((sum, v, i) => sum + v * east[i], 0), north: target.reduce((sum, v, i) => sum + v * north[i], 0) };
};
const views = [
  { id: 'resort-pair', x: 1, z: 50, facing: 'north', critical: true },
  { id: 'resort-building-gap', x: 2.1, z: 53, facing: 'north' },
  { id: 'finish-uphill', x: 1, z: 65, facing: 'north', critical: true },
  { id: 'finish-toward-resort', x: 1, z: 65, facing: 'south', critical: true },
  { id: 'summit-decision', x: 0, z: 151, facing: 'south', critical: true },
  ...layout.runs.flatMap(run => [['upper', 141], ['middle', 110], ['lower', 80]].map(([section, targetZ]) => {
    let index = 0;
    for (let i = 1; i < run.points.length; i++) if (Math.abs(run.points[i][1] - targetZ) < Math.abs(run.points[index][1] - targetZ)) index = i;
    const q = run.points[index], target = run.points[Math.min(run.points.length - 1, index + 5)];
    return { id: `run-${run.number}-${section}`, x: q[0], z: q[1], facing: toward(q[0], q[1], target[0], target[1]), run: run.id, critical: section === 'middle' };
  })),
  { id: 'pier-seaward', fixture: 'pieroutward', critical: true },
];
const globeViews = [
  { id: 'globe-mountain-front', x: 0, z: 118, facing: 'north', globe: true, critical: true },
  { id: 'globe-resort-base', x: 1, z: 53.7, facing: 'north', globe: true },
  { id: 'globe-mountain-rear', x: 0, z: 160, facing: 'south', globe: true },
];
const report = {
  capturedAt: new Date().toISOString(), base, sourceBefore: sourceFingerprint(), settleMilliseconds,
  method: 'Actual live third-person and globe cameras. Debug placement changes player position and ordinary heading only; no camera pitch override, isolated proposal renderer, generated artwork, or live-source mutation. Geometry and movement validation are separate.',
  errors: [], consoleErrors: [], observations: [], views: [],
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
    await page.goto(base + '/world');
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 60000 });
    await page.getByTestId('enter-world').click();
    const state = () => page.evaluate(() => window.__WESTCOSE_WORLD__.getState());
    await expect.poll(async () => (await state()).overviewTransition, { timeout: 15000 }).toBeLessThan(.005);
    const selected = [...views, ...globeViews].filter(view => (profile.id === 'desktop' || view.critical) && (!process.env.WORLD_MOUNTAIN_VIEWS || process.env.WORLD_MOUNTAIN_VIEWS.split(',').includes(view.id)));
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
      await page.screenshot({ path: path.join(destination, 'views', filename), type: 'jpeg', quality: 90 });
      const actual = await state();
      const fingerprint = sourceFingerprint();
      report.views.push({ filename, profile: profile.id, viewport: { width: profile.width, height: profile.height }, fixture: view, state: actual, sourceFingerprint: fingerprint });
      if (!view.globe && (!actual.grounded || actual.swimming || actual.supportLayer !== 'upper')) report.observations.push({ filename, grounded: actual.grounded, swimming: actual.swimming, supportLayer: actual.supportLayer });
      if (fingerprint !== report.sourceBefore) throw new Error('World source changed during capture; images are previews, not final verification.');
      console.log(`${profile.id}: ${view.id} captured`);
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
  report.browserClosed = true;
  writeFileSync(path.join(destination, 'capture-state.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ destination, views: report.views.length, sourceUnchanged: report.sourceUnchanged, errors: report.errors, observations: report.observations, browserClosed: true }));
}
if (report.errors.length) process.exitCode = 1;
