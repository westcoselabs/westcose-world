import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, platform, release } from 'node:os';

// Run on the same machine/browser for before-and-after comparisons. Optional:
// WORLD_MEASURE_URL, WORLD_PRODUCTION_URL, WORLD_MEASURE_OUTPUT, WORLD_SAMPLE_MS.
const base = process.env.WORLD_MEASURE_URL || 'http://127.0.0.1:3000';
const productionBase = process.env.WORLD_PRODUCTION_URL || 'http://127.0.0.1:3001';
const routeServerMode = process.env.WORLD_ROUTE_SERVER_MODE || (productionBase === base ? 'development' : 'production');
const output = process.env.WORLD_MEASURE_OUTPUT || 'docs/qa/dead-coast/performance.json';
const sampleMs = Number(process.env.WORLD_SAMPLE_MS || 8000);
async function featureSources(directory = 'src/features/world') {
  const files = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(files.map(entry => entry.isDirectory()
    ? featureSources(join(directory, entry.name))
    : /\.(?:ts|tsx|css)$/.test(entry.name) ? [join(directory, entry.name).replaceAll('\\', '/')] : []));
  return nested.flat().sort();
}
// Expansion modules and layout data count too: reject comparisons if any world
// source changes while frames/network requests are being sampled.
const fingerprint = async () => Object.fromEntries(await Promise.all((await featureSources()).map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const sourceBefore = await fingerprint();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = {
  measuredAt: new Date().toISOString(),
  environment: {
    os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, browser: await browser.version(),
    headless: true, softwareWebGLAllowed: true,
    notes: 'Local warm servers, fresh browser contexts, no network/CPU throttling. RAF callback cadence is an approximate render-loop FPS proxy, not GPU frame timing. Mobile uses viewport/touch emulation on the desktop CPU/GPU; it is not physical-phone performance. JS heap is Chrome-reported and excludes GPU memory. Render counts include shadow passes.',
  },
  // Keep the historical field names for comparison compatibility; label the
  // actual server mode when both sets of requests intentionally target dev.
  sampleMs, developmentBase: base, productionBase, routeServerMode,
  routeMeasurementNote: `The legacy productionRoutes field was measured against a ${routeServerMode} server.`,
  sourceBefore, profiles: [], productionRoutes: [],
};

function collectErrors(page) {
  const pageErrors = [], renderErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // Shader compilation failures can only reach console.error, without an
  // uncaught JS exception. Keep unrelated missing-favicon noise separate.
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) {
      renderErrors.push(message.text());
    }
  });
  return { pageErrors, renderErrors };
}

async function readPageMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const entries = [...resources, ...(navigation ? [navigation] : [])];
    const memory = performance.memory;
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      navigationMs: navigation?.duration,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd,
      transferBytes: entries.reduce((sum, item) => sum + (item.transferSize || 0), 0),
      encodedBodyBytes: entries.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0),
      decodedBodyBytes: entries.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0),
      resourceCount: resources.length,
      scriptCount: resources.filter(item => item.initiatorType === 'script').length,
      externalRequests: resources.map(item => item.name).filter(url => !url.startsWith(location.origin)),
      jsHeap: memory ? { usedBytes: memory.usedJSHeapSize, allocatedBytes: memory.totalJSHeapSize, limitBytes: memory.jsHeapSizeLimit } : null,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      canvasCount: document.querySelectorAll('canvas').length,
      debugExposed: typeof window.__WESTCOSE_WORLD__ !== 'undefined',
      world: window.__WESTCOSE_WORLD__?.getState() ?? null,
    };
  });
}

async function sample(page) {
  const frames = await page.evaluate(ms => new Promise(resolve => {
    const durations = [];
    let first = 0, previous = 0;
    function tick(now) {
      if (!first) first = now;
      if (previous) durations.push(now - previous);
      previous = now;
      if (now - first < ms) requestAnimationFrame(tick);
      else resolve(durations);
    }
    requestAnimationFrame(tick);
  }), sampleMs);
  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const elapsedMs = frames.reduce((sum, value) => sum + value, 0);
  return {
    frames: frames.length, elapsedMs, meanMs: elapsedMs / frames.length,
    medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1),
    approximateFps: 1000 * frames.length / elapsedMs,
    framesOver33ms: frames.filter(value => value > 33.4).length,
    frameTimesMs: frames,
    ...(await readPageMetrics(page)),
  };
}

try {
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    { name: 'phone-emulation', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  ]) {
    const { name, ...options } = profile;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = collectErrors(page);
    const started = performance.now();
    await page.goto(base + '/world');
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
    const readyWallMs = performance.now() - started;
    await page.getByTestId('enter-world').click();
    await expect.poll(() => page.evaluate(() => window.__WESTCOSE_WORLD__.getState().overviewTransition)).toBeLessThan(.005);
    await page.waitForTimeout(1000);
    const entry = await sample(page);
    await page.getByRole('button', { name: 'Planet view', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__WESTCOSE_WORLD__.getState().overviewTransition)).toBeGreaterThan(.995);
    await page.waitForTimeout(500);
    const overview = await sample(page);
    report.profiles.push({ name, ...options, readyWallMs, entry, overview, ...errors });
    console.log(`${name}: entry ${entry.approximateFps.toFixed(1)} RAF/s, p95 ${entry.p95Ms.toFixed(1)} ms; overview ${overview.approximateFps.toFixed(1)} RAF/s`);
    await context.close();
  }
  for (const route of ['/projects', '/about', '/services', '/games', '/labs', '/world']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = collectErrors(page);
    const started = performance.now();
    await page.goto(productionBase + route, { waitUntil: 'networkidle' });
    if (route === '/world') await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
    report.productionRoutes.push({ route, readyWallMs: performance.now() - started, ...(await readPageMetrics(page)), ...errors });
    await context.close();
  }
  report.sourceAfter = await fingerprint();
  report.sourceChangedDuringMeasurement = JSON.stringify(report.sourceBefore) !== JSON.stringify(report.sourceAfter);
  report.hasRenderingErrors = [...report.profiles, ...report.productionRoutes].some(result => result.pageErrors.length || result.renderErrors.length);
  const baselinePath = process.env.WORLD_BASELINE_PATH || 'docs/qa/dead-coast/baseline-performance.json';
  try {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const change = (before, after) => ({ baseline: before, current: after, difference: after - before, percentChange: before ? (after - before) / before * 100 : null });
    report.comparison = {
      baselinePath,
      sameBrowser: baseline.environment.browser === report.environment.browser,
      sameCpu: baseline.environment.cpu === report.environment.cpu,
      profiles: report.profiles.map(profile => {
        const before = baseline.profiles.find(candidate => candidate.name === profile.name);
        if (!before) return { name: profile.name, comparable: false };
        return {
          name: profile.name,
          sameRenderer: before.entry.renderer === profile.entry.renderer,
          sameViewport: JSON.stringify(before.viewport) === JSON.stringify(profile.viewport),
          entryRafPerSecond: change(before.entry.approximateFps, profile.entry.approximateFps),
          entryP95Ms: change(before.entry.p95Ms, profile.entry.p95Ms),
          entryDrawCalls: change(before.entry.world.counters.drawCalls, profile.entry.world.counters.drawCalls),
          entryTriangles: change(before.entry.world.counters.triangles, profile.entry.world.counters.triangles),
          overviewRafPerSecond: change(before.overview.approximateFps, profile.overview.approximateFps),
        };
      }),
      routes: report.productionRoutes.map(route => {
        const before = baseline.productionRoutes.find(candidate => candidate.route === route.route);
        return before ? {
          route: route.route,
          encodedBodyBytes: change(before.encodedBodyBytes, route.encodedBodyBytes),
          transferBytes: change(before.transferBytes, route.transferBytes),
        } : { route: route.route, comparable: false };
      }),
    };
  } catch (error) {
    report.comparison = { baselinePath, unavailable: error.message };
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output}; source changed during run: ${report.sourceChangedDuringMeasurement}`);
  if (report.hasRenderingErrors) throw new Error(`Rendering errors invalidate this measurement; inspect ${output}`);
  if (report.sourceChangedDuringMeasurement) throw new Error(`World source changed during this measurement; inspect ${output}`);
} finally { await browser.close(); }
