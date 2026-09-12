import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const base = process.env.WORLD_PRODUCTION_URL || 'http://127.0.0.1:3001';
const output = process.env.WORLD_PRODUCTION_CHECK_OUTPUT || 'docs/qa/dead-coast/production-check.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const results = {};
try {
  for (const route of ['/projects', '/about', '/services', '/games', '/labs', '/contact', '/world']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [], renderErrors = [];
    const scripts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) renderErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.request().resourceType() === 'script') scripts.push(response);
    });
    const response = await page.goto(base + route, { waitUntil: 'networkidle' });
    if (!response || response.status() >= 400) throw new Error(`${route}: canonical route failed to load`);
    if (route === '/world') {
      await page.getByTestId('enter-world').click({ timeout: 45_000 });
      await page.waitForTimeout(600);
    }
    const source = await Promise.all(scripts.map(async r => ({ url: r.url(), body: await r.text() })));
    const heavy = source.filter(r => /THREE\.WebGLRenderer|WebGLShadowMap/.test(r.body)).map(r => r.url);
    const metrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const navigation = performance.getEntriesByType('navigation');
      const entries = [...resources, ...navigation];
      return {
        transferBytes: entries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        encodedBodyBytes: entries.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
        decodedBodyBytes: entries.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
        debugExposed: typeof window.__WESTCOSE_WORLD__ !== 'undefined',
        canvasCount: document.querySelectorAll('canvas').length,
        externalRequests: resources.map(entry => entry.name).filter(url => !url.startsWith(location.origin)),
      };
    });
    results[route] = { ...metrics, errors, renderErrors, scriptRequests: source.length, heavyChunks: heavy };
    if (errors.length || renderErrors.length || metrics.debugExposed) throw new Error(`${route}: unexpected page/rendering errors or production debug exposure`);
    if (route !== '/world' && (heavy.length || metrics.canvasCount)) throw new Error(`${route}: loaded world code`);
    if (route === '/world' && (!heavy.length || metrics.canvasCount !== 1)) throw new Error('World runtime did not load');
    await context.close();
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
