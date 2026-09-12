import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.env.WORLD_CAPTURE_DIR||'docs/qa/dead-coast/views';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
let page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/THREE\.|shader|WebGL/i.test(m.text())&&!errors.includes(m.text()))errors.push(m.text());});
await page.goto('http://127.0.0.1:3000/world');
await page.getByTestId('enter-world').waitFor();
await page.waitForFunction(()=>!document.querySelector('[data-testid="enter-world"]')?.disabled);
await page.getByTestId('enter-world').click();await page.waitForTimeout(2200);
async function shot(name){await page.screenshot({path:dir+'/'+name+'.jpg',type:'jpeg',quality:88});}
async function spawn(name){await page.evaluate(name=>window.__WESTCOSE_WORLD__.spawn(name),name);await page.waitForTimeout(1200);}
await shot('02-studio-row');
await page.getByRole('button',{name:'Planet view',exact:true}).click();await page.waitForTimeout(2200);await shot('01-town-overview');
await spawn('courtyard');await shot('03-courtyard');
async function room(fixture,file){await spawn(fixture);await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');await page.waitForTimeout(500);await shot(file);return page.evaluate(()=>window.__WESTCOSE_WORLD__.getState());}
const rooms={};
rooms.studio=await room('studio','04-project-studio');
rooms.workshop=await room('workshop','05-workshop');
await spawn('pierapproach');await page.keyboard.down('w');await page.waitForTimeout(1400);await page.keyboard.up('w');await page.waitForTimeout(500);await shot('06-pier');
rooms.arcade=await room('arcade','07-arcade');
await spawn('beach');await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');await page.keyboard.down('d');await page.waitForTimeout(800);await page.keyboard.up('d');await page.waitForTimeout(500);await shot('08-cove');
rooms.lab=await room('lab','09-hidden-lab');
rooms.about=await room('about','11-office');
await spawn('alley');await shot('12-alleys');
await spawn('stairs');await shot('13-steps');
await page.close();
page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE\.|shader|WebGL/i.test(m.text())&&!errors.includes(m.text()))errors.push(m.text());});await page.goto('http://127.0.0.1:3000/world');
await page.getByTestId('enter-world').click({timeout:45000});await page.waitForTimeout(2000);
await spawn('entry');await shot('10-phone');
await writeFile(dir+'/../capture-state.json',JSON.stringify({errors,rooms},null,2));
await browser.close();console.log(JSON.stringify({directory:dir,errors,rooms:Object.fromEntries(Object.entries(rooms).map(([k,v])=>[k,{interior:v.interior,hotspot:v.hotspot,counters:v.counters}]))},null,2));
