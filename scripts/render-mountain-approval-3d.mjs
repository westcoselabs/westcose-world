/**
 * Documentation-only mountain approval renderer.
 *
 * It reads the isolated proposal module, samples it into a static docs payload,
 * serves only that payload + the local Three.js module on loopback, captures
 * approval views, and closes the helper. It never imports or starts the app.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = process.cwd();
const output = path.join(root, 'docs', 'design', 'mountain-approval');
const proposalPath = path.join(output, 'proposal-data.mjs');
const previewPath = path.join(output, 'preview-3d.html');
const previewDataPath = path.join(output, 'preview-3d-data.json');
const manifestPath = path.join(output, 'preview-3d-manifest.json');
const threeModulePath = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');
const threeCorePath = path.join(root, 'node_modules', 'three', 'build', 'three.core.js');

const required = [proposalPath, previewPath, threeModulePath, threeCorePath];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Required mountain approval file is missing: ${file}`);
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function sourceHash() {
  const sourceRoot = path.join(root, 'src');
  const hash = createHash('sha256');
  for (const file of sourceFiles(sourceRoot).sort()) {
    hash.update(path.relative(sourceRoot, file));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite; received ${value}`);
  return value;
}

function pointFrom(value, label) {
  if (Array.isArray(value)) return { x: assertFinite(value[0], `${label}.x`), z: assertFinite(value[1], `${label}.z`) };
  return { x: assertFinite(value?.x, `${label}.x`), z: assertFinite(value?.z, `${label}.z`) };
}

function boundsFor(proposal) {
  const points = [
    ...proposal.mountainBoundary,
    ...proposal.snowBoundary,
    proposal.summit,
    proposal.resort,
    proposal.spawnPad,
    proposal.finishApron,
    proposal.ticketHut,
    proposal.lodge,
    ...proposal.runs.flatMap(run => run.points),
  ].map((point, index) => pointFrom(point, `proposal point ${index}`));
  const xs = points.map(point => point.x);
  const zs = points.map(point => point.z);
  return {
    xMin: Math.floor(Math.min(...xs) - 6),
    xMax: Math.ceil(Math.max(...xs) + 6),
    zMin: Math.floor(Math.min(...zs) - 6),
    zMax: Math.ceil(Math.max(...zs) + 6),
  };
}

function sampleTerrain(proposal, proposalHeightAt, proposalBlendAt) {
  const bounds = boundsFor(proposal);
  const step = 1;
  const columns = Math.round((bounds.xMax - bounds.xMin) / step) + 1;
  const rows = Math.round((bounds.zMax - bounds.zMin) / step) + 1;
  const heights = new Array(columns * rows);
  const blends = new Array(columns * rows);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = bounds.xMin + column * step;
      const z = bounds.zMin + row * step;
      const index = row * columns + column;
      const height = assertFinite(proposalHeightAt(x, z), `proposalHeightAt(${x}, ${z})`);
      const blend = assertFinite(proposalBlendAt(x, z), `proposalBlendAt(${x}, ${z})`);
      heights[index] = height;
      blends[index] = blend;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }
  return { ...bounds, step, columns, rows, heights, blends, minHeight, maxHeight };
}

function anchor(proposalHeightAt, feature, label) {
  const { x, z } = pointFrom(feature, label);
  return {
    ...feature,
    x,
    z,
    surfaceHeight: assertFinite(proposalHeightAt(x, z), `${label}.surfaceHeight`),
  };
}

function pngDetails(file) {
  const bytes = readFileSync(file);
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) throw new Error(`${file} is not a PNG`);
  return {
    file: path.basename(file),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function serve(files) {
  const contentTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
  ]);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = files.get(pathname);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': contentTypes.get(path.extname(file)) ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function closeServer(server) {
  return new Promise(resolve => server.close(resolve));
}

const sourceBefore = sourceHash();
const moduleUrl = `${pathToFileURL(proposalPath).href}?approval=${Date.now()}`;
const { proposal, proposalHeightAt, proposalBlendAt } = await import(moduleUrl);
if (!proposal || typeof proposalHeightAt !== 'function' || typeof proposalBlendAt !== 'function') {
  throw new Error('proposal-data.mjs must export proposal, proposalHeightAt(x, z), and proposalBlendAt(x, z)');
}
if (proposal.radius !== 36 || proposal.summit?.height !== 40 || proposal.summit?.z !== 153) {
  throw new Error('Approval preview expects the approved R36 / 40m summit at z153 proposal contract');
}
if (!Array.isArray(proposal.runs) || proposal.runs.length !== 3) throw new Error('Approval preview expects exactly three ski runs');

mkdirSync(output, { recursive: true });
const terrain = sampleTerrain(proposal, proposalHeightAt, proposalBlendAt);
const approvalData = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: 'Approval drawing only. Not imported by the live application.',
  proposal,
  terrain,
  anchors: {
    spawnPad: anchor(proposalHeightAt, proposal.spawnPad, 'spawnPad'),
    decisionApron: anchor(proposalHeightAt, proposal.decisionApron, 'decisionApron'),
    finishApron: anchor(proposalHeightAt, proposal.finishApron, 'finishApron'),
    resortTerrace: anchor(proposalHeightAt, proposal.resortTerrace, 'resortTerrace'),
    ticketHut: anchor(proposalHeightAt, proposal.ticketHut, 'ticketHut'),
    lodge: anchor(proposalHeightAt, proposal.lodge, 'lodge'),
    pedestrianArrival: anchor(proposalHeightAt, proposal.pedestrianArrival, 'pedestrianArrival'),
  },
};
writeFileSync(previewDataPath, `${JSON.stringify(approvalData)}\n`);

const server = await serve(new Map([
  ['/preview-3d.html', previewPath],
  ['/preview-3d-data.json', previewDataPath],
  ['/vendor/three.module.js', threeModulePath],
  ['/vendor/three.core.js', threeCorePath],
]));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not get loopback preview address');
const baseUrl = `http://127.0.0.1:${address.port}`;
const captures = [
  { view: 'front', png: 'mountain-front-unwrapped.png', jpeg: 'mountain-unwrapped.jpg', projection: 'Unwrapped terrain (explicitly not a globe)' },
  { view: 'globe', png: 'mountain-globe-three-quarter.png', jpeg: 'mountain-globe.jpg', projection: 'Actual radius-36 globe exterior view' },
  { view: 'rear', png: 'mountain-globe-rear.png', jpeg: 'mountain-rear.jpg', projection: 'Actual radius-36 globe exterior rear view' },
];
const errors = [];
const rendered = [];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const capture of captures) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`${capture.view}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${capture.view}: ${message.text()}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${capture.view}: HTTP ${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}/preview-3d.html?view=${capture.view}`, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(view => window.__MOUNTAIN_APPROVAL_READY__ === view, capture.view, { timeout: 10_000 });
    } catch (error) {
      const detail = errors.length ? `\nRenderer errors:\n${errors.join('\n')}` : '';
      throw new Error(`Mountain approval preview did not become ready for ${capture.view}.${detail}`, { cause: error });
    }
    await page.waitForTimeout(250);
    const png = path.join(output, capture.png);
    await page.screenshot({ path: png, type: 'png' });
    const jpeg = path.join(output, capture.jpeg);
    let jpegQuality = 82;
    await page.setViewportSize({ width: 940, height: 588 });
    await page.waitForTimeout(120);
    for (const quality of [82, 76, 70]) {
      jpegQuality = quality;
      await page.screenshot({ path: jpeg, type: 'jpeg', quality });
      if (statSync(jpeg).size < 200_000) break;
    }
    rendered.push({
      view: capture.view,
      projection: capture.projection,
      png: pngDetails(png),
      inlineJpeg: {
        file: path.basename(jpeg),
        bytes: statSync(jpeg).size,
        sha256: hashFile(jpeg),
        width: 940,
        height: 588,
        quality: jpegQuality,
      },
    });
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await closeServer(server);
}

const sourceAfter = sourceHash();
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: proposal.status,
  proposal: {
    source: path.relative(root, proposalPath).replaceAll('\\', '/'),
    sha256: hashFile(proposalPath),
    radius: proposal.radius,
    seaLevel: proposal.seaLevel,
    summit: proposal.summit,
    runIds: proposal.runs.map(run => run.id),
  },
  preview: {
    source: path.relative(root, previewPath).replaceAll('\\', '/'),
    data: path.relative(root, previewDataPath).replaceAll('\\', '/'),
    terrainSamples: terrain.columns * terrain.rows,
    domain: { x: [terrain.xMin, terrain.xMax], z: [terrain.zMin, terrain.zMax], height: [terrain.minHeight, terrain.maxHeight] },
    loopbackOnly: true,
    liveApplicationStarted: false,
  },
  sourceIntegrity: {
    sourceBefore,
    sourceAfter,
    sourceUnchanged: sourceBefore === sourceAfter,
  },
  errors,
  views: rendered,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, manifestPath, ...manifest }, null, 2));
if (errors.length || sourceBefore !== sourceAfter || rendered.length !== captures.length || rendered.some(view => view.inlineJpeg.bytes >= 200_000)) process.exitCode = 1;
