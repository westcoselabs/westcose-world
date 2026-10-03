import { expect, test, type Page } from '@playwright/test';
import { mapFrame } from '../src/features/world/data/world-map';
import { RADIUS } from '../src/features/world/data/planet';
import { PLAYER_CENTER_HEIGHT } from '../src/features/world/runtime/types';
import { SEA_CAVE_FRAME } from '../src/features/world/data/sea-cave';
import { SEA_CAVE_ARENA, SEA_CAVE_CHAMBERS, SEA_CAVE_MOUTH, SEA_CAVE_WINDOW } from '../src/features/world/data/sea-cave-layout';
import { LIGHTHOUSE_TOWER, lighthousePoint, stairPoint } from '../src/features/world/data/lighthouse-tower';

type Vec = { x: number; y: number; z: number };
type SupportLayer = 'upper' | 'tunnel';
type Facing = { east: number; north: number };
type WorldState = {
  mode: string; position: Vec; mapX: number; mapZ: number; radius: number; swimming: boolean;
  supportLayer: SupportLayer; currentArea: string; hotspot: string | null; overviewTransition: number;
};
type DebugWindow = Window & { __WESTCOSE_WORLD__: {
  getState: () => WorldState; spawn: (name: string) => void;
  spawnAt: (x: number, z: number, facing?: Facing, layer?: SupportLayer, elevation?: number) => void;
} };

const state = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.getState());
/** Height of the visitor's feet above the base sphere. */
const feet = (s: WorldState) => s.radius - RADIUS - PLAYER_CENTER_HEIGHT;
async function enter(page: Page) {
  await page.goto('/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await state(page)).mode).toBe('exploring');
  await expect.poll(async () => (await state(page)).overviewTransition, { timeout: 22_000 }).toBeLessThan(.02);
}
/** Stand at sea-cave local metres, facing another local point. */
async function standAt(page: Page, from: readonly [number, number], toward: readonly [number, number], layer: SupportLayer, elevation?: number) {
  const chart = SEA_CAVE_FRAME.chart(from[0], from[1]), frame = mapFrame(chart.x, chart.z), t = SEA_CAVE_FRAME.tangents(from[0], from[1]);
  const direction = t.east.multiplyScalar(toward[0] - from[0]).addScaledVector(t.north, toward[1] - from[1]).normalize();
  const facing = { east: direction.dot(frame.east), north: direction.dot(frame.north) };
  await page.evaluate(({ x, z, facing, layer, elevation }) => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawnAt(x, z, facing, layer, elevation), { x: chart.x, z: chart.z, facing, layer, elevation });
  await page.waitForTimeout(250);
}
const local = (s: WorldState) => SEA_CAVE_FRAME.local(s.position);
/** Tower metres to sea-cave local metres (the tower stands on the 6.2m terrace). */
const towerLocal = (x: number, y: number, z: number) => { const q = SEA_CAVE_FRAME.local(lighthousePoint(x, y, z)); return [q.u, q.v] as const; };

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', e => list.push(e.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) list.push(message.text());
  });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

test('walk in from the beach, cross the Grotto to the ocean window, and the lip holds', async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page);
  // From the beach outside the mouth, walking in puts the visitor on the cave floor.
  await page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn('cave'));
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await state(page)).currentArea, { timeout: 8000, intervals: [100] }).toBe('Sea Cave Tunnel');
    await expect.poll(async () => SEA_CAVE_FRAME.local((await state(page)).position).u, { timeout: 8000, intervals: [100] }).toBeGreaterThan(SEA_CAVE_MOUTH.center[0] + 2);
  } finally { await page.keyboard.up('w'); }
  expect((await state(page)).supportLayer).toBe('tunnel');

  // Across the Grotto and up the ramp onto the window ledge.
  const grotto = SEA_CAVE_CHAMBERS.find(chamber => chamber.id === 'grotto')!;
  await standAt(page, SEA_CAVE_ARENA.center, SEA_CAVE_WINDOW.center, 'tunnel');
  expect((await state(page)).currentArea).toBe('The Grotto');
  expect(feet(await state(page))).toBeCloseTo(grotto.floor, 1);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await state(page)).currentArea, { timeout: 10_000, intervals: [100] }).toBe('Ocean Window');
    await expect.poll(async () => feet(await state(page)), { timeout: 10_000, intervals: [100] }).toBeGreaterThan(SEA_CAVE_WINDOW.sill - .3);
    // Keep pushing at the lip: the visitor stays on the ledge, dry, in the cave.
    await page.waitForTimeout(2500);
  } finally { await page.keyboard.up('w'); }
  const lip = await state(page);
  expect(lip.supportLayer).toBe('tunnel');
  expect(lip.swimming).toBe(false);
  expect(feet(lip)).toBeGreaterThan(SEA_CAVE_WINDOW.sill - .3);
  expect(local(lip).u).toBeLessThan(SEA_CAVE_WINDOW.center[0]);
});

test('the mouth leads back out onto the beach', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);
  const length = Math.hypot(...SEA_CAVE_MOUTH.inward), inward = [SEA_CAVE_MOUTH.inward[0] / length, SEA_CAVE_MOUTH.inward[1] / length];
  const inside = [SEA_CAVE_MOUTH.center[0] + inward[0] * 2.5, SEA_CAVE_MOUTH.center[1] + inward[1] * 2.5] as const;
  const beach = [SEA_CAVE_MOUTH.center[0] - inward[0] * 8, SEA_CAVE_MOUTH.center[1] - inward[1] * 8] as const;
  await standAt(page, inside, beach, 'tunnel');
  expect((await state(page)).supportLayer).toBe('tunnel');
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await state(page)).supportLayer, { timeout: 8000, intervals: [100] }).toBe('upper');
  } finally { await page.keyboard.up('w'); }
  const out = await state(page);
  expect(out.swimming).toBe(false);
  expect(SEA_CAVE_FRAME.local(out.position).u).toBeLessThan(SEA_CAVE_MOUTH.center[0]);
});

test('climb the lighthouse stair, read the field note on the balcony, and the rail holds', async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page);
  // Up the stair from three places along it: walking on climbs.
  for (const fraction of [.1, .45, .8]) {
    const here = stairPoint(fraction, 0), ahead = stairPoint(fraction + .04, 0);
    const point = lighthousePoint(here.x, here.y, here.z);
    await standAt(page, towerLocal(here.x, here.y, here.z), towerLocal(ahead.x, ahead.y, ahead.z), 'upper', point.length() - RADIUS);
    const start = await state(page);
    expect(start.currentArea).toBe('Lighthouse Stair');
    expect(feet(start)).toBeCloseTo(LIGHTHOUSE_TOWER.terrace + here.height, 0);
    await page.keyboard.down('w');
    try {
      await expect.poll(async () => feet(await state(page)), { timeout: 6000, intervals: [100] }).toBeGreaterThan(feet(start) + .5);
    } finally { await page.keyboard.up('w'); }
  }
  // On the balcony: the field note answers E.
  await page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn('lighthousegallery'));
  await page.waitForTimeout(400);
  const gallery = await state(page);
  expect(gallery.currentArea).toBe('Lighthouse Gallery');
  expect(feet(gallery)).toBeCloseTo(LIGHTHOUSE_TOWER.terrace + LIGHTHOUSE_TOWER.gallery, 0);
  await expect.poll(async () => (await state(page)).hotspot, { timeout: 4000 }).toBe('beach');
  await page.keyboard.press('e');
  await expect(page.getByText('You found the quiet side.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('exploring');
  // Walk straight out over the rail: the balcony holds.
  const out = lighthousePoint(Math.cos(-72 * Math.PI / 180) * 6, LIGHTHOUSE_TOWER.gallery, -Math.sin(-72 * Math.PI / 180) * 6);
  const stand = SEA_CAVE_FRAME.local(gallery.position), away = SEA_CAVE_FRAME.local(out);
  await standAt(page, [stand.u, stand.v], [away.u, away.v], 'upper', LIGHTHOUSE_TOWER.terrace + LIGHTHOUSE_TOWER.gallery);
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  expect(feet(await state(page))).toBeCloseTo(LIGHTHOUSE_TOWER.terrace + LIGHTHOUSE_TOWER.gallery, 0);
});
