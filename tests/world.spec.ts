import { expect, test, type Page } from '@playwright/test';
import { PLANET_PLACES, RADIUS, SEA_LEVEL, SPAWN_COORDS } from '../src/features/world/data/planet';
import { MAP_MIN_Z, MAP_SEAM, mapCoordinates } from '../src/features/world/data/world-map';
import { PLAYER_CENTER_HEIGHT } from '../src/features/world/runtime/types';
import { PIER_LAYOUT } from '../src/features/world/data/pier-layout';
import { MOUNTAIN_LAYOUT } from '../src/features/world/data/mountain-layout';

type Vec = { x: number; y: number; z: number };
type WorldState = {
  mode: string; position: Vec; forward: Vec; up: Vec; radius: number; lon: number; lat: number;
  travelDistance: number; hotspot: string | null; grounded: boolean; swimming: boolean;
  interior: string | null; supportKind: 'ground' | 'floor' | 'pier' | 'water';
  cameraDistance: number; desiredCameraDistance: number; overviewTransition: number;
  landmarkFraming: { summitNdc: Vec; summitFraming: number; summitVisible: boolean };
  counters: Record<string, number>;
};
type DebugWindow = Window & { __WESTCOSE_WORLD__: { getState: () => WorldState; spawn: (name: string) => void } };
// A swimming visitor's centre rides at sea level plus the capsule centre height.
const SWIM_RADIUS = RADIUS + SEA_LEVEL + PLAYER_CENTER_HEIGHT;
const distance = (a: Vec, b: Vec) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const dot = (a: Vec, b: Vec) => a.x*b.x+a.y*b.y+a.z*b.z;
async function state(page: Page) { return page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.getState()); }
async function ready(page: Page) {
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await state(page)).mode).toBe('exploring');
  await expect.poll(async () => (await state(page)).overviewTransition).toBeLessThan(.02);
}
async function enter(page: Page) { await page.goto('/world'); await ready(page); }
async function spawn(page: Page, name: string) {
  await page.evaluate(name => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn(name), name);
  await page.waitForTimeout(180);
}
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
async function walkInside(page: Page, fixture: string, interior = fixture) {
  await spawn(page, fixture);
  expect((await state(page)).interior).toBeNull();
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await state(page)).interior, { timeout: 5000, intervals: [60] }).toBe(interior);
    // A shop counter at the back of the room answers once the visitor walks up to it.
    await expect.poll(async () => (await state(page)).hotspot, { timeout: 5000, intervals: [60] }).toBe(interior);
  }
  finally { await page.keyboard.up('w'); }
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page,list);
  page.on('pageerror',e=>list.push(e.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) list.push(message.text());
  });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

test('real keyboard movement crosses the ocean map seam without a position jump', async ({ page }) => {
  await enter(page); await spawn(page,'seam');
  const start = await state(page);
  expect(mapCoordinates(start.position).z).toBeGreaterThan(MAP_SEAM - 6);
  await hold(page, 'w', 4200);
  const end = await state(page);
  expect(mapCoordinates(end.position).z).toBeLessThan(MAP_MIN_Z + 12);
  expect(distance(start.position,end.position)).toBeGreaterThan(6);
  expect(distance(start.position,end.position)).toBeLessThan(13);
  expect(end.swimming).toBe(true);
  expect(end.radius).toBeCloseTo(SWIM_RADIUS,1);
  expect(dot(end.up,end.forward)).toBeCloseTo(0,5);
});

test('keyboard traversal remains stable crossing a pole', async ({ page }) => {
  await enter(page); await spawn(page,'pole');
  const start=await state(page);
  // The frozen polar-ocean fixture crosses the actual antipodal pole. Keep
  // this long enough to verify meaningful post-pole travel at normal walk
  // speed rather than merely reaching the singularity.
  await hold(page,'w',3600);
  const end=await state(page);
  expect(distance(start.position,end.position)).toBeGreaterThan(8);
  expect(Math.abs(end.lon-start.lon)).toBeGreaterThan(3);
  expect(dot(end.up,end.forward)).toBeCloseTo(0,5);
  expect(end.radius).toBeGreaterThan(RADIUS);
  expect(Number.isFinite(end.cameraDistance)).toBe(true);
});

test('building walls stop walking and skatepark stairs gain real height', async ({ page }) => {
  await enter(page); await spawn(page,'collision');
  const before=await state(page); await hold(page,'w',1300); const wall=await state(page);
  expect(distance(before.position,wall.position)).toBeGreaterThan(.2);
  expect(distance(before.position,wall.position)).toBeLessThan(1.5);
  await spawn(page,'stairs'); const foot=await state(page); await hold(page,'w',1800); const top=await state(page);
  expect(top.radius-foot.radius).toBeGreaterThan(.6);
  expect(top.grounded).toBe(true);
});

test('ocean supports continued travel beyond the coast', async ({ page }) => {
  await enter(page); await spawn(page,'shoreline');
  const shore=await state(page); await hold(page,'w',4500); const water=await state(page);
  expect(water.swimming).toBe(true);
  expect(water.radius).toBeCloseTo(SWIM_RADIUS,1);
  expect(distance(shore.position,water.position)).toBeGreaterThan(8);
  expect(dot(water.up,water.forward)).toBeCloseTo(0,5);
});

test('camera shortens at obstructions and globe view returns to the same place', async ({ page }) => {
  await enter(page); await spawn(page,'camera');
  await expect.poll(async()=>{const s=await state(page);return s.desiredCameraDistance-s.cameraDistance;}).toBeGreaterThan(.3);
  await spawn(page,'entry'); const initial=await state(page);
  await page.getByRole('button',{name:'Planet view',exact:true}).click();
  await expect.poll(async()=>(await state(page)).overviewTransition).toBeGreaterThan(.98);
  await hold(page,'w',350);
  expect(distance(initial.position,(await state(page)).position)).toBeLessThan(.05);
  await page.getByRole('button',{name:'Back to walking',exact:true}).first().click();
  await expect.poll(async()=>(await state(page)).overviewTransition).toBeLessThan(.02);
  expect(distance(initial.position,(await state(page)).position)).toBeLessThan(.05);
});

test('the pier looks out over open ocean while the mountain stays around the curve', async ({ page }) => {
  await enter(page);
  await spawn(page, 'pieroutward');
  await page.waitForTimeout(1200);
  const pier = await state(page);
  // The radius-72 globe hides the whole mountain from the pier: no summit on screen
  // and no camera assist pulling the view toward it.
  expect(pier.supportKind).toBe('pier');
  expect(pier.landmarkFraming.summitVisible).toBe(false);
  expect(pier.landmarkFraming.summitFraming).toBe(0);

  // The resort sits at the foot of the mountain on the far side of the town.
  await spawn(page, 'resort');
  const base = await state(page);
  const baseMap = mapCoordinates(base.position);
  expect(baseMap.x).toBeCloseTo(MOUNTAIN_LAYOUT.pedestrianArrival.x, 1);
  expect(baseMap.z).toBeCloseTo(MOUNTAIN_LAYOUT.pedestrianArrival.z, 1);
  expect(base.grounded).toBe(true);
  expect(base.swimming).toBe(false);

  // A vertical right-drag changes only the camera pitch, never the visitor.
  await spawn(page, 'pieroutward');
  await page.waitForTimeout(600);
  const beforeManualPitch = await state(page);
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(720, 495, { steps: 2 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(200);
  expect(distance(beforeManualPitch.position, (await state(page)).position)).toBeLessThan(.05);
});

test('mouse drag orbits the camera without walking or locking the pointer', async ({ page }) => {
  await enter(page); const initial=await state(page);
  await page.mouse.move(700,480); await page.mouse.down(); await page.mouse.move(820,480,{steps:8}); await page.waitForTimeout(300); await page.mouse.up();
  const end=await state(page);
  expect(distance(initial.position,end.position)).toBeLessThan(.05);
  expect(dot(initial.forward,end.forward)).toBeLessThan(Math.cos(.3));
  expect(await page.evaluate(()=>document.pointerLockElement)).toBeNull();
});

test('nearby project opens a small note, stops movement and remembers discovery', async ({ page }) => {
  await enter(page); await walkInside(page,'studio');
  await expect(page.getByRole('button',{name:`Explore ${PLANET_PLACES.find(place => place.id === 'studio')!.label}`})).toBeVisible();
  await page.keyboard.press('e'); const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox(); expect(bounds!.width).toBeLessThan(550); expect(bounds!.height).toBeLessThan(450);
  const initial=await state(page); await hold(page,'w',400); expect(distance(initial.position,(await state(page)).position)).toBeLessThan(.05);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Field notes',exact:true}).click();
  await expect(page.getByText(`1 of ${PLANET_PLACES.length} places explored · All optional`)).toBeVisible();
  expect(await page.getByRole('button',{name:'Directory',exact:true}).count()).toBe(0);
  await page.keyboard.press('Escape'); await expect.poll(async()=>(await state(page)).mode).toBe('exploring');
});

test('a fresh document return from project content always starts in the courtyard', async ({ page }) => {
  await enter(page); await walkInside(page,'studio');
  await page.keyboard.press('e'); await page.getByRole('link',{name:'View project',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/westcose-world$/); await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('link',{name:'Back to world',exact:true}).first().click(); await ready(page);
  const returned = await state(page);
  expect(returned.lon).toBeCloseTo(SPAWN_COORDS.lon, 3);
  expect(returned.lat).toBeCloseTo(SPAWN_COORDS.lat, 3);
  expect(returned.interior).toBeNull();
});

test('full reload returns to courtyard even when the prior position is a valid discovery', async ({ page }) => {
  await enter(page); await spawn(page, 'summit');
  // The summit fixture is the snowboard start plateau just below the peak.
  expect(mapCoordinates((await state(page)).position).z).toBeGreaterThan(MOUNTAIN_LAYOUT.summitPlateau.z - 4);
  await page.reload(); await ready(page);
  const arrival = await state(page);
  expect(arrival.lon).toBeCloseTo(SPAWN_COORDS.lon, 3);
  expect(arrival.lat).toBeCloseTo(SPAWN_COORDS.lat, 3);
  expect(arrival.swimming).toBe(false);
  expect(arrival.grounded).toBe(true);
});

test('pause clears held keys, effects toggle works, and reset returns to entry', async ({ page }) => {
  await enter(page); await hold(page,'w',500);
  await page.keyboard.down('w'); await page.keyboard.press('Escape'); const paused=await state(page);
  await page.waitForTimeout(400); await page.keyboard.up('w'); expect(distance(paused.position,(await state(page)).position)).toBeLessThan(.05);
  await page.getByRole('checkbox',{name:'Reduced effects'}).check();
  await page.getByRole('button',{name:'Resume exploring'}).click(); await page.waitForTimeout(350);
  expect(distance(paused.position,(await state(page)).position)).toBeLessThan(.05);
  await page.getByRole('button',{name:'Controls',exact:true}).click(); await page.getByRole('button',{name:'Return to entry'}).click();
  await expect.poll(async()=>(await state(page)).lon).toBeCloseTo(SPAWN_COORDS.lon,2);
});

test('invalid saved state safely starts at the entry', async ({ page }) => {
  await page.addInitScript(()=>localStorage.setItem('westcose-world:session:v2','{"version":2,"position":{"x":1e300,"y":0,"z":0}}'));
  await enter(page); const s=await state(page); expect(s.lon).toBeCloseTo(SPAWN_COORDS.lon,2); expect(s.radius).toBeGreaterThan(RADIUS); expect(s.grounded).toBe(true);
});

test('FightClub stays an honest unconnected cabinet', async ({ page }) => {
  await enter(page); await walkInside(page,'arcade'); await page.keyboard.press('e');
  await expect(page.getByRole('dialog',{name:'FightClub',exact:true})).toBeVisible();
  await expect(page.getByText('Not connected',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'View game status'})).toHaveAttribute('href','/games/fightclub');
});

test('each authored room can be entered and exited with real walking controls', async ({ page }) => {
  await enter(page);
  for (const interior of ['studio', 'about', 'workshop', 'lab', 'arcade', 'skateshop']) {
    await walkInside(page, interior);
    const inside = await state(page);
    expect(inside.supportKind).toBe('floor');
    expect(inside.swimming).toBe(false);
    await hold(page, 'w', 250);
    expect((await state(page)).interior).toBe(interior);
    await page.keyboard.down('s');
    try { await expect.poll(async () => (await state(page)).interior, { timeout: 4000, intervals: [60] }).toBeNull(); }
    finally { await page.keyboard.up('s'); }
    expect((await state(page)).swimming).toBe(false);
    expect(dot((await state(page)).up, (await state(page)).forward)).toBeCloseTo(0, 5);
  }
});

test('the beach approach supports dry walking onto the timber pier', async ({ page }) => {
  await enter(page);
  await spawn(page, 'pierapproach');
  expect((await state(page)).supportKind).toBe('ground');
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await state(page);
      expect(current.swimming).toBe(false);
      return current.supportKind;
    }, { timeout: 5000, intervals: [60] }).toBe('pier');
  } finally { await page.keyboard.up('w'); }
  const deck = await state(page);
  expect(mapCoordinates(deck.position).z).toBeLessThan(PIER_LAYOUT.approach.start[1]);
  expect(deck.swimming).toBe(false);
  // Walk the complete new pier instead of only validating its first metre.
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await state(page);
      expect(current.supportKind).toBe('pier');
      expect(current.swimming).toBe(false);
      return mapCoordinates(current.position).z;
    }, { timeout: 14000, intervals: [120] }).toBeLessThan(PIER_LAYOUT.head.center[1] - .5);
  } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('s');
  try {
    await expect.poll(async () => {
      const current = await state(page);
      expect(current.swimming).toBe(false);
      return current.supportKind;
    }, { timeout: 14000, intervals: [120] }).toBe('ground');
  } finally { await page.keyboard.up('s'); }
});

test('unavailable WebGL leaves direct HTML destinations usable', async ({ page }) => {
  await page.addInitScript(()=>{ const original=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(this: HTMLCanvasElement, ...args:Parameters<typeof original>){if(String(args[0]).startsWith('webgl'))return null;return original.apply(this,args);} as typeof original; });
  await page.goto('/world'); await expect(page.getByRole('navigation',{name:'World destinations'})).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0); await page.getByRole('link',{name:/Projects/}).click(); await expect(page).toHaveURL(/\/projects$/);
});

test.describe('phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  test('one-finger control walks on the same 3D planet',async({page,context})=>{
    await enter(page); const pad=page.getByTestId('move-pad'); await expect(pad).toBeVisible();
    const box=(await pad.boundingBox())!; const x=box.x+box.width/2,y=box.y+box.height/2;
    const initial=await state(page); const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-48}]});
    await page.waitForTimeout(900); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const end=await state(page); expect(distance(initial.position,end.position)).toBeGreaterThan(2);
    await page.waitForTimeout(350); expect(distance(end.position,(await state(page)).position)).toBeLessThan(.05);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Field notes',exact:true}).tap(); await expect(page.getByRole('complementary',{name:'Field notes'})).toBeVisible();
  });
});
