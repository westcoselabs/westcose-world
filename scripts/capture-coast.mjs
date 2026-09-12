import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = process.env.WORLD_CAPTURE_DIR || 'docs/qa/westcose-coast/views';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [], captures = [];
async function open(options) {
  const page = await browser.newPage(options);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(m.text())) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:3000/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 90000 });
  await expect(page.locator('.planet-intro h1')).toHaveText('WESTCOSEWORLD');
  await page.waitForTimeout(1000);
  const heading = await page.locator('.planet-intro h1').boundingBox();
  assert.ok(heading && heading.x >= 0 && heading.x + heading.width <= options.viewport.width, 'Entry title fits the viewport');
  const file = options.isMobile ? '20-phone-entry' : '19-entry-screen';
  await page.screenshot({ path: `${directory}/${file}.jpg`, type: 'jpeg', quality: 88 });
  captures.push({ file, fixture: 'intro', overview: true, state: await page.evaluate(() => window.__WESTCOSE_WORLD__.getState()) });
  await page.getByTestId('enter-world').click({ timeout: 90000 });
  await page.waitForTimeout(1800);
  return page;
}
async function capture(page, file, fixture, overview = false, walkMs = 0) {
  await page.evaluate(name => window.__WESTCOSE_WORLD__.spawn(name), fixture);
  await page.waitForTimeout(1100);
  if (overview) {
    await page.getByRole('button', { name: 'Planet view', exact: true }).click();
    await page.waitForTimeout(2200);
  }
  if (walkMs) {
    await page.keyboard.down('w'); await page.waitForTimeout(walkMs); await page.keyboard.up('w');
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => window.__WESTCOSE_WORLD__.getState());
  await page.screenshot({ path: `${directory}/${file}.jpg`, type: 'jpeg', quality: 88 });
  captures.push({ file, fixture, overview, state });
  return state;
}
try {
  const page = await open({ viewport: { width: 1440, height: 900 } });
  for (const [file, fixture] of [['01-coast-overview','pierapproach'],['02-town-overview','entry'],['03-east-overview','eastgrove'],['04-far-overview','farside'],['05-west-overview','westgrove']]) {
    await capture(page, file, fixture, true);
  }
  for (const [file, fixture] of [['06-pier-entrance','pierapproach'],['07-pier-deck','pierhead'],['08-pier-from-beach','pierbeach'],['09-promenade','promenade'],['10-far-groves','farside'],['11-west-groves','westgrove'],['12-ridge','ridge'],['13-studio-row','entry'],['14-courtyard','courtyard'],['16-beach-loop','beach']]) {
    const state = await capture(page, file, fixture);
    if (fixture === 'beach') {
      assert.equal(state.supportKind, 'ground');
      assert.equal(state.hotspot, 'beach');
      await page.keyboard.press('e');
      await expect(page.getByRole('dialog', { name: 'You found the quiet side.', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
  const arcade = await capture(page, '15-arcade', 'arcade', false, 1000);
  assert.equal(arcade.interior, 'arcade');
  await page.close();
  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await capture(phone, '17-phone-pier', 'pierapproach');
  await capture(phone, '18-phone-globe', 'farside', true);
  await phone.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${directory}/../capture-state.json`, JSON.stringify({ generatedAt: new Date().toISOString(), errors, captures }, null, 2) + '\n');
}
console.log(JSON.stringify({ directory, errors, views: captures.length }, null, 2));
