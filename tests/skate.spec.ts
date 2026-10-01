import { expect, test, type Page } from '@playwright/test';

type SkateState = {
  owned: boolean; riding: boolean; worldMode: string; mode: string; air: number; mapX: number; mapZ: number;
  launches: number; landings: number; bails: number;
  hud: { nearGame: boolean; score: number; game: { phase: string; time: number; letters: Record<string, boolean> } };
};
type WorldState = { mode: string; hotspot: string | null; interior: string | null; overviewTransition: number };
type Debug = {
  getState: () => WorldState; spawn: (name: string) => void;
  skate: { getState: () => SkateState; giveBoard: () => void; spawnPark: (u: number, v: number, du: number, dv: number, speed: number) => void };
};
type DebugWindow = Window & { __WESTCOSE_WORLD__: Debug };
const world = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.getState());
const skate = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.skate.getState());
const spawn = (page: Page, name: string) => page.evaluate(name => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn(name), name);

async function enter(page: Page) {
  await page.goto('/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
  await expect.poll(async () => (await world(page)).overviewTransition, { timeout: 30_000 }).toBeLessThan(.02);
}
async function holdUntil(page: Page, key: string, check: () => Promise<unknown>, expected: unknown) {
  await page.keyboard.down(key);
  try { await expect.poll(check, { timeout: 6000, intervals: [60] }).toBe(expected); }
  finally { await page.keyboard.up(key); }
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', e => list.push(e.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) list.push(message.text());
  });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

test('the skate shop counter hands over a board that rides outdoors only', async ({ page }) => {
  await enter(page);
  expect((await skate(page)).owned).toBe(false);
  await spawn(page, 'skateshop');
  await holdUntil(page, 'w', async () => (await world(page)).hotspot, 'skateshop');
  expect((await world(page)).interior).toBe('skateshop');
  await page.keyboard.press('e');
  await expect.poll(async () => (await skate(page)).owned).toBe(true);

  // Boards stay off indoors.
  await page.keyboard.press('b');
  await expect(page.locator('.board-note')).toContainText(/indoors/i);
  expect((await skate(page)).riding).toBe(false);

  // Outside, B equips; turned away from the shop the board pushes off, and B steps off it.
  await holdUntil(page, 's', async () => (await world(page)).interior, null);
  await page.keyboard.down('s'); await page.waitForTimeout(500); await page.keyboard.up('s');
  await page.keyboard.press('b');
  await expect.poll(async () => (await skate(page)).worldMode).toBe('skating');
  await expect(page.getByTestId('board-toggle')).toContainText(/unequip/i);
  await page.keyboard.down('a'); await page.waitForTimeout(1000); await page.keyboard.up('a');
  const start = await skate(page);
  await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
  const pushed = await skate(page);
  expect(Math.hypot(pushed.mapX - start.mapX, pushed.mapZ - start.mapZ)).toBeGreaterThan(1);
  await page.keyboard.press('b');
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
  expect((await skate(page)).riding).toBe(false);
});

test('without a board the park entrance points to the skate shop', async ({ page }) => {
  await enter(page);
  // The grand stairs up to the park carry the game prompt.
  await spawn(page, 'stairs');
  await holdUntil(page, 'w', async () => (await world(page)).hotspot, 'skatepark');
  await page.keyboard.press('e');
  await expect(page.locator('.board-note')).toContainText(/skateboard/i);
  expect((await skate(page)).hud.game.phase).toBe('none');
  expect((await world(page)).mode).toBe('exploring');
});

test('the park entrance starts a Game of S.K.A.T.E. and a big Deep End air takes the K', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.skate.giveBoard());
  // The grand stairs up to the park carry the game prompt.
  await spawn(page, 'stairs');
  await holdUntil(page, 'w', async () => (await world(page)).hotspot, 'skatepark');
  await page.keyboard.press('e');
  await expect.poll(async () => (await skate(page)).hud.game.phase).toBe('countdown');
  expect((await skate(page)).worldMode).toBe('skating');
  await expect.poll(async () => (await skate(page)).hud.game.phase, { timeout: 8000 }).toBe('playing');
  expect((await skate(page)).hud.game.time).toBeLessThan(120);

  // Straight across the Deep End at speed: the vert air off its west wall rises through the K.
  await page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.skate.spawnPark(-9, -10.4, -1, 0, 11));
  await expect.poll(async () => (await skate(page)).hud.game.letters.K, { timeout: 8000 }).toBe(true);
  const after = await skate(page);
  expect(after.launches).toBeGreaterThan(0);
  expect(after.hud.game.letters.S).toBe(false);
});
