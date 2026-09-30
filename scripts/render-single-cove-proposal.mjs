import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root=process.cwd();
const output=path.join(root,'docs/design/single-cove-approval');
const visualization='C:/Users/citry/.codex/visualizations/2026/09/12/01a09681-4eac-7cf3-bb0c-f2e1de8d74de/one-cove-approval.html';
const snapshot=JSON.parse(readFileSync(path.join(output,'current-world.json'),'utf8'));
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sourceHash=()=>{const world=path.join(root,'src/features/world'),hash=createHash('sha256');for(const file of files(world).sort()){hash.update(path.relative(world,file));hash.update(readFileSync(file));}return hash.digest('hex');};
const before=sourceHash();
const fragment=readFileSync(path.join(output,'approval-template.html'),'utf8').replace('/* CURRENT_WORLD_SNAPSHOT */ null',JSON.stringify(snapshot));
mkdirSync(path.dirname(visualization),{recursive:true});
writeFileSync(visualization,fragment);
writeFileSync(path.join(output,'one-cove-approval.html'),fragment);
// Separate user-facing drawing gallery. The editable fragment remains unchanged.
const style=`:root{color-scheme:light;--background:#f5f2e8;--foreground:#273e43;--green:#246a4c;--blue:#078bb6;--yellow:#ba8d3e;--red:#c43c36;--orange:#b36d1c;--font-size-base:14px}body{margin:0;background:var(--background);color:var(--foreground);font:14px/1.5 system-ui,sans-serif}main{max-width:940px;margin:auto;padding:24px}h2{font-size:26px;font-weight:500}h3{font-size:19px;font-weight:500}.text-small{font-size:12px}a{color:#176583}.downloads{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0}@media(max-width:460px){main{padding:14px}}`;
const gallery=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WestCose World — one-cove approval drawings</title><style>${style}</style><main><div class="downloads"><a href="peninsula-top.png">Top view PNG</a><a href="peninsula-elevation.png">Elevation PNG</a><a href="whole-world.png">Whole world PNG</a><a href="town-coast.png">Town detail PNG</a></div>${fragment}</main></html>`;
writeFileSync(path.join(output,'index.html'),gallery);
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:1000},deviceScaleFactor:1.5});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('file:///'+path.join(output,'index.html').replaceAll('\\','/'));
 await page.locator('#wc-plan path').first().waitFor();
 const exportPage=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:1.5});
 for(const [id,name] of [['wc-plan','peninsula-top'],['wc-elevation','peninsula-elevation'],['wc-world','whole-world'],['wc-town','town-coast']]){
   const svg=page.locator('#'+id);
   const markup=await svg.evaluate((el,{style})=>{
     const width=el.viewBox.baseVal.width,height=el.viewBox.baseVal.height;
     const key=[...el.nextElementSibling.querySelectorAll('span')].map(e=>e.textContent);
     const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
     let legend='';let y=height+100;
     for(let i=0;i<key.length;i+=2){
       for(let j=0;j<2;j++)if(key[i+j])legend+=`<text x="${18+j*width/2}" y="${y}">${escape(key[i+j])}</text>`;
       y+=26;
     }
     const footer=el.id==='wc-plan'?'Green: coast · Blue: upper trail / entrance · Dashes: underground · Red: divider removed':el.id==='wc-world'?'Current layout + proposed peninsula in dashed box · Rest of world unchanged':'Approval drawing only · Not implemented · Schematic, not a camera capture';
     legend+=`<text x="18" y="${y+8}">${footer}</text>`;
     const total=y+28;
     return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" height="${total}"><style>${style}\nsvg{font:14px system-ui,sans-serif}svg text{fill:var(--foreground)}\n${document.querySelector('#wc-single-cove-approval + style').textContent.replaceAll('#wc-single-cove-approval ','')}</style><defs><clipPath id="map-crop"><rect width="${width}" height="${height}"/></clipPath></defs><rect width="100%" height="100%" fill="var(--background)"/><text x="18" y="26" style="font-size:21px;font-weight:500">${escape(el.previousElementSibling.textContent)}</text><text x="18" y="52">WESTCOSE WORLD · PROPOSAL FOR APPROVAL · NOT IMPLEMENTED</text><g transform="translate(0 74)" clip-path="url(#map-crop)">${el.innerHTML}</g>${legend}</svg>`;
   },{style});
   writeFileSync(path.join(output,name+'.svg'),markup);
   await exportPage.goto('file:///'+path.join(output,name+'.svg').replaceAll('\\','/'));
   await exportPage.locator('svg').screenshot({path:path.join(output,name+'.png')});
 }
 await exportPage.close();
 const audits=[];
 for(const width of [320,390,736,1100]){
   await page.setViewportSize({width,height:1000});
   await page.waitForTimeout(100);
   const audit=await page.evaluate(()=>{
     const outside=[];
     for(const svg of document.querySelectorAll('#wc-single-cove-approval svg')){
       const r=svg.getBoundingClientRect();
       for(const t of svg.querySelectorAll('text')){const b=t.getBoundingClientRect();if(b.left<r.left-.5||b.right>r.right+.5||b.top<r.top-.5||b.bottom>r.bottom+.5)outside.push({svg:svg.id,label:t.textContent});}
     }
     return {width:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,outside};
   });
   audits.push(audit);
   if(width===390)await page.screenshot({path:path.join(output,'mobile-review.png'),fullPage:true});
 }
 const after=sourceHash();
 const report={sourceBefore:before,sourceAfter:after,sourceUnchanged:before===after,snapshotFingerprint:snapshot.source.fingerprint,errors,audits,proposalOnly:true};
 writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,visualization,...report},null,2));
 if(errors.length||audits.some(a=>a.horizontalOverflow||a.outside.length)||before!==after)process.exitCode=1;
}finally{await browser.close();}
