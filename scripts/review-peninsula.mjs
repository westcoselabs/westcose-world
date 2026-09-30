import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const repository = process.cwd(), destination = path.join(repository, 'docs/qa/peninsula-underpass');
const captures = path.resolve(process.env.WORLD_PENINSULA_REVIEW_CAPTURE_DIR || path.join(destination, 'final'));
const artifacts = path.join(repository, '.next');
mkdirSync(artifacts, { recursive: true }); mkdirSync(destination, { recursive: true });
const temporary = mkdtempSync(path.join(artifacts, 'peninsula-review-'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const read = filename => existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : null;
try {
  const data = path.join(repository, 'src/features/world/data');
  for (const name of readdirSync(data).filter(name => name.endsWith('.ts'))) {
    writeFileSync(path.join(temporary, name.replace(/\.ts$/, '.js')), ts.transpileModule(readFileSync(path.join(data, name), 'utf8'), {
      fileName: name, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const require = createRequire(path.join(repository, 'package.json'));
  const land = require(path.join(temporary, 'town-surfaces.js'));
  const town = require(path.join(temporary, 'town-layout.js'));
  const peninsula = require(path.join(temporary, 'peninsula-layout.js'));
  const cliffs = require(path.join(temporary, 'peninsula-cliffs.js'));
  const { MAP_SEA_LEVEL, mapCoordinates } = require(path.join(temporary, 'world-map.js'));
  const xmin = 12, xmax = 49, zmin = -47, zmax = 14, scale = 10.8, left = 55, top = 83;
  const project = ([x, z]) => [left + (x - xmin) * scale, top + (zmax - z) * scale];
  const line = points => points.map(point => project(point).map(n => n.toFixed(2)).join(',')).join(' ');
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="820" viewBox="0 0 920 820"><defs><pattern id="protect" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9 9 0" stroke="#f5f0df" stroke-width="1"/></pattern></defs><rect width="920" height="820" fill="#f2efdf"/><style>text{font-family:Arial,sans-serif;fill:#263b40}.small{font-size:12px}.label{font-size:13px;font-weight:700;paint-order:stroke;stroke:#f2efdf;stroke-width:4;stroke-linejoin:round}.note{font-size:14px}</style><text x="35" y="34" font-size="24" font-weight="700">Peninsula reconstruction · sampled ground</text><text x="35" y="58" class="note">Local unwrapped chart — world projection unchanged; two local support levels</text>`];
  const color = h => h < MAP_SEA_LEVEL ? '#234e5d' : h < .35 ? '#d0b782' : h < 1.5 ? '#929b77' : h < 3.1 ? '#737f6c' : '#52685f';
  let min = Infinity, max = -Infinity;
  for (let x = xmin; x < xmax; x += .5) for (let z = zmin; z < zmax; z += .5) {
    const h = land.groundSurfaceAt(x + .25, z + .25).height; min = Math.min(min, h); max = Math.max(max, h);
    const [px, py] = project([x, z + .5]); svg.push(`<rect x="${px}" y="${py}" width="${scale*.5+.05}" height="${scale*.5+.05}" fill="${color(h)}"/>`);
  }
  // The waterline is computed from actual final support samples, not a broad coast sketch.
  for (let x = xmin; x < xmax - .5; x += .5) for (let z = zmin; z < zmax - .5; z += .5) {
    const h = land.groundSurfaceAt(x + .25, z + .25).height;
    const [px, py] = project([x, z + .5]);
    if ((h < MAP_SEA_LEVEL) !== (land.groundSurfaceAt(x + .75, z + .25).height < MAP_SEA_LEVEL)) svg.push(`<path d="M${px + scale*.5} ${py}v${scale*.5}" stroke="#d4ebde" stroke-width="1.3"/>`);
    if ((h < MAP_SEA_LEVEL) !== (land.groundSurfaceAt(x + .25, z + .75).height < MAP_SEA_LEVEL)) svg.push(`<path d="M${px} ${py}h${scale*.5}" stroke="#d4ebde" stroke-width="1.3"/>`);
  }
  // Project the actual closed rock geometry: ground heights alone omit these faces.
  const hull = points => {
    const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const lower=[],upper=[];
    for(const point of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
    for(const point of sorted.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  };
  for(const wedge of cliffs.peninsulaCliffWedges){
    const footprint=hull(wedge.vertices.map(vertex=>{const p=mapCoordinates(vertex);return[p.x,p.z];}));
    svg.push(`<polygon points="${line(footprint)}" fill="${wedge.color}" stroke="#424f49" stroke-width=".45"/>`);
  }
  svg.push(`<polyline points="${line(cliffs.PENINSULA_CLIFF_RIM)}" fill="none" stroke="#293e3b" stroke-width="2.2" stroke-dasharray="4 3"/>`);
  const [protectedX, protectedY] = project([12, 14]);
  svg.push(`<rect x="${protectedX}" y="${protectedY}" width="${12 * scale}" height="${32 * scale}" fill="url(#protect)" opacity=".28"/>`);
  for (const x of [15, 20, 25, 30, 35, 40, 45]) { const [px] = project([x, 0]); svg.push(`<text x="${px}" y="${top + (zmax-zmin) * scale + 20}" text-anchor="middle" class="small">${x}</text>`); }
  for (const z of [-40, -30, -20, -10, 0, 10]) { const [, py] = project([0, z]); svg.push(`<text x="44" y="${py + 4}" text-anchor="end" class="small">${z}</text>`); }
  svg.push(`<rect x="${left}" y="${top}" width="${37 * scale}" height="${(zmax-zmin) * scale}" fill="none" stroke="#35545a"/><text x="255" y="790" text-anchor="middle" class="small">x → east / chart metres · z increases inland ↑</text>`);
  for (const route of town.TOWN_ROUTES.filter(route => ['boardwalk', 'alley', 'lighthouse-trail', 'beach-east', 'cave'].includes(route.id))) {
    const points = route.points.filter(([x,z]) => x >= xmin && x <= xmax && z >= zmin && z <= zmax);
    const stroke = route.id === 'cave' ? '#f7e9c8' : route.id === 'lighthouse-trail' ? '#e8ba62' : route.id === 'beach-east' ? '#e9dab0' : '#cbd2cb';
    svg.push(`<polyline points="${line(points)}" fill="none" stroke="#354a49" stroke-width="7"/><polyline points="${line(points)}" fill="none" stroke="${stroke}" stroke-width="4" ${route.id === 'cave' ? 'stroke-dasharray="5 4"' : ''}/>`);
  }
  for (const building of town.TOWN_BUILDINGS.filter(b => b.x + b.width / 2 > xmin && b.x < xmax && b.z < zmax && b.z > zmin)) {
    const [px,py] = project([Math.max(xmin, building.x - building.width / 2), building.z + building.depth / 2]);
    svg.push(`<rect x="${px}" y="${py}" width="${(Math.min(xmax,building.x+building.width/2)-Math.max(xmin,building.x-building.width/2))*scale}" height="${building.depth * scale}" fill="#33444a" stroke="#e7e2cf"/>`);
  }
  const { PENINSULA_LIGHTHOUSE: tower, PENINSULA_COVE: cove, PENINSULA_CAVE: cave } = peninsula;
  const pin = (point, text, n, dx = 9, dy = -9) => { const [x,y]=project(point); svg.push(`<circle cx="${x}" cy="${y}" r="10" fill="#f4ebcb" stroke="#243e44"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="12" font-weight="700">${n}</text><text x="${x+dx}" y="${y+dy}" class="label">${escape(text)}</text>`); };
  svg.push(`<polygon points="${line(peninsula.PENINSULA_CAP)}" fill="none" stroke="#f5cc80" stroke-width="1.3" stroke-dasharray="3 3"/>`);
  pin([tower.x,tower.z], 'Lighthouse above tunnel', 1, -78, 30);
  pin(cave.points[0], 'Public cave entrance', 2, -90, 26);
  pin(cave.points.at(-1), 'Cove exit', 3, 13, 20);
  pin([cove.x,cove.z], 'Hidden beach', 4, 10, -10);
  {const[x,y]=project([32,-4]);svg.push(`<text x="${x+8}" y="${y-12}" class="label">Cliff rim</text>`);}
  const notes = [
    ['1 · Outer-tip lighthouse', `${tower.height}m existing model; base ${tower.elevation}m.`, `Anchor [${tower.x}, ${tower.z}]. Upper walking route.`],
    ['2 → 1 → 3 · Passage underneath', `${cave.width}m clear width; ${cave.clearance}m roof clearance.`, `Floor ${cave.floor}m; passes below tower center.`, 'Dashed line is lower support, not a surface path.'],
    ['4 · Open crescent cove', 'Actual sea opens to the east.', 'Unequal arms; recessed sand inside.'],
    ['Protected surroundings', 'Hatching: unchanged town/boardwalk.', 'All 9 buildings and 17 other routes fixed.'],
    ['Topology takes priority', 'Tower stays at the outer tip.', 'No city-frustum placement workaround.', 'Ordinary curvature and buildings may obscure it.'],
    ['Map method', '0.5m samples of actual final ground.', 'Pale boundary = sampled sea-level edge.', 'Gray footprints = actual cliff rock wedges.', 'Colors show height, not proposed art.'],
  ];
  let noteY = 105;
  for (const [heading,...lines] of notes) { svg.push(`<text x="535" y="${noteY}" font-size="16" font-weight="700">${escape(heading)}</text>`); lines.forEach((text,index)=>svg.push(`<text x="535" y="${noteY+24+index*20}" class="note">${escape(text)}</text>`)); noteY += 44+lines.length*20; }
  // A source-derived vertical section makes the essential stacked relationship
  // explicit; a top-down height field alone cannot represent the underpass.
  const sectionX=610,sectionY=805,pixelsPerMetre=6;
  const sy=h=>sectionY-h*pixelsPerMetre;
  svg.push(`<text x="535" y="${sectionY-136}" font-size="15" font-weight="700">Same [x, z] · two radial levels</text><rect x="${sectionX-45}" y="${sy(tower.elevation)}" width="90" height="${(tower.elevation-cave.floor-cave.clearance)*pixelsPerMetre}" fill="#737f6c"/><rect x="${sectionX-12}" y="${sy(tower.elevation+tower.height)}" width="24" height="${tower.height*pixelsPerMetre}" fill="#e4dec5" stroke="#354a49"/><rect x="${sectionX-12}" y="${sy(tower.elevation+7)}" width="24" height="15" fill="#a65a47"/><path d="M${sectionX-45} ${sy(cave.floor)}h90 M${sectionX-45} ${sy(cave.floor+cave.clearance)}h90" stroke="#354a49" stroke-width="3"/><text x="${sectionX+58}" y="${sy(tower.elevation)+4}" class="small">${tower.elevation}m · upper foundation</text><text x="${sectionX+58}" y="${sy(cave.floor+cave.clearance)+12}" class="small">${cave.clearance}m · clear tunnel</text><text x="${sectionX+58}" y="${sy(cave.floor)+5}" class="small">${cave.floor}m · lower floor</text>`);
  svg.push('</svg>'); writeFileSync(path.join(destination,'local-map.svg'),svg.join('\n'));
  const report = read(path.join(captures,'capture-state.json'));
  const preservation = read(path.join(destination,'preservation-check.json'));
  const focused = read(path.join(destination,'route-check.json'));
  const titles = { 'fresh-courtyard':'Protected courtyard / fresh load', 'courtyard-toward-lighthouse':'Courtyard limitation — fixed buildings obscure tower', 'main-street-lighthouse':'Waterfront main street — full tower context', 'boardwalk-center-lighthouse':'Central boardwalk — tower sightline', 'boardwalk-west-lighthouse':'Western boardwalk — distant tower', 'lighthouse-terrace':'Lighthouse terrace / close walking view', 'lighthouse-toward-town':'Terrace return toward town', 'lighthouse-approach':'Upper-trail approach / normal close framing', 'public-cave-entry':'Public entrance to covered passage', 'covered-cave':'Inside actual covered passage', 'hidden-beach-ocean':'Hidden beach toward open sea', 'hidden-beach-reverse':'Hidden beach looking inland', 'hidden-beach-north':'Hidden beach / northern arm', 'hidden-beach-south':'Hidden beach / southern arm', 'globe-boardwalk-center-lighthouse':'Globe / town and peninsula', 'globe-hidden-beach-ocean':'Globe / cove and eastern shore' };
  titles['public-cave-approach']='Far public-beach approach to the cave';
  titles['lighthouse-approach']='Boundary-side approach / off the revised trail';
  titles['lighthouse-route-approach']='Revised upper-trail approach';
  titles['hidden-beach-toward-lighthouse']='Cove behind lighthouse / looking toward exit';
  titles['globe-lighthouse-terrace']='Globe / outer-tip lighthouse and covered headland';
  titles['under-lighthouse']='Lower passage directly beneath lighthouse foundation';
  titles['courtyard-toward-lighthouse']='Protected courtyard / ordinary tower direction';
  titles['main-street-lighthouse']='Protected waterfront main street / ordinary tower direction';
  titles['boardwalk-center-lighthouse']='Protected central boardwalk / ordinary tower direction';
  const cards = (report?.views || []).map(view => {
    const id=view.filename.replace(/^(desktop|phone)-/,'').replace(/\.jpg$/,'');
    const src=path.relative(destination,path.join(captures,'views',view.filename)).replaceAll('\\','/');
    return `<figure data-profile="${view.profile}"><a href="${escape(src)}"><img loading="lazy" src="${escape(src)}" alt="${escape(titles[id]||id)}" width="${view.viewport.width}" height="${view.viewport.height}"/></a><figcaption><strong>${escape(titles[id]||id)}</strong><small>${view.profile} · [${view.state.map.x.toFixed(1)}, ${view.state.map.z.toFixed(1)}] · ${view.state.swimming?'swimming':'dry support'} · camera ${view.state.cameraDistance.toFixed(2)}m</small></figcaption></figure>`;
  }).join('\n');
  const isFinal = path.basename(captures)==='final';
  const renderFailures=[];
  for(const view of report?.views||[])if(!view.state.grounded||view.state.swimming)renderFailures.push({view:view.filename,state:view.state});
  if(!report?.sourceUnchanged||report?.errors.length)renderFailures.push({reason:'Capture source changed or renderer errors occurred'});
  const coveCameraObservations=(report?.views||[]).filter(view=>/hidden-beach-(ocean|reverse|north|south)\.jpg$/.test(view.filename)).map(view=>({view:view.filename,distance:view.state.cameraDistance,desired:view.state.desiredCameraDistance}));
  const renderAcceptance={passed:renderFailures.length===0,method:'All actual fixtures are grounded/dry and source remains stable during capture. Camera distances are observations; topology is never relocated to satisfy framing. Images still require human structural review.',failures:renderFailures,coveCameraObservations};
  if(isFinal&&!renderAcceptance.passed)process.exitCode=1;
  writeFileSync(path.join(destination,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peninsula reconstruction review</title><style>body{margin:0;background:#eeeadd;color:#263b40;font:16px/1.55 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:30px 24px}h1{font-size:clamp(26px,4vw,42px);line-height:1.15;margin:.2em 0}h2{margin-top:2em}.intro{max-width:900px}.status{padding:16px 20px;background:#dedecb;border-left:4px solid #536f65}.map{width:100%;max-width:920px;height:auto;background:#f2efdf}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:22px}figure{margin:0;background:#f9f6eb;border:1px solid #d0d0bd}figure img{display:block;width:100%;height:auto}figure[data-profile=phone] img{max-height:660px;object-fit:contain;background:#dae0d7}figcaption{padding:12px 16px}small{display:block;color:#587071}code{overflow-wrap:anywhere}a{color:#285e6e}.nav{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:500px){main{padding:22px 14px}}</style><main><p>PENINSULA RECONSTRUCTION · ${isFinal?'CURRENT REVIEW':'PREVIEW / DESIGN IN PROGRESS'}</p><h1>Lighthouse above · hidden passage below</h1><p class="intro">Corrected reference topology: the existing lighthouse sits on the outer tip. A low passage crosses directly underneath its foundation and exits into the cove behind it. A separate upper trail reaches the tower. Town buildings, pier, mountain and protected ground remain fixed; localized runtime support now distinguishes the upper terrace from the lower tunnel. This is structural blockout, not texture, styling or artwork approval.</p><div class="status"><strong>Preservation: ${preservation?.passed?'PASS':'not yet verified'}</strong> · ${preservation?.protectedSampleCount?.toLocaleString('en-US')||'—'} protected ground samples · ${preservation?.changedSampleCount??'—'} changed. Layered topology/traversal: ${focused?.status||'pending'}.<br>${report?.views.length||0} captured views · ${report?.errors.length??'—'} capture errors · source ${report?.sourceUnchanged?'unchanged during capture':'not confirmed'}.</div><p class="intro"><strong>Reference first:</strong> lighthouse placement is not optimized for city-camera visibility. The exact courtyard has protected-building occlusion, while globe curvature and normal close-up framing can obscure or crop the tower elsewhere. These observations do not justify moving the lighthouse, changing the existing model, or adjusting camera framing.</p><p class="nav"><a href="preservation-check.json">Preservation results</a><a href="route-check.json">Layered traversal results</a><a href="README.md">Method and scope</a><a href="local-map.svg">Open annotated map</a></p><h2>Actual ground and access layout</h2><img class="map" src="local-map.svg" alt="Annotated local peninsula chart showing sampled coastline, tower, cave, hidden cove and protected town" width="920" height="820"><h2>Normal walking views and globe context</h2><p>Images are direct renderer captures. Debug placement changes only visitor position and ordinary heading. Captured ${escape(report?.capturedAt||'not yet')}; source fingerprint <code>${escape(report?.sourceBefore||'pending')}</code>.</p><div class="grid">${cards}</div></main></html>`);
  if(!isFinal){
    const gallery=path.join(destination,'index.html');
    writeFileSync(gallery,readFileSync(gallery,'utf8').replace('<h2>Actual ground and access layout</h2>','<p class="status"><strong>Interim evidence — not final acceptance.</strong> Portal sealing, full-width routes and upper/lower traversal remain under verification. Earlier numerical passes do not waive visible structural issues.</p><h2>Actual ground and access layout</h2>'));
  }
  writeFileSync(path.join(destination,'review-summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),captureDirectory:captures,isFinal,viewCount:report?.views.length||0,preservationPassed:preservation?.passed,focusedTraversalStatus:focused?.status,renderAcceptance,coastSampleRange:{minimum:min,maximum:max},lighthouse:tower,cave,cove},null,2)+'\n');
  console.log(JSON.stringify({map:path.join(destination,'local-map.svg'),gallery:path.join(destination,'index.html'),views:report?.views.length||0}));
} finally {
  if(path.dirname(path.resolve(temporary))!==artifacts||!path.basename(temporary).startsWith('peninsula-review-'))throw new Error('Unexpected review temporary directory');
  rmSync(temporary,{recursive:true,force:true});
}
