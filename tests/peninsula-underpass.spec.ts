import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { MAP_RADIUS, mapDirection } from '../src/features/world/data/world-map';
import { PENINSULA_CAVE, PENINSULA_COVE, PENINSULA_LIGHTHOUSE } from '../src/features/world/data/peninsula-layout';

type Vec = { x: number; y: number; z: number };
type SupportLayer = 'upper' | 'tunnel';
type WorldState = {
  mode: string;
  position: Vec;
  forward: Vec;
  up: Vec;
  mapX: number;
  mapZ: number;
  radius: number;
  grounded: boolean;
  swimming: boolean;
  supportKind: 'ground' | 'floor' | 'pier' | 'water';
  supportLayer: SupportLayer;
  cameraDistance: number;
  desiredCameraDistance: number;
  overviewTransition: number;
};
type DebugWindow = Window & {
  __WESTCOSE_WORLD__: {
    getState: () => WorldState;
    spawn: (name: string) => void;
    spawnAt: (x: number, z: number, facing?: 'east' | 'north' | 'south' | 'west', layer?: SupportLayer) => void;
  };
};

const state = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.getState());
const chartDistance = (from: WorldState, x: number, z: number) => mapDirection(from.mapX, from.mapZ).angleTo(mapDirection(x, z)) * MAP_RADIUS;

async function enter(page: Page) {
  await page.goto('/world');
  await expect(page.getByTestId('enter-world')).toBeEnabled({ timeout: 45_000 });
  await page.getByTestId('enter-world').click();
  await expect.poll(async () => (await state(page)).mode).toBe('exploring');
  await expect.poll(async () => (await state(page)).overviewTransition).toBeLessThan(.02);
}

/**
 * Uses the exact right-drag yaw path available to a visitor. Keeping each
 * drag bounded avoids browser-coordinate limits on the long curved passage.
 */
async function face(page: Page, x: number, z: number) {
  for (let turn = 0; turn < 5; turn++) {
    const current = await state(page);
    const up = new Vector3(current.up.x, current.up.y, current.up.z).normalize();
    const forward = new Vector3(current.forward.x, current.forward.y, current.forward.z)
      .addScaledVector(up, -new Vector3(current.forward.x, current.forward.y, current.forward.z).dot(up)).normalize();
    const target = mapDirection(x, z).addScaledVector(up, -mapDirection(x, z).dot(up)).normalize();
    const yaw = Math.atan2(up.dot(forward.clone().cross(target)), forward.dot(target));
    if (Math.abs(yaw) < .025) return;
    const dx = Math.max(-250, Math.min(250, -yaw / .005));
    await page.mouse.move(720, 450);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(720 + dx, 450, { steps: 2 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(55);
  }
}

/** Move through the actual controller rather than changing map coordinates at a checkpoint. */
async function walkTo(page: Page, x: number, z: number, label: string, tolerance = .82) {
  let prior = await state(page);
  for (let step = 0; step < 20; step++) {
    const remaining = chartDistance(prior, x, z);
    if (remaining < tolerance) return prior;
    await face(page, x, z);
    await page.keyboard.down('w');
    // Keep the visitor on real native input, but shorten the final pulse so
    // it cannot repeatedly overshoot a close checkpoint on the curved globe.
    const pulseMs = Math.min(330, Math.max(50, ((remaining - tolerance * .35) / 4.8) * 1_000));
    await page.waitForTimeout(pulseMs);
    await page.keyboard.up('w');
    await page.waitForTimeout(20);
    const next = await state(page);
    expect(Math.hypot(next.position.x - prior.position.x, next.position.y - prior.position.y, next.position.z - prior.position.z),
      `${label}: native W input must advance the visitor`).toBeGreaterThan(.08);
    prior = next;
  }
  expect(chartDistance(prior, x, z), `${label}: did not reach its real map checkpoint`).toBeLessThan(tolerance);
  return prior;
}

function expectDryGround(current: WorldState, layer: SupportLayer) {
  expect(current.supportLayer).toBe(layer);
  expect(current.supportKind).toBe('ground');
  expect(current.grounded).toBe(true);
  expect(current.swimming).toBe(false);
}

test('native controls traverse the lower lighthouse underpass without dropping the upper terrace', async ({ page }) => {
  await enter(page);

  // First establish the upper support at the exact direction where the cave
  // passes below the tower. This is an allowed diagnostic spawn, not a route
  // shortcut; the later route itself starts at the public portal.
  await page.evaluate(({ x, z }) => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawnAt(x, z, 'east', 'upper'), PENINSULA_LIGHTHOUSE);
  await expect.poll(async () => (await state(page)).supportLayer).toBe('upper');
  const terrace = await state(page);
  expectDryGround(terrace, 'upper');
  const upperFootRadius = terrace.radius - .85;

  // The fixture begins two metres before the public mouth. Every later point
  // is reached using right-drag plus W, through the real player controller.
  await page.evaluate(() => (window as unknown as DebugWindow).__WESTCOSE_WORLD__.spawn('cave'));
  await expect.poll(async () => chartDistance(await state(page), PENINSULA_CAVE.points[0][0] - 2, PENINSULA_CAVE.points[0][1])).toBeLessThan(.35);

  const controls = PENINSULA_CAVE.points.slice(1);
  for (const [index, point] of controls.entries()) {
    const current = await walkTo(page, point[0], point[1], `underpass control ${index + 1}`);
    expectDryGround(current, 'tunnel');
    if (point[0] === PENINSULA_LIGHTHOUSE.x && point[1] === PENINSULA_LIGHTHOUSE.z) {
      const lowerFootRadius = current.radius - .85;
      expect(upperFootRadius - lowerFootRadius).toBeGreaterThan(PENINSULA_CAVE.clearance + 1);
      // The real collision ray may shorten the follow view, but it must never
      // pass through the roof or wall to an invalid zero/negative distance.
      expect(current.cameraDistance).toBeGreaterThanOrEqual(.7);
      expect(current.desiredCameraDistance - current.cameraDistance).toBeGreaterThan(.3);
    }
  }

  // Unlike tunnel control points, the public cove target must be reached
  // closely enough to lie beyond the finite exit apron before asserting the
  // outdoor layer; a broad checkpoint tolerance could stop inside the apron.
  const cove = await walkTo(page, PENINSULA_COVE.x, PENINSULA_COVE.z, 'hidden-beach exit', .2);
  expectDryGround(cove, 'upper');
});
