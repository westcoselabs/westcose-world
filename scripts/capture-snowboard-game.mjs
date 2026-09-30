import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Captures the snowboard mini-game from the real game camera: the booth, the run menu,
// every run's start gate and a mid-run frame, a kicker air, results and the phone HUD.
// Usage: WORLD_CAPTURE_URL=http://127.0.0.1:3100 node scripts/capture-snowboard-game.mjs
const base = process.env.WORLD_CAPTURE_URL || 'http://127.0.0.1:3000';
const destination = path.resolve(process.env.WORLD_SNOWBOARD_GAME_DIR || 'docs/qa/snowboard-v1/game');
mkdirSync(path.join(destination, 'views'), { recursive: true });
const RUNS = ['sunday-cruise', 'lighthouse-line', 'timber-chute', 'dead-coast-couloir'];
const report = { capturedAt: new Date().toISOString(), base, views: [], errors: [] };

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
async function open(profile) {
  const page = await browser.newPage(profile === 'phone'
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(`${profile} pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|Shader|GLSL|GL_INVALID/i.test(message.text())) report.errors.push(`${profile} console: ${message.text()}`); });
  await page.goto(`${base}/world`);
  await page.getByTestId('enter-world').click({ timeout: 90_000 });
  await page.waitForFunction(() => window.__WESTCOSE_WORLD__?.getState().mode === 'exploring');
  await page.waitForTimeout(1500);
  return page;
}
const debug = (page, script, argument) => page.evaluate(script, argument);
const board = page => debug(page, () => window.__WESTCOSE_WORLD__.snowboard.getState());
async function shot(page, profile, id, note) {
  const file = `${profile}-${id}.jpg`;
  await page.screenshot({ path: path.join(destination, 'views', file), type: 'jpeg', quality: 78 });
  const state = await board(page).catch(() => null);
  report.views.push({ file, profile, note, phase: state?.phase ?? null, runId: state?.runId ?? null, speed: state ? +state.speed.toFixed(1) : null });
  console.log('captured', file);
}
async function waitFor(page, predicate, timeout = 15_000) {
  await page.waitForFunction(predicate, null, { timeout }).catch(() => report.errors.push(`timed out waiting: ${predicate.toString().slice(0, 80)}`));
}

try {
  const desktop = await open('desktop');
  await debug(desktop, () => window.__WESTCOSE_WORLD__.spawn('tickets'));
  await desktop.waitForTimeout(1600);
  await shot(desktop, 'desktop', 'booth', 'Lift Tickets prompt at the booth');
  await desktop.keyboard.press('e');
  await desktop.waitForTimeout(700);
  await shot(desktop, 'desktop', 'ticket-menu', 'Run menu with ratings, records and controls');
  await desktop.getByText('Controls', { exact: true }).click();
  await desktop.waitForTimeout(300);
  await shot(desktop, 'desktop', 'ticket-menu-controls', 'Controls expanded');
  await desktop.keyboard.press('Escape');
  for (const run of RUNS) {
    await debug(desktop, run => window.__WESTCOSE_WORLD__.snowboard.startRun(run), run);
    await desktop.waitForTimeout(1300);
    await shot(desktop, 'desktop', `${run}-start`, 'Start gate during the countdown');
    await debug(desktop, run => { window.__WESTCOSE_WORLD__.snowboard.spawnOnRun(run, .42, 12); window.__WESTCOSE_WORLD__.snowboard.setInput({ tuck: true }); }, run);
    await desktop.waitForTimeout(1600);
    await shot(desktop, 'desktop', `${run}-riding`, 'Mid-run chase camera');
    await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput(null));
  }
  // Lighthouse Line's middle kicker (s 150), approached straight down its run-in, with an ollie at the lip and a spin.
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.spawnOnRun('lighthouse-line', 143 / 274.7, 14));
  await waitFor(desktop, () => window.__WESTCOSE_WORLD__.snowboard.getState().progress * 274.7 > 146);
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput({ jump: true }));
  await waitFor(desktop, () => { const s = window.__WESTCOSE_WORLD__.snowboard.getState(); return s.progress * 274.7 > 149.9 || s.airborne; });
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput({ jump: false, steer: -1 }));
  await desktop.waitForTimeout(250);
  await shot(desktop, 'desktop', 'kicker-air', 'Airborne off the Lighthouse Line kicker, spinning');
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput({ steer: 0, grab: 'indy' }));
  await desktop.waitForTimeout(300);
  await shot(desktop, 'desktop', 'kicker-grab', 'Indy grab in the air');
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput({ steer: 0 }));
  await waitFor(desktop, () => !window.__WESTCOSE_WORLD__.snowboard.getState().airborne, 6000);
  await desktop.waitForTimeout(250);
  await shot(desktop, 'desktop', 'kicker-landing', 'Trick popup and combo after landing');
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput(null));
  await desktop.keyboard.press('Escape');
  await desktop.waitForTimeout(400);
  await shot(desktop, 'desktop', 'paused', 'Run paused: resume, restart, quit');
  await desktop.getByRole('button', { name: 'Resume run' }).first().click();
  // Ride the green run's last stretch to the results.
  await debug(desktop, () => { window.__WESTCOSE_WORLD__.snowboard.spawnOnRun('sunday-cruise', .95, 9); window.__WESTCOSE_WORLD__.snowboard.setInput({ tuck: true }); });
  await waitFor(desktop, () => window.__WESTCOSE_WORLD__.snowboard.getState().phase === 'finished', 40_000);
  await debug(desktop, () => window.__WESTCOSE_WORLD__.snowboard.setInput(null));
  await desktop.getByTestId('results-score').waitFor({ timeout: 20_000 });
  await desktop.waitForTimeout(400);
  await shot(desktop, 'desktop', 'results', 'Results: medal, breakdown, challenges and next steps');
  await desktop.getByTestId('explore-from-here').click();
  await desktop.waitForTimeout(1500);
  await shot(desktop, 'desktop', 'explore-from-finish', 'Walker at the resort finish after "Explore from here"');

  const phone = await open('phone');
  await debug(phone, () => window.__WESTCOSE_WORLD__.spawn('tickets'));
  await phone.waitForTimeout(1200);
  await phone.getByRole('button', { name: 'Explore Lift Tickets' }).click();
  await phone.waitForTimeout(700);
  await shot(phone, 'phone', 'ticket-menu', 'Run menu on a phone');
  await phone.getByTestId('ride-lighthouse-line').click();
  await phone.waitForTimeout(1200);
  await shot(phone, 'phone', 'countdown', 'Countdown with touch controls');
  await debug(phone, () => { window.__WESTCOSE_WORLD__.snowboard.spawnOnRun('timber-chute', .55, 12); window.__WESTCOSE_WORLD__.snowboard.setInput({ tuck: true }); });
  await phone.waitForTimeout(1600);
  await shot(phone, 'phone', 'riding', 'Riding the Timber Chute: HUD, steer pad, Jump and Grab');
  await debug(phone, () => window.__WESTCOSE_WORLD__.snowboard.setInput(null));
} finally {
  await browser.close();
  writeFileSync(path.join(destination, 'capture-state.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`views ${report.views.length}, errors ${report.errors.length}`);
}
