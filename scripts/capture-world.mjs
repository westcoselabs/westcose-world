import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.WORLD_DEV_URL || 'http://127.0.0.1:3000';
const output = 'docs/qa/planet';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const samples={};
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  await page.goto(base+'/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({timeout:45000});
  await page.waitForTimeout(500);
  await page.screenshot({path:output+'/01-globe-entry.png'});
  await page.getByTestId('enter-world').click();
  await expect.poll(()=>page.evaluate(()=>window.__WESTCOSE_WORLD__.getState().overviewTransition)).toBeLessThan(.005);
  await page.screenshot({path:output+'/02-studio-lane.png'});
  samples.entry=await page.evaluate(()=>window.__WESTCOSE_WORLD__.getState());
  async function spawn(name) {
    await page.evaluate(name=>window.__WESTCOSE_WORLD__.spawn(name),name);
    await page.waitForTimeout(500);
    samples[name]=await page.evaluate(()=>window.__WESTCOSE_WORLD__.getState());
  }
  await spawn('stairs');
  await page.screenshot({path:output+'/03-overlook-steps.png'});
  await spawn('alley');
  await page.screenshot({path:output+'/04-alley.png'});
  await spawn('beach');
  await page.screenshot({path:output+'/05-coast.png'});
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:output+'/06-discovery-note.png'});
  await page.keyboard.press('Escape');
  await spawn('shoreline');
  await page.keyboard.down('w'); await page.waitForTimeout(4500); await page.keyboard.up('w');
  samples.ocean=await page.evaluate(()=>window.__WESTCOSE_WORLD__.getState());
  await page.screenshot({path:output+'/07-ocean.png'});
  await spawn('entry');
  await page.getByRole('button',{name:'Field notes',exact:true}).click();
  await page.screenshot({path:output+'/08-field-notes.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Planet view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__WESTCOSE_WORLD__.getState().overviewTransition)).toBeGreaterThan(.995);
  await page.screenshot({path:output+'/09-planet-view.png'});
  const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobile=await phone.newPage();
  await mobile.goto(base+'/world');
  await expect(mobile.getByTestId('enter-world')).toBeEnabled({timeout:45000});
  await mobile.screenshot({path:output+'/10-phone-globe.png'});
  await mobile.getByTestId('enter-world').tap();
  await expect.poll(()=>mobile.evaluate(()=>window.__WESTCOSE_WORLD__.getState().overviewTransition)).toBeLessThan(.005);
  await mobile.screenshot({path:output+'/11-phone-walking.png'});
  await mobile.getByRole('button',{name:'Field notes',exact:true}).tap();
  await mobile.screenshot({path:output+'/12-phone-notes.png'});
  await writeFile(output+'/render-counters.json',JSON.stringify({environment:'Installed Chrome; headless; software WebGL permitted. Phone uses touch/viewport emulation, not a real-device benchmark.',samples},null,2)+'\n');
  console.log('Saved 12 planet screenshots and render counters to '+output);
} finally { await browser.close(); }
