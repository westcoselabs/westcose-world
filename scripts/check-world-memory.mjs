import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.WORLD_PRODUCTION_URL || 'http://127.0.0.1:3001';
const output = 'docs/qa/dead-coast-atmosphere/memory-check.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = {
  checkedAt: new Date().toISOString(), browser: await browser.version(),
  method: 'Fresh production context. CDP heap snapshots distinguish construction garbage from retained JS heap. Explicit collection is diagnostic only, not normal user behavior; GPU memory is excluded. Route exits and returns use actual Next.js links, without document reloads.',
  samples: [], errors: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) report.errors.push(message.text());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  async function sample(label, collect = false) {
    if (collect) await cdp.send('HeapProfiler.collectGarbage');
    report.samples.push({ label, collected: collect, url: page.url(), canvasCount: await page.locator('canvas').count(), ...(await cdp.send('Runtime.getHeapUsage')) });
  }
  await page.goto(`${base}/world`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await sample('initial-ready');
  await page.getByTestId('enter-world').click();
  await page.waitForTimeout(8000);
  await sample('settled-eight-seconds');
  await sample('world-after-collection', true);
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByRole('button', { name: 'Field notes', exact: true }).click();
    await page.getByRole('button', { name: 'Project Studio', exact: true }).click();
    await page.getByRole('link', { name: 'View project', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.waitForTimeout(2000);
    await sample(`after-route-exit-${cycle}`, true);
    if (cycle === 1) {
      await page.getByRole('link', { name: 'Back to world', exact: true }).first().click();
      await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
      await page.getByTestId('enter-world').click();
      await page.waitForTimeout(4000);
      await sample('world-after-return', true);
    }
  }
  await mkdir('docs/qa/dead-coast-atmosphere', { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  expect(report.errors).toEqual([]);
  console.log(JSON.stringify(report.samples, null, 2));
} finally { await browser.close(); }
