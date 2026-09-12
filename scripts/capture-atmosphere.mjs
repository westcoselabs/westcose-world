import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.env.WORLD_CAPTURE_DIR||'docs/qa/dead-coast-atmosphere';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>{const error=e.stack||e.message;if(!errors.includes(error))errors.push(error);});
page.on('console',m=>{if(m.type()==='error'){const error=m.text()+' '+m.location().url;if(!errors.includes(error))errors.push(error);}});
await page.goto('http://127.0.0.1:3000/world');
await page.getByTestId('enter-world').click({timeout:90000});
await page.waitForTimeout(2000);
const states={};
for(const fixture of (process.env.WORLD_CAPTURE_FIXTURES||'entry,courtyard,alley,stairs,beach').split(',')){
  await page.evaluate(name=>window.__WESTCOSE_WORLD__.spawn(name),fixture);
  await page.waitForTimeout(1200);
  if(fixture==='beach'&&process.env.WORLD_CAPTURE_BEACH_WALK!=='0'){
    await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');
    await page.keyboard.down('d');await page.waitForTimeout(800);await page.keyboard.up('d');await page.waitForTimeout(500);
  }
  await page.screenshot({path:`${dir}/${fixture}.jpg`,type:'jpeg',quality:90});
  states[fixture]=await page.evaluate(()=>window.__WESTCOSE_WORLD__.getState());
}
await browser.close();
await writeFile(`${dir}/quick-capture-state.json`,JSON.stringify({errors,states},null,2));
console.log(JSON.stringify({errors,views:Object.keys(states),counters:states.entry?.counters},null,2));
