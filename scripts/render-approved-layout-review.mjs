import { createRequire } from 'node:module';
import { mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=process.cwd(),out=path.join(root,'docs/qa/approved-layout-implementation'),compiled=path.join(root,'.next','approved-review');
mkdirSync(out,{recursive:true});mkdirSync(compiled,{recursive:true});
for(const name of readdirSync('src/features/world/data').filter(f=>f.endsWith('.ts'))){
 const result=ts.transpileModule(readFileSync(path.join('src/features/world/data',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 writeFileSync(path.join(compiled,name.replace('.ts','.js')),result.outputText);
}
const require=createRequire(import.meta.url),town=require(path.join(compiled,'town-layout.js')),terrain=require(path.join(compiled,'town-surfaces.js')),mountain=require(path.join(compiled,'mountain-layout.js')),map=require(path.join(compiled,'world-map.js')),cove=require(path.join(compiled,'peninsula-layout.js'));
const pier=require(path.join(compiled,'pier-layout.js'));
const color=h=>h<-.8?'#d6e7e6':h<.4?'#d7bb85':h<3?'#a6bfad':h<10?'#a4b3a5':h<25?'#c0cec9':'#edf2e9';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
function chart(name,title,bounds,scale,annotations){
 const [minX,maxX,minZ,maxZ]=bounds,w=(maxX-minX)*scale,h=(maxZ-minZ)*scale,pad=30,legend=260;
 const X=x=>pad+(x-minX)*scale,Y=z=>80+(maxZ-z)*scale;
 let content=`<rect width="100%" height="100%" fill="#f5f2e8"/><text x="30" y="30" font-size="23">${title}</text><text x="30" y="55">Actual live support samples · unwrapped chart · inland ↑</text><rect x="${pad}" y="80" width="${w}" height="${h}" fill="#d6e7e6"/>`;
 // One-metre support cells; coalesce color runs to keep the review map light.
 for(let z=minZ;z<maxZ;z++){
  let start=minX,previous=null;
  for(let x=minX;x<=maxX;x++){
   const fill=x===maxX?null:color(terrain.groundSurfaceAt(x+.5,z+.5).height);
   if(fill!==previous){if(previous)content+=`<rect x="${X(start)}" y="${Y(z+1)}" width="${(x-start)*scale+.1}" height="${scale+.1}" fill="${previous}"/>`;start=x;previous=fill;}
  }
 }
 const points=p=>p.map(([x,z])=>`${X(x).toFixed(2)},${Y(z).toFixed(2)}`).join(' ');
 content+=`<defs><clipPath id="map"><rect x="${pad}" y="80" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#map)">`;
 for(const run of town.TOWN_ROUTES){
  const racing=mountain.MOUNTAIN_RUNS.find(r=>r.id===run.id);
  const stroke=racing?['#af523f','#177fa0','#797337'][racing.number-1]:run.id==='cave'?'#724c65':'#75877d';
  content+=`<polyline points="${points(run.points)}" fill="none" stroke="${stroke}" stroke-width="${racing?3:1.7}" ${run.id==='cave'?'stroke-dasharray="5 4"':''}/>`;
 }
 content+=`<polygon points="${points(cove.PENINSULA_COAST)}" fill="none" stroke="#246a4c" stroke-width="2"/>`;
 for(let z=-47;z<-16;z+=.25){const half=pier.pierWidthAtZ(z+.125)/2,left=pier.pierChartAt(-half,z),right=pier.pierChartAt(half,z);content+=`<rect x="${X(left.x)}" y="${Y(z+.25)}" width="${(right.x-left.x)*scale}" height="${.25*scale+.1}" fill="#a98a60"/>`;}
 for(const b of town.TOWN_BUILDINGS){const m=map.mapMetric(b.x,b.floorHeight);content+=`<rect x="${X(b.x-b.width/m.x/2)}" y="${Y(b.z+b.depth/m.z/2)}" width="${b.width/m.x*scale}" height="${b.depth/m.z*scale}" fill="#607b7b" stroke="#243f43"/>`;}
 content+='</g>';
 let y=110;
 for(const [label,x,z] of annotations){
  content+=`<circle cx="${X(x)}" cy="${Y(z)}" r="10" fill="#f5f2e8" stroke="#243f43"/><text x="${X(x)}" y="${Y(z)+4}" text-anchor="middle" font-size="12">${(y-110)/45+1}</text><text x="${w+55}" y="${y}">${(y-110)/45+1} · ${esc(label)}</text>`;y+=45;
 }
 for(const label of ['Run 1 — central S','Run 2 — eastern sweep','Run 3 — western turns','Dashed — underground cave','Height bands: sand → rock → snow','Chart widths are not physical widths','Ocean seam is at z176 / z−50.2']){content+=`<text x="${w+55}" y="${y+30}" font-size="12">${label}</text>`;y+=25;}
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w+pad+legend}" height="${h+115}" viewBox="0 0 ${w+pad+legend} ${h+115}" font-family="system-ui,sans-serif" font-size="14" fill="#243f43"><title>${title}</title>${content}</svg>`;
 writeFileSync(path.join(out,name+'.svg'),svg);
}
chart('whole-world','WestCose World — implemented layout',[-48,52,-51,176],4,[['Summit / route choice',0,151],['F / three run-outs',1,65],['Lodge + ticket booth',1,53.7],['Forest approach',-6,42],['Skate park',-27,15],['Courtyard arrival',0,8],['Boardwalk',0,-16],['Pier head',0,-43],['Lighthouse over cave',36,-32],['One hidden cove',34,10]]);
chart('mountain-top','Mountain — approved revision 3 in the live world',[-36,36,44,167],6,[['Summit / 40m massif',0,153],['Run 1 / S-run',-4,108],['Run 2 / coastal sweep',25,106],['Run 3 / forest turns',-25.5,99],['F / lower finish',1,65],['Resort + tickets at F base',1,53.7]]);
const gallery=(folder,caption)=>{
 const dir=path.join(out,folder,'views');let files=[];try{files=readdirSync(dir).filter(f=>/\.jpe?g$/.test(f));}catch{}
 return `<section><h2>${caption}</h2><div class="grid">${files.filter(f=>f.startsWith('desktop')).map(f=>`<figure><a href="${folder}/views/${f}"><img loading="lazy" src="${folder}/views/${f}" alt="${esc(f.replaceAll('-',' ').replace('.jpg',''))}" width="1440" height="900"></a><figcaption>${esc(f.replace('desktop-','').replace('.jpg','').replaceAll('-',' '))}</figcaption></figure>`).join('')}</div><details><summary>Phone views</summary><div class="phones">${files.filter(f=>f.startsWith('phone')).map(f=>`<figure><a href="${folder}/views/${f}"><img loading="lazy" src="${folder}/views/${f}" alt="${esc(f)}" width="390" height="844"></a><figcaption>${esc(f.replace('phone-','').replace('.jpg','').replaceAll('-',' '))}</figcaption></figure>`).join('')}</div></details></section>`;
};
writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WestCose — approved layout implemented</title><style>body{margin:0;background:#f5f2e8;color:#243f43;font:16px/1.6 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:24px}h1{font-size:32px;line-height:1.2}h2{font-size:24px}a{color:#176583}nav{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 22px}img{display:block;width:100%;height:auto}figcaption{font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:22px}.phones{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}details{margin:24px 0}summary{cursor:pointer}.maps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px}section{margin-top:36px}p{max-width:900px}</style><main><h1>Approved layouts, now in the live world</h1><p>Mountain revision 3 and the single hidden cove. This is the structural implementation review, not a new proposal or an art pass.</p><nav><a href="http://127.0.0.1:3000/world">Walk the live world</a><a href="whole-world.svg">Whole-world map</a><a href="mountain-top.svg">Mountain top view</a><a href="preservation.json">Preservation check</a></nav><p>The three curved runs are 138.4m (1), 134.9m (2), and 140.1m (3), with 6.5 / 8 / 7m clear widths. Lodge and ticket booth share the base of F with a 3m gap. The cave passes under the unchanged lighthouse and opens into one continuous crescent cove.</p><p>The summit is the same real mountain seen across the water from the pier. From the low resort the globe itself hides the summit; the unwrapped map shows the full route arrangement. Snowboarding controls, starting the game at the booth, timing and scoring are not implemented.</p><div class="maps"><figure><a href="whole-world.svg"><img src="whole-world.svg" alt="Annotated complete unwrapped live world map"></a></figure><figure><a href="mountain-top.svg"><img src="mountain-top.svg" alt="Live mountain routes and base resort top view"></a></figure></div>${gallery('mountain','Mountain and pier — actual game cameras')}${gallery('cove','One cove and lighthouse underpass — actual game cameras')}<p>Map colors show sampled support-height bands, not final textures. The seven town buildings and thirteen protected routes are unchanged. Only the final forest-path junction’s 2.5cm surface skin changes to connect the new resort. Lodge and ticket approach endpoints stop safely in front of their closed concept shells.</p></main></html>`);
const galleryPath=path.join(out,'index.html');
writeFileSync(galleryPath,readFileSync(galleryPath,'utf8')
 .replace('</style>','.maps{grid-template-columns:1fr;max-width:900px}.maps img{max-width:900px}</style>')
 .replace('<div class="maps">','<p><strong>Review note:</strong> The taller rear mountain currently fills most of the normal pier camera, with very little visible water below it. The globe blockout also shows stepped route margins. These actual views are included below; no camera or duplicate-mountain workaround was used.</p><div class="maps">'));
console.log(out);
