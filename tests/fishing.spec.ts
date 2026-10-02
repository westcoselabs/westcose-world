import { expect, test, type Page } from '@playwright/test';

type FishingHud = {
  phase: string; worms: number; cooler: number; clams: number; chain: number; live: { species: string; tier: number } | null;
  fish: string | null; fishTier: number; catch: { species: string; tier: number; clams: number } | null; decide: boolean;
};
type FishingState = { active: boolean; worldMode: string; phase: string; time: number; landed: number; last: string | null; hud: FishingHud; result: { clams: number } | null };
type WorldState = { mode: string; hotspot: string | null; interior: string | null; supportKind: string; mapX: number; mapZ: number; overviewTransition: number };
type Debug = {
  getState: () => WorldState; spawn: (name: string) => void;
  fishing: {
    getState: () => FishingState; forceBite: (species: string, variant?: string | null) => void;
    autoFight: (kind: 'expert' | null) => void; endTide: () => void;
  };
};
type DebugWindow = Window & { __WESTCOSE_WORLD__: Debug };
const world = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.getState());
const fishing = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.fishing.getState());
const spawn = (page: Page, name: string) => page.evaluate(name => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn(name), name);
const forceBite = (page: Page, species: string) => page.evaluate(species => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.fishing.forceBite(species, 'normal'), species);
const autoFight = (page: Page, kind: 'expert' | null) => page.evaluate(kind => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.fishing.autoFight(kind), kind);
const endTide = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.fishing.endTide());

async function enter(page: Page) {
  await page.goto('/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
  await expect.poll(async () => (await world(page)).overviewTransition, { timeout: 30_000 }).toBeLessThan(.02);
}
/** Walk to the rail, open the bait cart and start a tide. */
async function startTide(page: Page) {
  await spawn(page, 'fishing');
  await expect.poll(async () => (await world(page)).hotspot, { timeout: 8000 }).toBe('fishing');
  await expect(page.getByRole('button', { name: 'Explore Pier Pressure' })).toContainText('Go fishing');
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Pier Pressure' })).toBeVisible();
  await page.getByTestId('start-tide').click();
  await expect.poll(async () => (await fishing(page)).worldMode).toBe('fishing');
  await expect.poll(async () => (await fishing(page)).hud.phase).toBe('ready');
}
/** Strike as soon as the CHOMP comes, then let the expert bot play the fight to the card. */
async function strikeAndLand(page: Page) {
  await expect.poll(async () => (await fishing(page)).hud.phase, { timeout: 20_000, intervals: [40] }).toBe('bite');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await fishing(page)).hud.phase, { timeout: 5000 }).toBe('fight');
  await autoFight(page, 'expert');
  await expect.poll(async () => (await fishing(page)).hud.phase, { timeout: 60_000 }).toBe('catch');
  await autoFight(page, null);
  await expect.poll(async () => (await fishing(page)).hud.decide).toBe(true);
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

test('the rail at the end of the pier opens Pier Pressure, and a tide plays from cast to Tide Report', async ({ page }) => {
  test.setTimeout(240_000);
  await enter(page);
  await page.evaluate(() => localStorage.removeItem('westcose-world:fishing:v1'));
  await startTide(page);
  await expect(page.locator('.fishing-hud')).toBeVisible();
  expect((await fishing(page)).hud.worms).toBe(6);

  // Pausing shows only the tide's panel and freezes the tide.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Tide paused.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Take your time.' })).toHaveCount(0);
  const paused = (await fishing(page)).time;
  await page.waitForTimeout(600);
  expect((await fishing(page)).time).toBe(paused);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await fishing(page)).worldMode).toBe('fishing');

  // A sardine: strike on the CHOMP, fight, and bait it for something bigger.
  await forceBite(page, 'sardine');
  await strikeAndLand(page);
  expect((await fishing(page)).hud.catch?.species).toBe('sardine');
  await expect(page.getByTestId('fish-bait')).toBeVisible();
  await page.getByTestId('fish-bait').click();
  await expect.poll(async () => (await fishing(page)).hud.live?.tier).toBe(0);

  // Live bait draws the next tier up. Cast it out with a real key hold.
  await page.keyboard.down('Space'); await page.waitForTimeout(900); await page.keyboard.up('Space');
  await strikeAndLand(page);
  const second = (await fishing(page)).hud.catch!;
  expect(second.tier).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('e');
  await expect.poll(async () => (await fishing(page)).hud.cooler).toBe(1);

  // Ending the tide keeps the cooler and prints the Tide Report; records stay on the device.
  await endTide(page);
  await expect(page.getByRole('dialog', { name: 'Tide Report' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('tide-clams')).toContainText(String(second.clams));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('westcose-world:fishing:v1') ?? '{}'));
  expect(saved.tides).toBe(1);
  expect(saved.clams).toBe(second.clams);
  expect(Object.keys(saved.dex)).toEqual(expect.arrayContaining(['sardine', second.species]));

  // Leaving puts the walker back at the rail.
  await page.getByTestId('tide-leave').click();
  await expect.poll(async () => (await world(page)).mode).toBe('exploring');
  expect((await fishing(page)).active).toBe(false);
  await expect.poll(async () => (await world(page)).supportKind).toBe('pier');
  expect((await world(page)).mapZ).toBeLessThan(-65);
});

test('on a phone the round button casts and the pad steers', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  errors.set(page, []);
  page.on('pageerror', e => errors.get(page)!.push(e.message));
  await enter(page);
  await spawn(page, 'fishing');
  await expect.poll(async () => (await world(page)).hotspot, { timeout: 8000 }).toBe('fishing');
  await page.getByRole('button', { name: 'Explore Pier Pressure' }).click();
  await page.getByTestId('start-tide').click();
  await expect.poll(async () => (await fishing(page)).hud.phase).toBe('ready');
  await expect(page.getByTestId('fishing-pad')).toBeVisible();
  const button = page.getByTestId('fishing-primary');
  await button.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await expect.poll(async () => (await fishing(page)).hud.phase).toBe('charging');
  await page.waitForTimeout(700);
  await button.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await expect.poll(async () => (await fishing(page)).hud.phase).not.toBe('charging');
  expect(errors.get(page)).toEqual([]);
  await context.close();
});

test('the WestCose Shop opens its clothing panel, and Services answers at Palm Court', async ({ page }) => {
  await enter(page);
  await spawn(page, 'workshop');
  await page.keyboard.down('w');
  try { await expect.poll(async () => (await world(page)).hotspot, { timeout: 6000, intervals: [60] }).toBe('workshop'); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Wear the coast.' })).toBeVisible();
  await expect(page.getByText('Online store coming soon', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await spawn(page, 'studiooffice');
  expect((await world(page)).hotspot).not.toBe('services');
  await page.keyboard.down('w');
  try { await expect.poll(async () => (await world(page)).hotspot, { timeout: 6000, intervals: [60] }).toBe('services'); }
  finally { await page.keyboard.up('w'); }
  await expect(page.getByRole('button', { name: 'Explore WestCose Studio' })).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Room for the next idea.' })).toBeVisible();
  await expect(page.getByText('WestCose Studio', { exact: true }).first()).toBeVisible();
});
