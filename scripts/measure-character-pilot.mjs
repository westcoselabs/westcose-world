import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';

// Production-only, repeatable spawn view. Run the same build/server/machine for comparisons.
const output = process.argv[2] || 'docs/qa/character-pilot/baseline';
const url = process.env.WORLD_PRODUCTION_URL || 'http://127.0.0.1:3001';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = {
  at: new Date().toISOString(), url, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(),
  controllerSha256: createHash('sha256').update(await readFile('src/features/world/player/PlayerController.tsx')).digest('hex'),
  browser: browser.version(), cpu: cpus()[0]?.model,
  notes: 'Production spawn, no movement, fresh contexts, 8 s samples after 4 s settling. RAF cadence is not GPU timing. Raw WebGL draw/triangle submissions INCLUDE shadow passes and instances; they are NOT unique scene geometry. Texture count is live WebGL allocations, NOT bytes. Physical geometry and GPU memory are unavailable from this probe. Phone is desktop emulation, NOT a real phone.',
  profiles: [],
};
try {
  for (const profile of [{ name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, { name: 'phone-emulated', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }]) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error' && /THREE|WebGL|Shader|GLSL/.test(msg.text())) errors.push(msg.text()); });
    await page.addInitScript(() => {
      const stats = window.__CHARACTER_PROBE__ = { draws: 0, triangles: 0, textures: 0 };
      const proto = WebGL2RenderingContext.prototype;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = proto[name];
        proto[name] = function (...args) {
          stats.draws++;
          const count = name.startsWith('drawElements') ? args[1] : args[2];
          const instances = name.endsWith('Instanced') ? args.at(-1) : 1;
          if (args[0] === this.TRIANGLES) stats.triangles += count / 3 * instances;
          else if (args[0] === this.TRIANGLE_STRIP || args[0] === this.TRIANGLE_FAN) stats.triangles += Math.max(0, count - 2) * instances;
          return original.apply(this, args);
        };
      }
      const textures = new Set();
      for (const name of ['createTexture', 'deleteTexture']) {
        const original = proto[name];
        proto[name] = function (...args) {
          const value = original.apply(this, args);
          if (name === 'createTexture') textures.add(value); else textures.delete(args[0]);
          stats.textures = textures.size;
          return value;
        };
      }
    });
    await page.goto(`${url}/world`);
    await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 60000 });
    await page.getByTestId('enter-world').click();
    await page.waitForTimeout(4000);
    const metrics = await page.evaluate(() => new Promise(resolve => {
      const frames = [], draws = [], triangles = [];
      let previous = 0, start = 0;
      const stats = window.__CHARACTER_PROBE__;
      const tick = now => {
        if (!start) start = now;
        if (previous) { frames.push(now - previous); draws.push(stats.draws); triangles.push(stats.triangles); }
        stats.draws = 0; stats.triangles = 0; previous = now;
        if (now - start < 8000) return requestAnimationFrame(tick);
        const distribution = list => {
          const sorted = [...list].sort((a, b) => a - b);
          return { mean: list.reduce((a, b) => a + b, 0) / list.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1) };
        };
        const resources = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];
        const gl = document.querySelector('canvas').getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        resolve({ frames: frames.length, frameMs: distribution(frames), drawSubmissions: distribution(draws), triangleSubmissions: distribution(triangles), liveWebGLTextures: stats.textures, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, transferBytes: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0), encodedBytes: resources.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0), developmentDebugExposed: !!window.__WESTCOSE_WORLD__ });
      };
      requestAnimationFrame(tick);
    }));
    await page.screenshot({ path: `${output}/${profile.name}.png` });
    report.profiles.push({ ...profile, ...metrics, errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/performance.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.profiles.map(({ name, frameMs, drawSubmissions, triangleSubmissions, errors }) => ({ name, frameMs, drawSubmissions, triangleSubmissions, errors })), null, 2));
if (report.profiles.some(profile => profile.errors.length || profile.developmentDebugExposed)) process.exitCode = 1;
