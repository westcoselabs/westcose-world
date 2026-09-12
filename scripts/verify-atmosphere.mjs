import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Run after the scene is frozen. These views complement the real-input suite;
// screenshots require visual inspection and are not a numerical lighting score.
const base = process.env.WORLD_MEASURE_URL || 'http://127.0.0.1:3000';
const output = process.env.WORLD_LIGHTING_OUTPUT || 'docs/qa/dead-coast-atmosphere';
await mkdir(`${output}/lighting`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = { checkedAt: new Date().toISOString(), browser: await browser.version(), captures: [], errors: [], renderErrors: [] };
const state = page => page.evaluate(() => window.__WESTCOSE_WORLD__.getState());

async function enter(page) {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) {
      report.renderErrors.push(message.text());
    }
  });
  await page.goto(`${base}/world`);
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await state(page)).overviewTransition).toBeLessThan(0.01);
}

async function capture(page, name) {
  await page.waitForTimeout(350);
  const current = await state(page);
  expect(['exploring', 'overview']).toContain(current.mode);
  expect([current.position.x, current.position.y, current.position.z, current.cameraDistance].every(Number.isFinite)).toBe(true);
  expect(current.cameraDistance).toBeGreaterThan(0.3);
  expect(current.counters.drawCalls).toBeGreaterThan(0);
  await page.screenshot({ path: `${output}/lighting/${name}.jpg`, type: 'jpeg', quality: 88 });
  report.captures.push({ name, viewport: page.viewportSize(), state: current });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await enter(page);
  await capture(page, 'entry');

  for (const fixture of ['circuit', 'pole', 'south']) {
    await page.evaluate(name => window.__WESTCOSE_WORLD__.spawn(name), fixture);
    await expect.poll(async () => { const current = await state(page); return current.grounded || current.swimming; }).toBe(true);
    await capture(page, fixture);
  }

  await page.evaluate(() => window.__WESTCOSE_WORLD__.spawn('entry'));
  await expect.poll(async () => (await state(page)).grounded).toBe(true);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await page.getByRole('checkbox', { name: 'Reduced effects' }).check();
  await page.getByRole('button', { name: 'Resume exploring' }).click();
  await capture(page, 'entry-reduced');
  await page.getByRole('button', { name: 'Planet view', exact: true }).click();
  await expect.poll(async () => (await state(page)).overviewTransition).toBeGreaterThan(0.99);
  await capture(page, 'globe-reduced');
  await page.getByRole('button', { name: 'Back to walking', exact: true }).first().click();
  await expect.poll(async () => (await state(page)).overviewTransition).toBeLessThan(0.01);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Reduced effects' }).uncheck();
  await page.getByRole('button', { name: 'Resume exploring' }).click();
  await page.getByRole('button', { name: 'Planet view', exact: true }).click();
  await expect.poll(async () => (await state(page)).overviewTransition).toBeGreaterThan(0.99);
  await capture(page, 'globe');
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  await enter(phonePage);
  await capture(phonePage, 'phone-entry');
  await phonePage.getByRole('button', { name: 'Planet view', exact: true }).click();
  await expect.poll(async () => (await state(phonePage)).overviewTransition).toBeGreaterThan(0.99);
  await capture(phonePage, 'phone-globe');
  await phone.close();
  await writeFile(`${output}/lighting-check.json`, JSON.stringify(report, null, 2) + '\n');
  expect(report.errors).toEqual([]);
  expect(report.renderErrors).toEqual([]);
  console.log(`Saved ${report.captures.length} lighting views; ${report.errors.length} page errors; ${report.renderErrors.length} rendering errors.`);
} finally {
  await browser.close();
}
