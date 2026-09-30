import { expect, test, type Page } from '@playwright/test';
import { PLANET_FIXTURES } from '../src/features/world/data/planet';

type SnowboardState = {
  active: boolean; mode: string; runId: string | null; phase: string; countdown: number; time: number; score: number;
  speed: number; progress: number; airborne: boolean; crashed: boolean; launches: number; lastLanding: string | null;
  lateral: number; combo: number; tokens: number;
};
type Debug = {
  getState: () => { mode: string; hotspot: string | null; mapX: number; mapZ: number; currentArea: string };
  spawn: (name: string) => void;
  snowboard: {
    getState: () => SnowboardState;
    startRun: (id: string) => void;
    spawnOnRun: (id: string, progress: number, speed: number) => void;
    setInput: (input: Record<string, unknown> | null) => void;
  };
};
const world = (page: Page) => page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.getState());
const board = (page: Page) => page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.getState());
async function enter(page: Page) {
  await page.goto('/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
}
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID|INVALID_OPERATION/i.test(message.text())) list.push(message.text());
  });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

test('the lift-ticket booth opens the run menu and the green run starts at the summit', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.spawn('tickets'));
  await expect.poll(async () => (await world(page)).hotspot).toBe('tickets');
  await expect(page.getByRole('button', { name: 'Explore Lift Tickets' })).toBeVisible();
  await page.keyboard.press('e');
  await expect.poll(async () => (await world(page)).mode).toBe('tickets');
  const menu = page.getByRole('dialog', { name: 'Lift tickets' });
  await expect(menu).toBeVisible();
  for (const rating of ['Green Circle', 'Blue Square', 'Black Diamond', 'Double Black Diamond']) await expect(menu.getByText(rating, { exact: false }).first()).toBeVisible();
  await page.getByTestId('ride-sunday-cruise').click();
  await expect.poll(async () => (await board(page)).phase).toBe('countdown');
  const start = await board(page);
  expect(start.mode).toBe('snowboard');
  expect(start.runId).toBe('sunday-cruise');
  expect(start.progress).toBeLessThan(.01);
  await expect.poll(async () => (await board(page)).phase, { timeout: 15_000 }).toBe('riding');
  await expect(page.getByLabel('Snowboard run')).toBeVisible();
  // The walker waits at the booth while the rider is on the mountain.
  expect((await world(page)).mode).toBe('snowboard');
});

test('real keys tuck, carve, ollie and pause a run', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.spawnOnRun('sunday-cruise', .02, 5));
  await expect.poll(async () => (await board(page)).phase).toBe('riding');
  const before = await board(page);
  await hold(page, 'w', 1600);
  await expect.poll(async () => (await board(page)).progress).toBeGreaterThan(before.progress + .01);
  const lateral = (await board(page)).lateral;
  await hold(page, 'd', 900);
  await expect.poll(async () => (await board(page)).lateral).toBeLessThan(lateral - .2);
  const launches = (await board(page)).launches;
  await page.keyboard.down('Space'); await page.waitForTimeout(450); await page.keyboard.up('Space');
  await expect.poll(async () => (await board(page)).launches).toBeGreaterThan(launches);
  await expect.poll(async () => (await board(page)).airborne, { timeout: 10_000 }).toBe(false);
  expect((await board(page)).crashed).toBe(false);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await world(page)).mode).toBe('paused');
  await expect(page.getByRole('complementary', { name: 'Run paused' })).toBeVisible();
  const frozen = (await board(page)).time;
  await page.waitForTimeout(600);
  expect((await board(page)).time).toBe(frozen);
  await page.getByRole('button', { name: 'Resume run' }).first().click();
  await expect.poll(async () => (await world(page)).mode).toBe('snowboard');
  await expect.poll(async () => (await board(page)).time).toBeGreaterThan(frozen);
});

test('finishing a run shows results, then returns the walker to the booth', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.spawnOnRun('sunday-cruise', .95, 9));
  await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.setInput({ tuck: true }));
  await expect.poll(async () => (await board(page)).phase, { timeout: 30_000 }).toBe('finished');
  await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.setInput(null));
  const results = page.getByRole('dialog', { name: 'Run results' });
  await expect(results).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('results-score')).not.toHaveText('');
  await page.getByTestId('back-to-resort').click();
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
  const state = await world(page);
  expect(Math.hypot(state.mapX - PLANET_FIXTURES.tickets.x, state.mapZ - PLANET_FIXTURES.tickets.z)).toBeLessThan(1);
  await expect.poll(async () => (await world(page)).hotspot).toBe('tickets');
  // The record reached the booth menu.
  await page.keyboard.press('e');
  await expect(page.getByTestId('ride-sunday-cruise')).toContainText('Best');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('touch controls steer and the Jump button ollies', async ({ page }) => {
    await enter(page);
    await page.evaluate(() => (window as unknown as { __WESTCOSE_WORLD__: Debug }).__WESTCOSE_WORLD__.snowboard.spawnOnRun('lighthouse-line', .05, 8));
    await expect.poll(async () => (await board(page)).phase).toBe('riding');
    await expect(page.getByTestId('snowboard-pad')).toBeVisible();
    const jump = page.getByTestId('snowboard-jump');
    await expect(jump).toBeVisible();
    const launches = (await board(page)).launches;
    await jump.dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(400);
    await jump.dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch', isPrimary: true });
    await expect.poll(async () => (await board(page)).launches).toBeGreaterThan(launches);
  });
});
