import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import { proposal, proposalHeightAt, proposalBlendAt } from '../docs/design/mountain-approval/proposal-data.mjs';

const root=process.cwd(),output=path.join(root,'docs/design/mountain-approval');
const inline='C:/Users/citry/.codex/visualizations/2026/09/12/01a09681-4eac-7cf3-bb0c-f2e1de8d74de/mountain-approval.html';
const world=path.join(root,'src/features/world');
const allFiles=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?allFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sourceHash=()=>{const h=createHash('sha256');for(const f of allFiles(world).sort()){h.update(path.relative(world,f));h.update(readFileSync(f));}return h.digest('hex');};
const before=sourceHash(),current=JSON.parse(readFileSync(path.join(root,'docs/design/single-cove-approval/current-world.json'),'utf8'));
if(before!==current.source.fingerprint)throw new Error('Current source differs from the preserved underlay; take a new snapshot without overwriting the approved cove.');
const require=createRequire(import.meta.url),previous=require.extensions['.ts'];
let ground,map;
try{
 require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
 ground=require(path.join(world,'data/town-surfaces.ts'));map=require(path.join(world,'data/world-map.ts'));
}finally{if(previous)require.extensions['.ts']=previous;else delete require.extensions['.ts'];}
const round=n=>Math.round(n*1000)/1000;
const inside=(x,z,points)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
const samplePoints=points=>points.slice(1).flatMap((b,i)=>{const a=points[i],steps=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*8));return Array.from({length:steps},(_,j)=>{const t=j/steps;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];});}).concat([points.at(-1).slice(0,2)]);
const measure=(pts,height)=>{let length=0;for(let i=1;i<pts.length;i++)length+=map.mapPoint(...pts[i],height(...pts[i])).distanceTo(map.mapPoint(...pts[i-1],height(...pts[i-1])));return length;};
const metrics={runs:proposal.runs.map(run=>{
 const samples=samplePoints(run.points),old=current.routes.find(r=>r.id===run.id);
 const left=[],right=[];
 run.points.forEach((a,i)=>{
   const b=run.points[Math.min(i+1,run.points.length-1)],prev=run.points[Math.max(0,i-1)],h=proposalHeightAt(a[0],a[1]),metric=map.mapMetric(a[0],h);
   const normal=(start,end)=>{const dx=(end[0]-start[0])*metric.x,dz=(end[1]-start[1])*metric.z,l=Math.hypot(dx,dz)||1;return[-dz/l,dx/l];};
   const n0=normal(i===0?a:prev,i===0?b:a),n1=normal(i===run.points.length-1?prev:a,i===run.points.length-1?a:b);
   const length=Math.hypot(n0[0]+n1[0],n0[1]+n1[1])||1,miter=[(n0[0]+n1[0])/length,(n0[1]+n1[1])/length];
   const half=run.width/2/Math.max(.65,miter[0]*n1[0]+miter[1]*n1[1]);
   const nx=miter[0]*half/metric.x,nz=miter[1]*half/metric.z;
   left.push([a[0]+nx,a[1]+nz].map(round));right.push([a[0]-nx,a[1]-nz].map(round));
 });
 return {...run,length:measure(samples,proposalHeightAt),oldLength:measure(samplePoints(old.points),(x,z)=>ground.groundSurfaceAt(x,z).height),samples:samples.map(a=>a.map(round)),ribbon:left.concat(right.reverse())};
}).sort((a,b)=>a.number-b.number)};
const resortMetric=map.mapMetric(proposal.resortTerrace.x,proposal.resortTerrace.height);
metrics.resortGap=Math.hypot(
 Math.max(0,Math.abs(proposal.lodge.x-proposal.ticketHut.x)*resortMetric.x-(proposal.lodge.width+proposal.ticketHut.width)/2),
 Math.max(0,Math.abs(proposal.lodge.z-proposal.ticketHut.z)*resortMetric.z-(proposal.lodge.depth+proposal.ticketHut.depth)/2),
);
const heightBands={slope:'',high:''},step=1;
for(let z=52;z<164;z+=step){
 let from=-34,kind=null;
 const flush=to=>{if(kind)heightBands[kind]+=`M${from},${z}h${to-from}v1h${from-to}Z`;};
 for(let x=-34;x<=34;x+=step){
   const h=proposalHeightAt(x+.5,z+.5),next=x===34?null:inside(x+.5,z+.5,proposal.snowBoundary)&&proposalBlendAt(x+.5,z+.5)>.2?(h>=24?'high':'slope'):null;
   if(next!==kind){flush(x);from=x;kind=next;}
 }
}
const contours=[];
for(const level of [8,16,24,32,39]){
 let d='';
 for(let z=56;z<163;z++)for(let x=-31;x<31;x++){
   const pts=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]],heights=pts.map(a=>proposalHeightAt(...a)),cross=[];
   for(let i=0;i<4;i++){const j=(i+1)%4;if((heights[i]>=level)!==(heights[j]>=level)){const t=(level-heights[i])/(heights[j]-heights[i]);cross.push([pts[i][0]+(pts[j][0]-pts[i][0])*t,pts[i][1]+(pts[j][1]-pts[i][1])*t]);}}
   if(cross.length===2)d+='M'+cross.map(a=>a.map(round).join(' ')).join('L');
 }
 contours.push(d);
}
const profile=Array.from({length:239},(_,i)=>{const z=48+i*.5;return{z,current:ground.groundSurfaceAt(0,z).height,proposed:proposalHeightAt(0,z)};});
const data={proposal,current,metrics,heightBands,contours,profile};
writeFileSync(path.join(output,'drawing-data.json'),JSON.stringify(data));
const pics=[
 ['mountain-unwrapped.jpg','Extended alpine bowl · unwrapped 3D blockout, not the globe camera'],
 ['mountain-globe.jpg','Actual radius-36 globe projection · mountain-side approval view'],
 ['mountain-rear.jpg','Same mountain from the ocean side · globe curvature retained'],
];
const images=pics.filter(([name])=>existsSync(path.join(output,name)));
const manifestPath=path.join(output,'preview-3d-manifest.json');
if(images.length&&existsSync(manifestPath)){
 const preview=JSON.parse(readFileSync(manifestPath,'utf8'));
 const proposalHash=createHash('sha256').update(readFileSync(path.join(output,'proposal-data.mjs'))).digest('hex');
 if(preview.proposal.sha256!==proposalHash)throw new Error('3D pictures predate the current proposal data.');
 if(!preview.sourceIntegrity.sourceUnchanged)throw new Error('3D preview generation changed application source.');
 if(preview.errors.length)throw new Error('3D preview reported rendering errors.');
 for(const view of preview.views){
   const picture=path.join(output,view.inlineJpeg.file);
   const hash=createHash('sha256').update(readFileSync(picture)).digest('hex');
   if(hash!==view.inlineJpeg.sha256)throw new Error('3D picture set is still being refreshed; wait for its manifest.');
 }
}
const pictureMarkup=images.map(([name,caption])=>`<figure><img src="data:image/jpeg;base64,${readFileSync(path.join(output,name)).toString('base64')}" alt="${caption}"/><figcaption class="text-small">${caption}</figcaption></figure>`).join('\n');
const fragment=readFileSync(path.join(output,'approval-template.html'),'utf8').replace('/* MOUNTAIN_DRAWING_DATA */ null',JSON.stringify(data)).replace('<!-- APPROVAL_PICTURES -->',pictureMarkup);
mkdirSync(path.dirname(inline),{recursive:true});
if(Buffer.byteLength(fragment)>1_000_000)throw new Error('Inline visual exceeds1MB; reduce picture size.');
writeFileSync(inline,fragment);writeFileSync(path.join(output,'mountain-approval.html'),fragment);
const css=`:root{color-scheme:light;--background:#f5f2e8;--foreground:#273e43;--green:#286a51;--blue:#187fab;--yellow:#ba8d3e;--red:#b8453f;--orange:#b36d1c}body{margin:0;background:var(--background);color:var(--foreground);font:14px/1.5 system-ui,sans-serif}main{max-width:940px;margin:auto;padding:24px}h2{font-size:26px;font-weight:500}h3{font-size:19px;font-weight:500}.text-small{font-size:12px}.downloads{display:flex;gap:18px;flex-wrap:wrap}a{color:#176583}@media(max-width:450px){main{padding:14px}}`;
writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WestCose mountain approval · revision 3</title><style>${css}</style><main><p class="downloads"><a href="mountain-plan.png">Mountain plan</a><a href="resort-closeup.png">Resort close-up</a><a href="mountain-elevation.png">Elevation</a><a href="whole-world.png">Whole world</a><a href="approval-v2.html">Previous proposal</a></p>${fragment}</main></html>`);
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:1100},deviceScaleFactor:1.5});
 page.on('pageerror',e=>errors.push(String(e)));await page.goto('file:///'+path.join(output,'index.html').replaceAll('\\','/'));
 await page.locator('#wm-plan path').first().waitFor();
 const exports=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:1.5});
 for(const [id,name]of[['wm-plan','mountain-plan'],['wm-resort','resort-closeup'],['wm-section','mountain-elevation'],['wm-world','whole-world']]){
   const markup=await page.locator('#'+id).evaluate((el,css)=>{
     const w=el.viewBox.baseVal.width,h=el.viewBox.baseVal.height,heading=el.previousElementSibling.textContent;
     const labels=[],escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
     for(let key=el.nextElementSibling;key?.classList.contains('wm-key');key=key.nextElementSibling)labels.push(...[...key.querySelectorAll('span')].map(a=>a.textContent));
     let y=h+103,legend='';for(let i=0;i<labels.length;i++){legend+=`<text x="18" y="${y}">${escape(labels[i])}</text>`;y+=25;}
     legend+=`<text x="18" y="${y+6}">PROPOSAL ONLY · NOT IMPLEMENTED · COVE APPROVED / RETAINED</text>`;
     return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${y+32}" viewBox="0 0 ${w} ${y+32}"><style>${css}\nsvg{font:14px system-ui,sans-serif}svg text{fill:var(--foreground)}${document.querySelector('#wc-mountain-approval + style').textContent.replaceAll('#wc-mountain-approval ','')}</style><defs><clipPath id="crop"><rect width="${w}" height="${h}"/></clipPath></defs><rect width="100%" height="100%" fill="var(--background)"/><text x="18" y="28" style="font-size:21px;font-weight:500">${heading}</text><text x="18" y="54">WESTCOSE WORLD · MOUNTAIN APPROVAL DRAWING</text><g transform="translate(0 74)" clip-path="url(#crop)">${el.innerHTML}</g>${legend}</svg>`;
   },css);
   writeFileSync(path.join(output,name+'.svg'),markup);await exports.goto('file:///'+path.join(output,name+'.svg').replaceAll('\\','/'));await exports.locator('svg').screenshot({path:path.join(output,name+'.png')});
 }
 await exports.close();
 const audits=[];
 for(const width of [320,390,736,1100]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);
   audits.push(await page.evaluate(()=>{
     const outside=[];for(const svg of document.querySelectorAll('#wc-mountain-approval svg')){const r=svg.getBoundingClientRect();for(const t of svg.querySelectorAll('text')){const b=t.getBoundingClientRect();if(b.left<r.left-.5||b.right>r.right+.5||b.top<r.top-.5||b.bottom>r.bottom+.5)outside.push({svg:svg.id,label:t.textContent});}}
     return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,outside};
   }));
 }
 const after=sourceHash(),report={revision:3,sourceBefore:before,sourceAfter:after,sourceUnchanged:before===after,approvalOnly:true,cove:'approved drawing retained; not implemented',errors,audits,pictures:images.map(a=>a[0]),fragmentBytes:Buffer.byteLength(fragment),resortBuildingClearGap:metrics.resortGap,resort:proposal.resort,finish:proposal.finishApron,runs:metrics.runs.map(r=>({number:r.number,name:r.name,width:r.width,length:r.length,oldLength:r.oldLength}))};
 writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(errors.length||audits.some(a=>a.overflow||a.outside.length)||before!==after)process.exitCode=1;
}finally{await browser.close();}
