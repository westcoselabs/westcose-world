import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd(), artifacts = path.join(repository, '.next');
const destination = path.resolve(repository, process.env.WORLD_REVIEW_DIR || 'docs/qa/globe-refinement');
mkdirSync(artifacts, { recursive: true }); mkdirSync(destination, { recursive: true });
const temporary = mkdtempSync(path.join(artifacts, 'concept-review-'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const round = value => Math.round(value * 100) / 100;
try {
  for (const name of readdirSync(path.join(repository, 'src/features/world/data')).filter(name => name.endsWith('.ts'))) {
    const source = path.join(repository, 'src/features/world/data', name);
    const compiled = ts.transpileModule(readFileSync(source, 'utf8'), { fileName: source,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    mkdirSync(path.join(temporary, 'data'), { recursive: true });
    writeFileSync(path.join(temporary, 'data', name.replace(/\.ts$/, '.js')), compiled.outputText);
  }
  const require = createRequire(path.join(repository, 'package.json'));
  const town = require(path.join(temporary, 'data/town-layout.js'));
  const map = require(path.join(temporary, 'data/world-map.js'));
  const terrain = require(path.join(temporary, 'data/town-surfaces.js'));
  const landmarks = require(path.join(temporary, 'data/concept-landmarks.js'));
  const { PLANET_VERSION } = require(path.join(temporary, 'data/planet.js'));
  const { PIER_LAYOUT, pierChartAt } = require(path.join(temporary, 'data/pier-layout.js'));
  const { buildingLocalPoint } = require(path.join(temporary, 'data/building-shapes.js'));
  const route = id => town.TOWN_ROUTES.find(item => item.id === id);
  const last = points => points.at(-1);
  const courtyard = town.TOWN_AREAS.find(area => area.id === 'courtyard');
  const resort = town.TOWN_AREAS.find(area => area.id === 'resort');
  const peak = [map.MAP_SUMMIT.x, map.MAP_SUMMIT.z];
  const tip = [PIER_LAYOUT.entrance[0], PIER_LAYOUT.head.center[1] - PIER_LAYOUT.head.depth / 2];
  const inlandDistance = peak[1] - tip[1];
  const seaAngle = map.mapDirection(...peak).angleTo(map.mapDirection(...tip)) * 180 / Math.PI;
  const svg = [];
  const text = (x, y, value, size = 18, fill = '#263d3c', extra = '') => `<text x="${round(x)}" y="${round(y)}" font-size="${size}" fill="${fill}" ${extra}>${escape(value)}</text>`;
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="1380" viewBox="0 0 1480 1380" role="img" aria-label="WestCose concept layout: full unwrapped island and enlarged courtyard coast"><defs><style>text{font-family:Arial,Helvetica,sans-serif} .caps{font-weight:700;letter-spacing:1.5px}</style></defs><rect width="1480" height="1380" fill="#f7f5ed"/>`);
  svg.push(text(48, 56, 'WESTCOSE WORLD', 33, '#213e3b', 'class="caps"'));
  svg.push(text(48, 92, 'Structural refinement · sampled coast and terrain heights', 22));
  svg.push(text(48, 124, 'One connected island wraps around the globe. Every fresh visit begins in the courtyard.', 18, '#526865'));

  function panel({ id, x, y, width, height, minX, maxX, minZ, maxZ, title, labels, detailed }) {
    const scale = Math.min((width - 32) / (maxX - minX), (height - 66) / (maxZ - minZ));
    const centerX = x + width / 2, centerZ = (minZ + maxZ) / 2, centerY = y + 43 + (height - 50) / 2;
    const X = value => centerX + (value - (minX + maxX) / 2) * scale;
    const Y = value => centerY - (value - centerZ) * scale;
    const line = points => points.map((point, index) => `${index ? 'L' : 'M'}${round(X(point[0]))},${round(Y(point[1]))}`).join(' ');
    svg.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#e4eeee" stroke="#c4d1cb"/>`);
    svg.push(text(x + 20, y + 30, title, 18, '#2b4945', 'class="caps"'));
    svg.push(`<clipPath id="${id}"><rect x="${x + 10}" y="${y + 45}" width="${width - 20}" height="${height - 55}"/></clipPath><g clip-path="url(#${id})">`);
    // Combine sampled horizontal runs into a small number of vector paths.
    // The terrain source is the same analytic support used by the live world.
    const step = detailed ? .3 : .6, bands = new Map();
    const elevationAt = (px, pz) => terrain.groundSurfaceAt(px, pz).height;
    const colorAt = (px, pz) => {
      const h = elevationAt(px, pz);
      if (h < map.MAP_SEA_LEVEL) return null;
      if (h < .5) return pz < -17 || (px > 30 && pz < 12) ? '#d9c293' : '#c8d7b5';
      if (h < 2.5) return '#b5c7a6';
      if (h < 6) return '#9dab91';
      if (h < 12) return '#858f7f';
      if (h < 20) return '#a9b3ae';
      if (h < 28) return '#cbd3cb';
      return '#f3f4e8';
    };
    for (let pz = minZ; pz < maxZ; pz += step) {
      let start = minX, previous = colorAt(minX + step / 2, pz + step / 2);
      for (let px = minX + step; px <= maxX + step; px += step) {
        const color = px < maxX ? colorAt(px + step / 2, pz + step / 2) : null;
        if (color !== previous || px >= maxX) {
          if (previous) {
            const end = Math.min(px, maxX);
            const d = `M${round(X(start))},${round(Y(pz + step))}h${round((end - start) * scale)}v${round(step * scale + .12)}h${round(-(end - start) * scale)}z`;
            bands.set(previous, (bands.get(previous) || '') + d);
          }
          start = px; previous = color;
        }
      }
    }
    for (const [fill, d] of bands) svg.push(`<path d="${d}" fill="${fill}"/>`);
    // March actual terrain samples, including lowered cave floor and raised paths.
    // The sea boundary is explicit, so land never appears to stop at a diagram crop.
    const columns = Math.ceil((maxX - minX) / step), rows = Math.ceil((maxZ - minZ) / step);
    const samples = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) =>
      elevationAt(Math.min(maxX, minX + column * step), Math.min(maxZ, minZ + row * step))));
    for (const level of [map.MAP_SEA_LEVEL, 4, 8, 16, 24, 31]) {
      const pieces = [];
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]];
        const crossings = [];
        for (let edge = 0; edge < 4; edge++) {
          const [ac, ar] = corners[edge], [bc, br] = corners[(edge + 1) % 4];
          const ah = samples[ar][ac], bh = samples[br][bc];
          if ((ah >= level) === (bh >= level)) continue;
          const t = (level - ah) / (bh - ah);
          const ax = Math.min(maxX, minX + ac * step), bx = Math.min(maxX, minX + bc * step);
          const az = Math.min(maxZ, minZ + ar * step), bz = Math.min(maxZ, minZ + br * step);
          crossings.push([ax + (bx - ax) * t, az + (bz - az) * t]);
        }
        for (let index = 0; index + 1 < crossings.length; index += 2) pieces.push(line(crossings.slice(index, index + 2)));
      }
      const coastline = level === map.MAP_SEA_LEVEL;
      svg.push(`<path data-elevation="${level}" d="${pieces.join(' ')}" fill="none" stroke="${coastline ? '#317d80' : '#566d60'}" stroke-width="${coastline ? 2 : .7}" opacity="${coastline ? 1 : .65}" ${coastline ? '' : 'stroke-dasharray="3 2"'}/>`);
    }
    for (const item of town.TOWN_ROUTES) {
      const stroke = item.id === 'cave' ? '#6d6259' : item.id.startsWith('ski-') ? '#608da0' : item.material === 'timber' ? '#aa885d' : item.material === 'asphalt' ? '#83908b' : item.category === 'primary' ? '#c8ae79' : '#d9d0b6';
      svg.push(`<path d="${line(item.points)}" fill="none" stroke="${stroke}" stroke-width="${round(item.width * scale)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      if (item.id === 'cave') svg.push(`<path d="${line(item.points)}" fill="none" stroke="#ded7c9" stroke-width="2.5" stroke-dasharray="10 7"/>`);
    }
    town.TOWN_ROUTES.filter(item => item.id.startsWith('ski-')).forEach((item, index) => {
      const point = item.points[Math.floor(item.points.length / 2)];
      svg.push(`<circle cx="${round(X(point[0]))}" cy="${round(Y(point[1]))}" r="11" fill="#f7f5ed" stroke="#608da0" stroke-width="1.5"/>`);
      svg.push(text(X(point[0]), Y(point[1]) + 4, index + 1, 13, '#31566b', 'text-anchor="middle" font-weight="700"'));
    });
    for (const area of town.TOWN_AREAS) svg.push(`<rect x="${round(X(area.center[0] - area.width / 2))}" y="${round(Y(area.center[1] + area.depth / 2))}" width="${round(area.width * scale)}" height="${round(area.depth * scale)}" fill="#e2dcd0" stroke="#9d9e8d"/>`);
    const pierHalf = pierChartAt(PIER_LAYOUT.width / 2, PIER_LAYOUT.entrance[1]).x - PIER_LAYOUT.entrance[0];
    const headHalf = pierChartAt(PIER_LAYOUT.head.width / 2, PIER_LAYOUT.head.center[1]).x - PIER_LAYOUT.entrance[0];
    const headStart = PIER_LAYOUT.head.center[1] + PIER_LAYOUT.head.depth / 2;
    const pierOutline = [[tip[0] - pierHalf, PIER_LAYOUT.approach.start[1]], [tip[0] - pierHalf, headStart],
      [tip[0] - headHalf, headStart], [tip[0] - headHalf, tip[1]], [tip[0] + headHalf, tip[1]],
      [tip[0] + headHalf, headStart], [tip[0] + pierHalf, headStart], [tip[0] + pierHalf, PIER_LAYOUT.approach.start[1]]];
    svg.push(`<path d="${line(pierOutline)}Z" fill="#aa885d" stroke="#6b634e"/>`);
    town.TOWN_BUILDINGS.forEach((building, index) => {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dz]) => {
        const chart = map.mapCoordinates(buildingLocalPoint(building, [dx * building.width / 2, 0, dz * building.depth / 2]));
        return [chart.x, chart.z];
      });
      svg.push(`<path d="${line(corners)}Z" fill="#c87c5a" stroke="#805c49" stroke-width="1.4"/>`);
      if (building.z >= minZ && building.z <= maxZ) {
        svg.push(`<circle cx="${round(X(building.x))}" cy="${round(Y(building.z))}" r="${detailed ? 12 : 9}" fill="#fcf7e9"/>`);
        svg.push(text(X(building.x), Y(building.z) + 4, index + 1, detailed ? 13 : 11, '#5e4135', 'text-anchor="middle" font-weight="700"'));
      }
    });
    const skateMetric = map.mapMetric(landmarks.SKATE_CENTER[0], landmarks.SKATE_ELEVATION);
    svg.push(`<ellipse cx="${round(X(landmarks.SKATE_CENTER[0]))}" cy="${round(Y(landmarks.SKATE_CENTER[1]))}" rx="${round(landmarks.SKATE_SIZE[0] / skateMetric.x / 2 * scale)}" ry="${round(landmarks.SKATE_SIZE[1] / skateMetric.z / 2 * scale)}" fill="#b2b8ad" stroke="#677d72" stroke-width="2"/>`);
    svg.push(`<ellipse cx="${round(X(landmarks.SKATE_CENTER[0] - 1 / skateMetric.x))}" cy="${round(Y(landmarks.SKATE_CENTER[1]))}" rx="${round(3.7 / skateMetric.x * scale)}" ry="${round(2.7 / skateMetric.z * scale)}" fill="#9ca99d" stroke="#e1e5d9" stroke-width="2"/>`);
    svg.push(`<circle cx="${round(X(landmarks.LIGHTHOUSE.x))}" cy="${round(Y(landmarks.LIGHTHOUSE.z))}" r="${round(Math.max(3, 1.1 * scale))}" fill="#bb765b" stroke="#fcf6e8" stroke-width="${detailed ? 3 : 1.5}"/>`);
    svg.push(`<circle cx="${round(X(courtyard.center[0]))}" cy="${round(Y(courtyard.center[1]))}" r="${detailed ? 11 : 6}" fill="#167c6b" stroke="#fff" stroke-width="2"/>`);
    for (const item of labels) {
      const [px, pz, label, dx = 0, dy = 0] = item;
      const tx = X(px) + dx, ty = Y(pz) + dy;
      if (dx || dy) svg.push(`<path d="M${round(X(px))},${round(Y(pz))}L${round(tx)},${round(ty - 4)}" stroke="#52756d" stroke-width="1.2"/>`);
      svg.push(text(tx, ty, label, detailed ? 15 : 16, '#264942', 'font-weight="700" paint-order="stroke" stroke="#f5f3e9" stroke-width="5" stroke-linejoin="round"'));
    }
    svg.push('</g>');
    return { X, Y };
  }
  panel({ id: 'full', x: 48, y: 160, width: 560, height: 1120, minX: -48, maxX: 48, minZ: map.MAP_MIN_Z, maxZ: map.MAP_SEAM, title: '01 / COMPLETE UNWRAPPED ISLAND', detailed: false,
    labels: [[...peak, `SUMMIT / ${map.MAP_SUMMIT.height} m`, 24, -4], [peak[0], peak[1] + 10, 'REAR FACE', 28, -4], [...resort.center, 'SKI RESORT', 50, -14], [0, 78, 'FOREST / RESORT TRAIL', -114, -12], [...courtyard.center, 'COURTYARD', 26, -11], [...tip, 'PIER', 26, 0]] });
  panel({ id: 'town', x: 646, y: 160, width: 786, height: 740, minX: -43, maxX: 47, minZ: map.MAP_MIN_Z, maxZ: 25, title: '02 / COURTYARD, COAST & DISCOVERIES', detailed: true,
    labels: [[...courtyard.center, 'LOAD / SPAWN', -47, -39], [...landmarks.SKATE_CENTER, 'SKATE PARK', -36, -24], [landmarks.LIGHTHOUSE.x, landmarks.LIGHTHOUSE.z, 'LIGHTHOUSE', -110, 8], [...last(route('cave').points), 'HIDDEN BEACH', -56, -30], [...route('cave').points[0], 'CAVE ENTRY', -65, 32], [0, PIER_LAYOUT.approach.start[1], 'BOARDWALK', -168, -10], [-12, PIER_LAYOUT.entrance[1] + 4, 'BEACH', -20, 20], [12, PIER_LAYOUT.entrance[1] + 4, 'BEACH', -20, 20], [...tip, 'PIER', 25, 0]] });
  svg.push(text(666, 942, 'BUILDING KEY', 18, '#2b4945', 'class="caps"'));
  town.TOWN_BUILDINGS.forEach((building, index) => {
    const column = index < 5 ? 0 : 1, row = index < 5 ? index : index - 5;
    svg.push(text(666 + column * 370, 978 + row * 33, `${index + 1}. ${building.sign || building.id}`, 16));
  });
  svg.push(text(666, 1180, 'GLOBE CONNECTION', 18, '#2b4945', 'class="caps"'));
  svg.push(text(666, 1215, `${round(inlandDistance)} map metres inland → the same summit`, 18));
  svg.push(text(666, 1247, `${round(seaAngle)}° across the ocean from the pier`, 18));
  svg.push(text(48, 1323, 'Teal line = actual coast at −0.8 m   ·   Fine contours = 4 / 8 / 16 / 24 / 31 m   ·   Dashed path = cave', 17));
  svg.push(text(48, 1353, 'Live ground samples at 0.3–0.6 chart metres. Shade indicates elevation; physical scale varies on the sphere. Not final artwork.', 15, '#657973'));
  svg.push('</svg>');
  writeFileSync(path.join(destination, 'layout-map.svg'), svg.join('\n'));

  const capturePath = path.join(destination, 'capture-state.json');
  const captures = existsSync(capturePath) ? JSON.parse(readFileSync(capturePath, 'utf8')) : { views: [], errors: [] };
  const galleryViews = [...captures.views].sort((a, b) => ['desktop', 'phone'].indexOf(a.profile) - ['desktop', 'phone'].indexOf(b.profile));
  const pictures = galleryViews.map((view, index) => {
    const label = view.label || (typeof view.fixture === 'string' ? view.fixture : view.filename.replace(/^(desktop|phone)-/, '').replace(/\.jpg$/, ''));
    const section = index === 0 || galleryViews[index - 1].profile !== view.profile
      ? `<h3 style="grid-column:1/-1;margin:18px 0 0">${view.profile === 'phone' ? 'Phone viewport' : 'Desktop'}</h3>` : '';
    return `${section}<figure><a href="views/${escape(view.filename)}"><img loading="lazy" src="views/${escape(view.filename)}" alt="${escape(view.profile + ' ' + label)}"></a><figcaption>${escape(view.profile)} · ${escape(label)}</figcaption></figure>`;
  }).join('\n');
  const summary = { generatedAt: new Date().toISOString(), layoutVersion: PLANET_VERSION, buildingCount: town.TOWN_BUILDINGS.length, radius: map.MAP_RADIUS, seaLevel: map.MAP_SEA_LEVEL,
    chartBounds: [map.MAP_MIN_Z, map.MAP_SEAM], maximumHeightEnvelope: map.MAP_MAX_HEIGHT, terrainSampleSpacing: { full: .6, coast: .3 }, contourElevations: [map.MAP_SEA_LEVEL, 4, 8, 16, 24, 31],
    courtyard: courtyard.center, resort: last(route('resort-trail').points), resortPlaza: resort.center, summit: peak, summitHeight: map.MAP_SUMMIT.height, lighthouse: landmarks.LIGHTHOUSE, pierTip: tip, pier: PIER_LAYOUT, inlandMapMetres: inlandDistance, oceanAngleDegrees: seaAngle,
    cave: { points: landmarks.CAVE_POINTS, width: landmarks.CAVE_WIDTH, clearance: landmarks.CAVE_CLEARANCE, floor: landmarks.CAVE_FLOOR }, stairs: landmarks.SKATE_STAIRS,
    routes: town.TOWN_ROUTES.map(item => ({ id: item.id, label: item.label, points: item.points, width: item.width, material: item.material, elevation: item.elevation, elevations: item.elevations })), captures: captures.views.length, framingChecks: captures.framingChecks || [], renderErrors: captures.errors };
  writeFileSync(path.join(destination, 'layout-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(path.join(destination, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WestCose · Concept layout review</title><style>body{margin:0;background:#f7f5ed;color:#213e3b;font:17px/1.5 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:32px}h1{font-size:clamp(28px,4vw,48px);line-height:1.15;margin:0 0 16px}p{max-width:850px}a{color:#167c6b}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}.map{width:100%;border:1px solid #d1d9d0;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;background:#e4eeee;border-radius:10px;overflow:hidden}figure img{width:100%;display:block}figcaption{padding:12px 16px}small{color:#657973}</style><main><h1>WestCose World<br>Concept layout review</h1><p>Review the placement, paths, mountain shape, courtyard arrival, and coast before texture and artwork production. The island follows a true globe wrap: the mountain seen across the water is the same mountain reached from the resort.</p><nav><a href="layout-map.svg">Open full-size map</a><a href="layout-summary.json">Layout data</a><a href="capture-state.json">Capture verification</a></nav><img class="map" src="layout-map.svg" alt="Annotated complete island and enlarged town concept plan"><p>The full island chart shows the long inland route. The enlarged coast shows the courtyard, shops, boardwalk, skatepark, lighthouse, and covered cave to the hidden beach.</p><h2>Browser views</h2><small>Desktop and phone viewport emulation on the same computer. These are actual rendered views, not generated artwork.</small><div class="grid">${pictures || '<p>Browser captures have not been generated yet.</p>'}</div></main></html>`);
  console.log(JSON.stringify({ destination, map: 'layout-map.svg', review: 'index.html', captures: captures.views.length, seaAngleDegrees: round(seaAngle) }, null, 2));
} finally {
  if (path.dirname(path.resolve(temporary)) !== artifacts || !path.basename(temporary).startsWith('concept-review-')) throw new Error('Unexpected concept review artifact path');
  rmSync(temporary, { recursive: true, force: true });
}
