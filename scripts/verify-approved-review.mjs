import { chromium } from '@playwright/test';
import { readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const out=path.resolve('docs/qa/approved-layout-implementation'),browser=await chromium.launch({channel:'chrome',headless:true});
const report={errors:[],layouts:[],captureSets:[]};
try{
 for(const name of ['mountain','cove']){
  const capture=JSON.parse(readFileSync(path.join(out,name,'capture-state.json'),'utf8'));
  if(!capture.sourceUnchanged||capture.errors.length)throw new Error(`${name} captures are not valid`);
  report.captureSets.push({name,count:capture.views.length,source:capture.sourceAfter,errors:capture.errors});
 }
 if(report.captureSets[0].source!==report.captureSets[1].source)throw new Error('Capture sources differ');
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 await page.evaluate(async()=>{for(const img of document.images)img.loading='eager';await Promise.all([...document.images].map(img=>img.decode()));});
 for(const width of [390,1100]){
  await page.setViewportSize({width,height:1100});
  report.layouts.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,images:document.images.length,broken:[...document.images].filter(img=>!img.complete||!img.naturalWidth).map(img=>img.src)})));
  await page.screenshot({path:path.join(out,width===390?'review-phone.png':'review-desktop.png')});
 }
 if(report.errors.length||report.layouts.some(v=>v.overflow||v.broken.length))throw new Error('Review layout/images failed');
 report.passed=true;
}finally{await browser.close();writeFileSync(path.join(out,'review-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(report);}
