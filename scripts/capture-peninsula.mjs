import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd(), world = path.join(repository, 'src/features/world');
const destination = path.resolve(process.env.WORLD_PENINSULA_CAPTURE_DIR || 'docs/qa/peninsula-rebuild/final');
const base = process.env.WORLD_CAPTURE_URL || 'http://127.0.0.1:3000';
const artifacts = path.join(repository, '.next');
mkdirSync(artifacts, { recursive: true }); mkdirSync(path.join(destination, 'views'), { recursive: true });
const temporary = mkdtempSync(path.join(artifacts, 'peninsula-capture-'));
const allFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? allFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sourceFingerprint = () => {
  const hash = createHash('sha256');
  for (const file of allFiles(world).sort()) { hash.update(path.relative(world, file)); hash.update(readFileSync(file)); }
  return hash.digest('hex');
};
const report = { capturedAt: new Date().toISOString(), base, sourceBefore: sourceFingerprint(), method: 'Actual current third-person camera, ordinary heading turns only; no pitch/framing workaround or scene edits. Debug placement positions the visitor; independent preservation and physical route checks establish geometry safety.', errors: [], views: [] };
let browser;
try {
  for (const name of readdirSync(path.join(world, 'data')).filter(name => name.endsWith('.ts'))) {
    const source = path.join(world, 'data', name);
    const result = ts.transpileModule(readFileSync(source, 'utf8'), { fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    writeFileSync(path.join(temporary, name.replace(/\.ts$/, '.js')), result.outputText);
  }
  const require = createRequire(path.join(repository, 'package.json'));
  const landmarks = require(path.join(temporary, 'concept-landmarks.js'));
  const town = require(path.join(temporary, 'town-layout.js'));
  const map = require(path.join(temporary, 'world-map.js'));
  const tower = landmarks.LIGHTHOUSE;
  const toward = (x, z, targetX, targetZ) => {
    const frame = map.mapFrame(x, z), tangent = map.mapDirection(targetX, targetZ).projectOnPlane(frame.up).normalize();
    return { east: tangent.dot(frame.east), north: tangent.dot(frame.north) };
  };
  const caveEntry = landmarks.CAVE_POINTS[0], caveExit = landmarks.CAVE_POINTS.at(-1), caveMiddle = landmarks.CAVE_POINTS[Math.floor(landmarks.CAVE_POINTS.length / 2)];
  const terrace = town.TOWN_ROUTES.find(route => route.id === 'lighthouse-trail').points.at(-1);
  const hidden = town.COASTAL_RADIO;
  const views = [
    { id: 'courtyard-toward-lighthouse', x: 0, z: 8, facing: toward(0, 8, tower.x, tower.z) },
    { id: 'main-street-lighthouse', x: 0, z: -10, facing: toward(0, -10, tower.x, tower.z) },
    { id: 'boardwalk-center-lighthouse', x: 0, z: -16, facing: toward(0, -16, tower.x, tower.z) },
    { id: 'boardwalk-west-lighthouse', x: -12, z: -16, facing: toward(-12, -16, tower.x, tower.z) },
    { id: 'lighthouse-terrace', x: terrace[0], z: terrace[1], facing: toward(...terrace, tower.x, tower.z) },
    { id: 'public-cave-entry', x: caveEntry[0] - 2, z: caveEntry[1] - 3, facing: toward(caveEntry[0] - 2, caveEntry[1] - 3, ...caveMiddle) },
    { id: 'covered-cave', x: caveMiddle[0], z: caveMiddle[1], facing: toward(...caveMiddle, ...caveExit) },
    { id: 'hidden-beach-ocean', x: hidden.x, z: hidden.z, facing: 'east' },
  ];
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const profile of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }]
    .filter(profile => !process.env.WORLD_CAPTURE_PROFILES || process.env.WORLD_CAPTURE_PROFILES.split(',').includes(profile.id))) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, isMobile: profile.id === 'phone', hasTouch: profile.id === 'phone' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ profile: profile.id, type: 'page', message: error.message }));
    page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) report.errors.push({ profile: profile.id, type: 'render', message: message.text() }); });
    await page.goto(base + '/world');
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45000 });
    await page.getByTestId('enter-world').click();
    const state = () => page.evaluate(() => window.__WESTCOSE_WORLD__.getState());
    await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
    const capture = async (label, fixture) => {
      await page.waitForTimeout(1600);
      const filename = `${profile.id}-${label}.jpg`;
      await page.screenshot({ path: path.join(destination, 'views', filename), type: 'jpeg', quality: 90 });
      report.views.push({ filename, profile: profile.id, viewport: { width: profile.width, height: profile.height }, fixture, state: await state() });
    };
    await capture('fresh-courtyard', 'fresh-load');
    for (const view of views.filter(view => !process.env.WORLD_PENINSULA_VIEWS || process.env.WORLD_PENINSULA_VIEWS.split(',').includes(view.id))) {
      await page.evaluate(({ x, z, facing }) => window.__WESTCOSE_WORLD__.spawnAt(x, z, facing), view);
      await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
      await capture(view.id, view);
    }
    for (const view of (process.env.WORLD_PENINSULA_VIEWS ? [] : [views.find(view => view.id === 'boardwalk-center-lighthouse'), views.at(-1)])) {
      await page.evaluate(({ x, z, facing }) => window.__WESTCOSE_WORLD__.spawnAt(x, z, facing), view);
      await page.getByRole('button', { name: 'Planet view', exact: true }).click();
      await expect.poll(async () => (await state()).overviewTransition).toBeGreaterThan(.995);
      await capture('globe-' + view.id, view);
    }
    await context.close();
    console.log(`${profile.id}: capture context closed`);
  }
} catch (error) {
  report.errors.push({ type: 'capture', message: error.message }); throw error;
} finally {
  if (browser) await browser.close();
  report.sourceAfter = sourceFingerprint(); report.sourceUnchanged = report.sourceBefore === report.sourceAfter;
  if (!report.sourceUnchanged) report.errors.push({ type: 'source', message: 'World source changed during capture; do not treat mixed-state images as final verification.' });
  writeFileSync(path.join(destination, 'capture-state.json'), JSON.stringify(report, null, 2) + '\n');
  if (path.dirname(path.resolve(temporary)) !== artifacts || !path.basename(temporary).startsWith('peninsula-capture-')) throw new Error('Unexpected peninsula capture directory');
  rmSync(temporary, { recursive: true, force: true });
  console.log(JSON.stringify({ destination, views: report.views.length, sourceUnchanged: report.sourceUnchanged, errors: report.errors, browserClosed: true }));
}
if (report.errors.length) process.exitCode = 1;
