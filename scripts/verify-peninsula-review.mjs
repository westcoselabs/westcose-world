import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const destination=path.resolve('docs/qa/peninsula-rebuild');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
  for(const profile of [{id:'desktop',width:1440,height:1000},{id:'phone',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height}});
    try{
      const page=await context.newPage();
      await page.goto(pathToFileURL(path.join(destination,'index.html')).href);
      const evidence=await page.evaluate(async()=>{
        const images=[...document.images];
        images.forEach(image=>image.loading='eager');
        const decoded=await Promise.all(images.map(async image=>{try{await image.decode();return image.naturalWidth>0;}catch{return false;}}));
        return{imageCount:images.length,decodedCount:decoded.filter(Boolean).length,overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent};
      });
      await page.screenshot({path:path.join(destination,`review-${profile.id}.png`)});
      results.push({profile:profile.id,...evidence,passed:!evidence.overflow&&evidence.imageCount===evidence.decodedCount});
    }finally{await context.close();}
  }
}finally{await browser.close();}
const report={checkedAt:new Date().toISOString(),passed:results.every(result=>result.passed),browserClosed:true,results};
writeFileSync(path.join(destination,'review-render-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
