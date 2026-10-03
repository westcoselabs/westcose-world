import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadConceptApproachViews } from './concept-review-viewpoints.mjs';

const base = process.env.WORLD_CAPTURE_URL || 'http://127.0.0.1:3000';
const directory = process.env.WORLD_CAPTURE_DIR || 'docs/qa/globe-refinement/views';
const settleMilliseconds = Number(process.env.WORLD_CAPTURE_SETTLE_MS || 1600);
const appendApproach = process.env.WORLD_CAPTURE_APPEND_APPROACH;
const fixtures = (process.env.WORLD_CAPTURE_FIXTURES || 'courtyard,promenade,beach,pierapproach,pieroutward,skatepark,stairs,resort,summit,lighthouse,cave,grotto').split(',').filter(Boolean);
const approachViews = loadConceptApproachViews();
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter(profile => !process.env.WORLD_CAPTURE_PROFILES || process.env.WORLD_CAPTURE_PROFILES.split(',').includes(profile.name));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = appendApproach ? JSON.parse(await readFile(join(dirname(directory), 'capture-state.json'), 'utf8')) : { capturedAt: new Date().toISOString(), base, settleMilliseconds, method: 'Real browser captures of the procedural concept after camera settling. Debug fixtures only place the existing player and camera; route traversability is checked separately by check-planet.mjs. Pier and resort summit framing is asserted against the actual rendered camera projection.', errors: [], framingChecks: [], views: [] };
if (appendApproach) report.appendedAt = new Date().toISOString();
try {
  for (const profile of profiles) {
    const { name, ...options } = profile;
    const context = await browser.newContext({ ...options, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ profile: name, type: 'page', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) {
        report.errors.push({ profile: name, type: 'render', message: message.text() });
      }
    });
    await page.goto(base + '/world');
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
    await page.getByTestId('enter-world').click();
    const state = () => page.evaluate(() => window.__WESTCOSE_WORLD__.getState());
    await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
    async function capture(label, fixture) {
      await page.waitForTimeout(settleMilliseconds);
      if (['pieroutward', 'resort'].includes(fixture) && !label.startsWith('globe-')) {
        await expect.poll(async () => (await state()).landmarkFraming?.summitVisible, { timeout: 5000 }).toBe(true);
        await expect.poll(async () => (await state()).landmarkFraming.summitNdc.y, { timeout: 5000 }).toBeLessThan(.98);
        const framing = (await state()).landmarkFraming;
        report.framingChecks.push({ profile: name, fixture, summitVisible: framing.summitVisible, summitNdc: framing.summitNdc });
      }
      const filename = `${name}-${label}.jpg`;
      await page.screenshot({ path: join(directory, filename), type: 'jpeg', quality: 90 });
      report.views.push({ filename, label, profile: name, viewport: options.viewport, fixture, state: await state() });
    }
    if (!appendApproach) {
      await capture('00-courtyard-load', 'fresh-load');
      await page.getByRole('button', { name: 'Planet view', exact: true }).click();
      await expect.poll(async () => (await state()).overviewTransition).toBeGreaterThan(.995);
      await capture('01-globe-overview', 'overview');
    }
    for (const [index, fixture] of (appendApproach ? [] : fixtures).entries()) {
      await page.evaluate(fixture => window.__WESTCOSE_WORLD__.spawn(fixture), fixture);
      await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
      await capture(`${String(index + 2).padStart(2, '0')}-${fixture}`, fixture);
    }
    for (const { label, x, z, facing } of approachViews.filter(view => !appendApproach || view.label === appendApproach)) {
      await page.evaluate(([x, z, facing]) => window.__WESTCOSE_WORLD__.spawnAt(x, z, facing), [x, z, facing]);
      await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
      await capture(label, { x, z, facing });
    }
    for (const [fixture, label] of (appendApproach ? [] : [['resort', 'globe-resort'], ['farside', 'globe-farside'], ['pieroutward', 'globe-ocean']])) {
      await page.evaluate(fixture => window.__WESTCOSE_WORLD__.spawn(fixture), fixture);
      await expect.poll(async () => (await state()).overviewTransition).toBeLessThan(.005);
      await page.getByRole('button', { name: 'Planet view', exact: true }).click();
      await expect.poll(async () => (await state()).overviewTransition).toBeGreaterThan(.995);
      await capture(label, fixture);
    }
    await context.close();
    console.log(`${name}: ${report.views.filter(view => view.profile === name).length} views captured; browser context closed`);
  }
} catch (error) {
  report.errors.push({ type: 'capture', message: error.message });
  throw error;
} finally {
  await browser.close();
  const reportPath = join(dirname(directory), 'capture-state.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ directory, views: report.views.length, errors: report.errors }, null, 2));
}
if (report.errors.length) throw new Error('Concept captures reported browser/rendering errors. Inspect capture-state.json.');
