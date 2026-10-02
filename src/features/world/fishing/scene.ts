/** Pier Pressure in the world canvas, as one imperative scene the controller updates each
 * frame: input, the fixed-step tide, the angler and rod, the line, bobber, ripples and
 * splashes, the catches, Gary, the camera and the HUD snapshot. It owns the camera only while a
 * tide is on; Gary idles on his post either way. */
import * as THREE from 'three';
import { MAP_SEA_LEVEL, mapPoint } from '../data/world-map';
import { pierFrameAt } from '../data/pier-layout';
import { isEditableTarget } from '../runtime/input';
import { cameraClearDistance } from '../runtime/planet-collision';
import { clearFishingInput, emptyFishingHud, type FishingPopup, type FishingRequest, type FishingSession } from '../runtime/fishing-session';
import type { WorldRuntimeState } from '../runtime/types';
import { createAnglerModel, createAnglerPose, poseAngler } from './angler';
import { fightBot, type FightBot } from './bots';
import { createCreature, type CreatureModel } from './creatures';
import type { FightState } from './fight';
import { catchName, formatClams, tierName } from './format';
import { createGull, FLOCK_SIZE, poseGull } from './gull';
import { createRng } from './rng';
import type { FishingSfx, Sfx } from './sfx';
import { GARY_FLOCK_LINE, speciesById, TOP_TIER } from './species';
import { ANGLER, castChart, COOLER_ACROSS, DECK, GULL_ACROSS, RAIL_TOP, RAIL_Z, SPOT_ACROSS } from './spot';
import { biteWindow, createTide, endTide, forceBite, stepTide, type Catch, type TideEvent, type TideInput, type TideResult, type TideState } from './tide';
import { FISHING as T } from './tuning';

const FISHING_CODES = new Set(['Space', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyS', 'ArrowDown', 'KeyE', 'KeyW', 'ArrowUp']);
const BASE_FOV = 52, LINE_POINTS = 32, SPRAY = 140, RIPPLES = 12, RING = 30;
const WATER_COLOR = new THREE.Color('#2E4A57'), FOAM = new THREE.Color('#E3F1F0');
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const HINTS: Partial<Record<string, string>> = { ready: 'cast', charging: 'aim', casting: 'wait', waiting: 'wait', nibble: 'nibble', bite: 'strike', fight: 'fight', catch: 'decide' };

/** A water point in screen terms: + aim is screen right, which is west from a seaward camera. */
function water(aim: number, distance: number, out: THREE.Vector3, lift = .01) {
  const chart = castChart(-aim, distance);
  return out.copy(mapPoint(chart.x, chart.z, MAP_SEA_LEVEL + lift));
}

function pointCloud(count: number, size: number, color?: string) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  if (!color) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.PointsMaterial({ color: color ?? '#ffffff', vertexColors: !color, size, sizeAttenuation: true, transparent: true, opacity: .9, depthWrite: false });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;
  return { geometry, material, points };
}

export class PierPressureScene {
  readonly root = new THREE.Group();
  private game = new THREE.Group();
  private creatureRoot = new THREE.Group();
  private angler = createAnglerModel();
  private gull = createGull();
  private bobber: { group: THREE.Group; dispose: () => void };
  private line: { object: THREE.Line; geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial };
  private spray = { ...pointCloud(SPRAY, .12, '#F1F6F4'), velocity: new Float32Array(SPRAY * 3), life: new Float32Array(SPRAY), next: 0 };
  private ripples = { ...pointCloud(RIPPLES * RING, .1), slots: Array.from({ length: RIPPLES }, () => ({ center: new THREE.Vector3(), age: 1, life: 1, size: 1 })), next: 0 };
  private keptSun = createCreature('sun', 'normal');
  private creatures = new Map<string, CreatureModel>();
  /** The spot's frames at the rail on the deck: +X east, +Y up, +Z out to sea. */
  private spot = {
    rail: pierFrameAt(SPOT_ACROSS, RAIL_Z, DECK), stand: pierFrameAt(SPOT_ACROSS, ANGLER.z, DECK),
    post: pierFrameAt(GULL_ACROSS, RAIL_Z, RAIL_TOP), cooler: pierFrameAt(COOLER_ACROSS, RAIL_Z + .45, DECK),
  };

  private sfx: FishingSfx | null = null;
  private onFinish: (result: TideResult) => void = () => {};
  private tide: TideState | null = null;
  private accumulator = 0;
  private events: TideEvent[] = [];
  private tutorial = false; private reeling = false;
  private pose = createAnglerPose();
  private bot: FightBot | null = null; private botFight: FightState | null = null;
  private tip = new THREE.Vector3(); private tipWorld = new THREE.Vector3(); private end = new THREE.Vector3(); private control = new THREE.Vector3();
  private cast = { t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() };
  private bobberAt = new THREE.Vector3(); private dip = 0; private sink = 0;
  private fish = new THREE.Vector3(); private fishLateral = 0;
  private approachState = { tier: -1, t: 0, from: new THREE.Vector3(), next: 0 }; private rippleClock = 0;
  private shown: CreatureModel | null = null;
  private card: { model: CreatureModel; catch: Catch } | null = null;
  private sit = 0; private bow = 0; private gag = 0;
  private gary = { mode: 'perch' as 'perch' | 'eye' | 'steal' | 'away', t: 0, from: new THREE.Vector3(), carried: null as CreatureModel | null, flock: false };
  private heckle = { text: '', until: 0 };
  private sun = { strength: 0, kept: false, light: { x: 0, y: 0, z: 0, strength: 0 } };
  private clock = 0; private reelClick = 0; private popupId = 0; private overTimer = 0; private resultSent = false;
  private cameraReady = false; private ownsCamera = false; private fov = BASE_FOV;
  private camPosition = new THREE.Vector3(); private camTarget = new THREE.Vector3(); private desired = new THREE.Vector3(); private look = new THREE.Vector3();
  private probe = new THREE.Vector3(); private scratch = new THREE.Vector3(); private scratch2 = new THREE.Vector3();
  private matrix = new THREE.Matrix4(); private quaternion = new THREE.Quaternion(); private turn = new THREE.Quaternion(); private scale = new THREE.Vector3();

  constructor(private runtime: WorldRuntimeState) {
    this.root.name = 'pier-pressure';
    const top = new THREE.SphereGeometry(.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bottom = new THREE.SphereGeometry(.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const stick = new THREE.CylinderGeometry(.008, .008, .12, 4).translate(0, .1, 0);
    const red = new THREE.MeshToonMaterial({ color: '#C4553F' }), white = new THREE.MeshToonMaterial({ color: '#F1EFE6' });
    const group = new THREE.Group(); group.name = 'bobber';
    group.add(new THREE.Mesh(top, red), new THREE.Mesh(bottom, white), new THREE.Mesh(stick, red));
    this.bobber = { group, dispose: () => { top.dispose(); bottom.dispose(); stick.dispose(); red.dispose(); white.dispose(); } };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: '#EFE9DA', transparent: true, opacity: .8 });
    const object = new THREE.Line(geometry, material); object.frustumCulled = false;
    this.line = { object, geometry, material };
    this.keptSun.group.visible = false; this.keptSun.group.scale.setScalar(.12);
    this.game.visible = false;
    this.game.add(this.angler.group, this.bobber.group, this.line.object, this.spray.points, this.ripples.points, this.creatureRoot, this.keptSun.group);
    this.root.add(this.gull.group, this.gull.flock, this.game);
  }

  /** The current sound player and the end-of-tide callback. */
  connect(sfx: FishingSfx, onFinish: (result: TideResult) => void) { this.sfx = sfx; this.onFinish = onFinish; }

  /** Keyboard input while a tide is on. Returns the cleanup. */
  listen() {
    const runtime = this.runtime, session = runtime.fishing;
    const down = (event: KeyboardEvent) => {
      if (!session.active || runtime.mode !== 'fishing') return;
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
      if (!FISHING_CODES.has(event.code)) return;
      event.preventDefault();
      session.keys.add(event.code);
      if (!event.repeat) session.pressed.add(event.code);
    };
    const up = (event: KeyboardEvent) => { session.keys.delete(event.code); };
    const clear = () => clearFishingInput(session);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }

  dispose() {
    this.angler.dispose(); this.gull.dispose(); this.bobber.dispose(); this.keptSun.dispose();
    this.line.geometry.dispose(); this.line.material.dispose();
    for (const p of [this.spray, this.ripples]) { p.geometry.dispose(); p.material.dispose(); }
    for (const model of this.creatures.values()) model.dispose();
    this.creatures.clear();
  }

  update(camera: THREE.Camera, delta: number) {
    const runtime = this.runtime, session = runtime.fishing;
    const dt = Math.min(delta, .1), reduced = runtime.reducedMotion;
    this.clock += dt;
    const request = session.request;
    if (request) { session.request = null; this.handle(request, session); }
    const tide = this.tide;
    if (!session.active || !tide) {
      this.game.visible = false;
      if (this.ownsCamera) this.releaseCamera(camera);
      session.sunLight = null;
      this.perchGull(dt, reduced, null);
      return;
    }
    this.game.visible = true;
    if (runtime.mode === 'fishing') {
      this.accumulator = Math.min(this.accumulator + dt, T.step * T.maxSubsteps);
      let first = true;
      while (this.accumulator >= T.step) {
        this.accumulator -= T.step;
        const input = this.readInput(session, tide, first);
        if (first) { session.pressed.clear(); const t = session.touch; t.primaryPressed = false; t.bow = false; t.keep = false; t.bait = false; first = false; }
        stepTide(tide, input, T.step, this.events);
      }
    }
    for (const event of this.events) this.present(event, session, tide);
    this.events.length = 0;
    if (tide.phase === 'over' && !this.resultSent && tide.result) {
      this.overTimer += dt;
      if (this.overTimer >= 1.1) { this.resultSent = true; this.onFinish(tide.result); }
    }
    this.poseAngler(tide, dt, reduced);
    this.placeLine(tide, dt, reduced);
    this.updateParticles(dt, reduced);
    this.perchGull(dt, reduced, tide);
    this.updateSun(session, tide, dt, reduced);
    this.updateCamera(camera, tide, dt, reduced);
    this.snapshot(session, tide, camera);
  }

  private handle(request: FishingRequest, session: FishingSession) {
    if (request.kind === 'start') { this.begin(session, request); return; }
    if (!this.tide) return;
    if (request.kind === 'end') endTide(this.tide, this.events);
    else forceBite(this.tide, request.species, request.variant, this.events);
  }

  private begin(session: FishingSession, request: Extract<FishingRequest, { kind: 'start' }>) {
    this.tide = createTide({ seed: request.seed, upgrades: request.upgrades, tutorial: request.tutorial, daily: request.daily });
    this.tutorial = request.tutorial; this.accumulator = 0; this.events.length = 0; this.overTimer = 0; this.resultSent = false;
    this.cast.t = -1; this.dip = 0; this.sink = 0; this.sit = 0; this.bow = 0; this.gag = 0; this.cameraReady = false;
    this.bot = null; this.botFight = null; this.approachState.tier = -1; this.heckle.until = 0;
    this.sun.strength = 0; this.sun.kept = false;
    this.hideCard();
    if (this.shown) { this.shown.group.visible = false; this.shown = null; }
    this.gary.mode = 'perch'; this.gary.carried = null;
    session.result = null; session.popups.length = 0; session.hud = emptyFishingHud(); session.sunLight = null;
    clearFishingInput(session);
    session.debug.seed = request.seed; session.debug.landed = 0; session.debug.lost = 0; session.debug.last = null;
    this.spray.life.fill(0);
    for (const slot of this.ripples.slots) slot.age = slot.life;
  }

  private readInput(session: FishingSession, tide: TideState, edges: boolean): TideInput {
    const k = session.keys, p = session.pressed, touch = session.touch;
    const right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const input: TideInput = {
      primary: k.has('Space') || touch.primary,
      primaryPressed: edges && (p.has('Space') || touch.primaryPressed),
      steer: Math.max(-1, Math.min(1, right + (touch.active ? touch.x : 0))),
      bowPressed: edges && (p.has('KeyS') || p.has('ArrowDown') || touch.bow),
      keepPressed: edges && (p.has('KeyE') || p.has('ArrowLeft') || touch.keep),
      baitPressed: edges && (p.has('Space') || p.has('ArrowRight') || touch.bait),
    };
    // Development: a bot plays the fight itself.
    if (session.autoFight && tide.phase === 'fight' && tide.fight) {
      if (this.botFight !== tide.fight) { this.botFight = tide.fight; this.bot = fightBot(session.autoFight, createRng(tide.clock * 1000 | 0)); }
      const f = this.bot!.input(tide.fight, T.step);
      input.primary = f.reel; input.steer = f.steer; input.bowPressed = f.bow;
    }
    const merged = session.testInput ? { ...input, ...session.testInput } : input;
    this.reeling = tide.phase === 'fight' && merged.primary;
    return merged;
  }

  private creature(id: string, variant: Catch['variant']) {
    const key = `${id}:${variant}`;
    let model = this.creatures.get(key);
    if (!model) { model = createCreature(id, variant); model.group.visible = false; this.creatures.set(key, model); this.creatureRoot.add(model.group); }
    return model;
  }
  private popup(session: FishingSession, kind: FishingPopup['kind'], text: string, detail?: string) {
    session.popups.push({ id: ++this.popupId, kind, text, detail });
    if (session.popups.length > 12) session.popups.splice(0, session.popups.length - 12);
  }
  private play(name: Sfx, strength?: number) { this.sfx?.play(name, strength); }
  private buzz(ms: number) {
    try { if (window.matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(ms); } catch { /* Optional haptics. */ }
  }
  private hideCard() { if (this.card) { this.card.model.group.visible = false; this.card = null; } }

  /** Turn one tide event into popups, sound, splashes and poses. */
  private present(event: TideEvent, session: FishingSession, tide: TideState) {
    switch (event.type) {
      case 'cast':
        this.cast.t = 0; this.cast.from.copy(this.tipWorld); water(event.aim, event.distance, this.cast.to);
        this.play('cast');
        if (event.bullseye) this.popup(session, 'good', 'BULLSEYE', event.zone === 'channel' ? 'The deep channel: rarer fish' : undefined);
        break;
      case 'gag': this.gag = 1.4; this.popup(session, 'info', 'WHOOPS', event.line); this.play('gag'); break;
      case 'splashdown': this.bobberAt.copy(this.cast.to); this.ripple(this.bobberAt, .5, 1); this.splash(this.bobberAt, 8, 1.2); this.play('plop'); break;
      case 'approach': {
        const a = this.approachState, rng = createRng(tide.stats.casts * 7919 + 13);
        a.tier = event.tier; a.t = 0; a.next = 0;
        const angle = rng() * Math.PI * 2, offset = 2.2 + rng() * 1.5;
        water(tide.aim + Math.cos(angle) * .12, tide.distance + Math.sin(angle) * offset, a.from);
        break;
      }
      case 'nibble': this.dip = 1; this.ripple(this.bobberAt, .25, .6); this.play('tick'); this.buzz(8); break;
      case 'chomp': this.sink = 1; this.approachState.tier = -1; this.ripple(this.bobberAt, .6, 1.4); this.splash(this.bobberAt, 14, 2); this.play('chomp'); this.buzz(35); this.popup(session, 'big', 'CHOMP!'); break;
      case 'reeled': this.popup(session, 'info', 'REELED IN', 'Nothing was biting yet. The bait stays on.'); break;
      case 'spooked': this.approachState.tier = -1; this.popup(session, 'bad', 'SPOOKED', 'Too early. Wait for the CHOMP; the bait stays on.'); break;
      case 'stolen': this.sink = 0; this.popup(session, 'bad', event.live ? 'BAIT STOLEN' : 'WORM STOLEN', event.live ? 'The chain ends here.' : 'Strike as soon as it CHOMPS.'); break;
      case 'hooked': {
        const species = speciesById(event.species);
        this.popup(session, event.perfect ? 'good' : 'info', event.perfect ? 'PERFECT HOOKSET' : 'HOOKED', species.tier < 0 ? 'Something is on…' : species.tier === TOP_TIER ? '???' : `${species.name} · ${tierName(species.tier)}`);
        this.fishLateral = 0;
        break;
      }
      case 'fight': {
        const e = event.event;
        if (e.type === 'heckle') { this.heckle.text = e.line; this.heckle.until = this.clock + 2.6; }
        else if (e.type === 'jump') { this.splash(this.fish, 16, 2.4); this.ripple(this.fish, .7, 1.4); this.play('splash', .8); }
        else if (e.type === 'bowed') { this.popup(session, 'good', e.perfect ? 'BOWED TO THE KING' : 'BOWED', e.perfect ? 'Perfect timing' : undefined); this.play('bow'); this.bow = .45; }
        else if (e.type === 'whiff') { this.popup(session, 'bad', 'BAD BOW', 'Bow right as it peaks.'); this.bow = .45; }
        else if (e.type === 'splash') { this.splash(this.fish, e.missed ? 26 : 14, 2.6); this.ripple(this.fish, .9, 1.6); this.play('splash', 1); if (e.missed) this.popup(session, 'bad', 'SPLASH!', 'Press S as it peaks to bow.'); }
        else if (e.type === 'creak') this.play('creak', .8);
        else if (e.type === 'ink') this.popup(session, 'bad', 'INKED', 'You can’t see the gauge. Feel it out.');
        else if (e.type === 'move' && (e.move === 'run' || e.move === 'bolt' || e.move === 'roll')) this.ripple(this.fish, .5, 1);
        break;
      }
      case 'ambush': {
        const predator = speciesById(event.species);
        this.popup(session, 'big', 'SOMETHING BIGGER ATE IT!', predator.tier === TOP_TIER ? '???' : `A ${predator.name} took your ${speciesById(event.swallowed).name}`);
        this.splash(this.fish, 30, 3); this.ripple(this.fish, 1, 2.2); this.play('chomp'); this.buzz(40);
        break;
      }
      case 'landed': {
        const c = event.catch;
        session.debug.landed++; session.debug.last = c.species;
        const model = this.creature(c.species, c.variant);
        this.card = { model, catch: c };
        if (this.shown && this.shown !== model) this.shown.group.visible = false;
        this.shown = null;
        this.play(c.junk ? 'plop' : c.tier >= 3 || c.variant !== 'normal' ? 'fanfare' : 'splash');
        if (c.species === 'sun') this.popup(session, 'big', 'YOU CAUGHT THE SUN', 'The pier has never been this bright.');
        if (!c.junk && tide.chain >= 2) this.popup(session, 'good', `CHAIN ×${tide.chain}`, `${tierName(c.tier)} tier`);
        break;
      }
      case 'lost': {
        session.debug.lost++;
        const species = speciesById(event.species);
        const title = event.how === 'spit' ? 'PTOO!' : event.how === 'spool' ? 'SPOOLED!' : 'SNAP!';
        const near = event.distance < 2.5 ? `It got away ${event.distance.toFixed(1)} m from the rail.` : event.how === 'spit' ? 'Slack line: keep a little tension on.' : event.how === 'spool' ? 'It took all your line.' : 'Let go when it runs or dives.';
        this.popup(session, 'bad', title, near);
        this.heckle.text = species.lines.escape; this.heckle.until = this.clock + 2.4;
        if (event.how !== 'spit') this.sit = 1.3;
        this.play(event.how === 'spit' ? 'spit' : 'snap'); this.buzz(event.how === 'spit' ? 15 : 60);
        this.splash(this.fish, 12, 1.6);
        if (this.shown) { this.shown.group.visible = false; this.shown = null; }
        break;
      }
      case 'kept':
        this.popup(session, 'good', `+${formatClams(event.catch.clams)} CLAMS`, `${catchName(event.catch.species, event.catch.variant)} on ice`);
        this.play('cash');
        if (event.catch.species === 'sun') this.sun.kept = true;
        this.hideCard();
        break;
      case 'baited':
        this.popup(session, 'info', 'LIVE BAIT', `Something from the ${tierName(event.catch.tier + 1)} tier will want this.`);
        this.heckle.text = event.line; this.heckle.until = this.clock + 2.6;
        this.hideCard();
        break;
      case 'tossed': this.popup(session, 'info', 'TOSSED BACK', 'Back where it came from.'); this.splash(this.bobberAt, 8, 1.4); this.hideCard(); break;
      case 'gary': {
        const g = this.gary;
        g.mode = 'steal'; g.t = 0; g.flock = event.flock; g.carried = this.card?.model ?? null;
        this.card = null;
        this.popup(session, 'gary', event.flock ? 'GARY CALLED HIS FRIENDS' : 'GARY TOOK IT', event.flock ? GARY_FLOCK_LINE : 'Decide faster next time.');
        this.play('squawk');
        break;
      }
      case 'over': session.result = event.result; break;
      default: break;
    }
  }

  /** The angler's rod angle, bend and stance from the tide and the fight. */
  private poseAngler(tide: TideState, dt: number, reduced: boolean) {
    const p = this.pose, f = tide.fight;
    const damp = (current: number, target: number, rate: number) => reduced ? target : current + (target - current) * (1 - Math.exp(-rate * dt));
    this.sit = Math.max(0, this.sit - dt); this.bow = Math.max(0, this.bow - dt); this.gag = Math.max(0, this.gag - dt);
    let pitch = .55, yaw = -tide.aim, bend = 0, lean = 0, cheer = 0;
    if (tide.phase === 'charging') pitch = .55 + 1.15 * tide.charge;
    else if (tide.phase === 'casting') pitch = .3;
    else if (tide.phase === 'waiting' || tide.phase === 'nibble') { pitch = .42; bend = .05 + .25 * this.dip; }
    else if (tide.phase === 'bite') { pitch = .4; bend = .45; }
    else if (tide.phase === 'fight' && f) {
      const tension = f.tension / f.gear.snapAt;
      pitch = .75 + .2 * tension - (this.bow > 0 ? .55 : 0);
      yaw = -(tide.aim + this.fishLateral * .45);
      bend = Math.min(1, tension * 1.05);
      lean = Math.min(1, tension * .9);
    } else if (tide.phase === 'catch' && tide.catch) {
      const big = speciesById(tide.catch.species).look.length > 1.5;
      pitch = big ? 1.05 : .7; bend = big ? .9 : Math.min(.8, .25 + .12 * Math.max(0, tide.catch.tier)); cheer = big ? .3 : 1;
    }
    if (this.gag > 0) { pitch = 1.9 - this.gag * .3; bend = .3; }
    p.pitch = damp(p.pitch, pitch, tide.phase === 'casting' ? 18 : 7);
    p.yaw = damp(p.yaw, yaw, 6);
    p.bend = damp(p.bend, bend, 10);
    p.lean = damp(p.lean, lean, 6);
    p.cheer = damp(p.cheer, cheer, 5);
    p.sit = damp(p.sit, this.sit > 0 ? 1 : 0, this.sit > 0 ? 14 : 3);
    const group = this.angler.group;
    group.position.copy(this.spot.stand.position);
    group.quaternion.copy(this.spot.stand.quaternion);
    poseAngler(this.angler, p, this.tip);
    group.updateMatrixWorld(true);
    this.tipWorld.copy(this.tip).applyMatrix4(group.matrixWorld);
  }

  /** The bobber, the fish in the water, the line from the rod tip, and any catch on show. */
  private placeLine(tide: TideState, dt: number, reduced: boolean) {
    const up = this.scratch.copy(this.spot.rail.up), f = tide.fight, phase = tide.phase, bobber = this.bobber.group;
    this.dip = Math.max(0, this.dip - dt * 5);
    let end: THREE.Vector3 | null = null, slack = .2;
    bobber.visible = phase === 'casting' || phase === 'waiting' || phase === 'nibble' || phase === 'bite';
    if (phase === 'casting' && this.cast.t >= 0) {
      this.cast.t = Math.min(1, this.cast.t + dt / T.cast.flight);
      const t = this.cast.t;
      this.bobberAt.lerpVectors(this.cast.from, this.cast.to, t).addScaledVector(this.probe.copy(this.cast.to).normalize(), Math.sin(Math.PI * t) * (2.2 + tide.distance * .12));
      end = this.bobberAt; slack = .05;
    } else if (phase === 'waiting' || phase === 'nibble' || phase === 'bite') {
      water(tide.aim, tide.distance, this.bobberAt);
      const bob = reduced ? 0 : Math.sin(this.clock * 2.4) * .02;
      this.sink = phase === 'bite' ? Math.min(1, this.sink + dt * 6) : Math.max(0, this.sink - dt * 3);
      this.bobberAt.addScaledVector(this.probe.copy(this.bobberAt).normalize(), bob - .06 * this.dip - .22 * this.sink);
      end = this.bobberAt; slack = .35;
      this.approach(tide, dt);
    }
    if (bobber.visible) { bobber.position.copy(this.bobberAt); bobber.quaternion.setFromUnitVectors(Y, this.probe.copy(this.bobberAt).normalize()); }

    // The fish: across the fan with its bolts, in and out of the water, its head up to taunt.
    let fishModel: CreatureModel | null = null;
    if (phase === 'fight' && f) {
      this.fishLateral += (f.lateral - this.fishLateral) * (1 - Math.exp(-6 * dt));
      water(tide.aim + this.fishLateral * .45, Math.max(.3, f.distance), this.fish);
      const length = f.species.look.length, airborne = f.depth < -.02, taunting = f.move === 'taunt' && !airborne;
      end = this.fish; slack = Math.max(0, .25 - f.tension * .3);
      this.rippleClock -= dt;
      if (this.rippleClock <= 0) { this.rippleClock = f.move === 'run' || f.move === 'bolt' || f.move === 'roll' ? .22 : .5; this.ripple(this.fish, .25 + .12 * f.tier, .8 + .1 * f.tier); }
      if (airborne || taunting) {
        fishModel = this.creature(f.species.id, 'normal');
        const height = airborne ? -f.depth * (1 + .25 * length) : 0;
        const normal = this.scratch2.copy(this.fish).normalize();
        fishModel.group.position.copy(this.fish).addScaledVector(normal, height + (taunting ? length * .15 : length * .1));
        // Head up out of the water, tipping toward the pier as it falls back.
        const toward = this.probe.copy(this.tipWorld).sub(this.fish).projectOnPlane(normal).normalize();
        const heading = toward.multiplyScalar(airborne ? .6 : .3).addScaledVector(normal, airborne ? .8 : .95).normalize();
        fishModel.group.quaternion.setFromUnitVectors(Z, heading);
        fishModel.group.scale.setScalar(1);
        if (airborne) end = fishModel.group.position;
      }
    }
    if (this.shown && this.shown !== fishModel) this.shown.group.visible = false;
    if (fishModel) { fishModel.group.visible = true; this.shown = fishModel; } else this.shown = null;

    // The catch on the card hangs from the line: small ones in front of the angler, big ones out
    // over the water from a rod bent into a U.
    const card = this.card;
    if (card && phase === 'catch') {
      const model = card.model, length = model.length, big = length > 1.5, sun = card.catch.species === 'sun';
      if (big) {
        const lift = .3 + length * .5 + (sun ? 1.5 : 0) + (reduced ? 0 : Math.sin(this.clock * 1.6) * .08 * length);
        model.group.position.copy(this.spot.rail.position).addScaledVector(this.spot.rail.south, 1.2 + length * .45).addScaledVector(this.spot.rail.up, lift);
      } else model.group.position.copy(this.tipWorld).addScaledVector(up, -.25 - length * .5).addScaledVector(this.spot.rail.south, -.1);
      // Head up, a gentle swing; the Sun just beams at the angler.
      const swing = reduced ? 0 : Math.sin(this.clock * 2.1) * .12;
      if (sun) model.group.quaternion.setFromUnitVectors(Z, this.probe.copy(this.spot.rail.south).negate());
      else model.group.quaternion.setFromUnitVectors(Z, up).multiply(this.turn.setFromAxisAngle(Z, swing));
      model.group.visible = true;
      end = this.end.copy(model.group.position).addScaledVector(up, sun ? 0 : length * .5);
      slack = 0;
      this.twinkle(model, dt);
    }

    // The line: rod tip to wherever it ends, sagging when slack.
    const positions = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const from = this.tipWorld, to = end ?? this.end.copy(from).addScaledVector(up, -.75);
    const length = from.distanceTo(to);
    this.control.lerpVectors(from, to, .5).addScaledVector(up, -slack * length * .35);
    for (let i = 0; i < LINE_POINTS; i++) {
      const t = i / (LINE_POINTS - 1), a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      positions.setXYZ(i, from.x * a + this.control.x * b + to.x * c, from.y * a + this.control.y * b + to.y * c, from.z * a + this.control.z * b + to.z * c);
    }
    positions.needsUpdate = true;
  }

  private twinkle(model: CreatureModel, dt: number) {
    const sparkle = model.group.getObjectByName('sparkle') as THREE.Points | undefined;
    if (sparkle) { sparkle.rotation.z += dt * .8; (sparkle.material as THREE.PointsMaterial).opacity = .55 + .4 * Math.abs(Math.sin(this.clock * 4)); }
  }

  /** Pale rings drift toward the bobber while a fish comes to look: bigger fish, bigger rings. */
  private approach(tide: TideState, dt: number) {
    const a = this.approachState;
    if (a.tier < 0 || tide.phase === 'bite') return;
    a.t += dt; a.next -= dt;
    if (a.next > 0) return;
    a.next = .4;
    const progress = Math.min(1, a.t / Math.max(.5, tide.wait));
    this.ripple(this.probe.lerpVectors(a.from, this.bobberAt, progress), .2 + .1 * Math.max(0, a.tier), .7 + .15 * Math.max(0, a.tier));
  }

  private ripple(center: THREE.Vector3, size: number, life: number) {
    const r = this.ripples, slot = r.slots[r.next];
    r.next = (r.next + 1) % RIPPLES;
    slot.center.copy(center); slot.age = 0; slot.life = life; slot.size = size;
  }
  private splash(center: THREE.Vector3, count: number, lift: number) {
    if (this.runtime.reducedMotion) return;
    const s = this.spray, position = s.geometry.getAttribute('position') as THREE.BufferAttribute, up = this.scratch2.copy(center).normalize();
    for (let n = 0; n < count; n++) {
      const i = s.next; s.next = (s.next + 1) % SPRAY;
      position.setXYZ(i, center.x, center.y, center.z);
      const side = this.probe.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).projectOnPlane(up).multiplyScalar(2.2);
      const rise = lift * (.6 + Math.random() * .6);
      s.velocity[i * 3] = up.x * rise + side.x; s.velocity[i * 3 + 1] = up.y * rise + side.y; s.velocity[i * 3 + 2] = up.z * rise + side.z;
      s.life[i] = .5 + Math.random() * .4;
    }
  }
  private updateParticles(dt: number, reduced: boolean) {
    const s = this.spray, position = s.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SPRAY; i++) {
      if (s.life[i] <= 0) { position.setXYZ(i, 0, 0, 0); continue; }
      s.life[i] -= dt;
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i), r = Math.hypot(x, y, z) || 1;
      s.velocity[i * 3] -= x / r * 9 * dt; s.velocity[i * 3 + 1] -= y / r * 9 * dt; s.velocity[i * 3 + 2] -= z / r * 9 * dt;
      position.setXYZ(i, x + s.velocity[i * 3] * dt, y + s.velocity[i * 3 + 1] * dt, z + s.velocity[i * 3 + 2] * dt);
    }
    position.needsUpdate = true;
    const r = this.ripples, rp = r.geometry.getAttribute('position') as THREE.BufferAttribute, rc = r.geometry.getAttribute('color') as THREE.BufferAttribute;
    const color = new THREE.Color(), tangent = this.probe, bitangent = this.scratch2, up = new THREE.Vector3();
    r.slots.forEach((slot, k) => {
      slot.age += dt;
      const t = slot.age / slot.life;
      if (t >= 1) { for (let j = 0; j < RING; j++) rp.setXYZ(k * RING + j, 0, 0, 0); return; }
      up.copy(slot.center).normalize();
      tangent.crossVectors(up, Math.abs(up.y) < .9 ? Y : Z).normalize(); bitangent.crossVectors(up, tangent);
      const radius = slot.size * (.25 + (reduced ? .6 : 1.4) * Math.sqrt(t));
      color.copy(FOAM).lerp(WATER_COLOR, t * t);
      for (let j = 0; j < RING; j++) {
        const a = j / RING * Math.PI * 2, cos = Math.cos(a) * radius, sin = Math.sin(a) * radius;
        rp.setXYZ(k * RING + j, slot.center.x + tangent.x * cos + bitangent.x * sin, slot.center.y + tangent.y * cos + bitangent.y * sin, slot.center.z + tangent.z * cos + bitangent.z * sin);
        rc.setXYZ(k * RING + j, color.r, color.g, color.b);
      }
    });
    rp.needsUpdate = true; rc.needsUpdate = true;
  }

  /** Gary perches on his post watching the bobber, sidles closer as his timer runs out, steals
   * the catch, flies off with it, and is back on the post a few seconds later. */
  private perchGull(dt: number, reduced: boolean, tide: TideState | null) {
    const g = this.gary, group = this.gull.group, post = this.spot.post;
    g.t += dt;
    let flap = 0, look = reduced ? 0 : Math.sin(this.clock * .7) * .6;
    const card = this.card, timer = tide?.phase === 'catch' && tide.catch && Number.isFinite(tide.gary) ? tide.gary : Infinity;
    if (g.mode === 'perch' && timer < 3 && card) { g.mode = 'eye'; g.t = 0; }
    if (g.mode === 'eye' && (!card || tide?.phase !== 'catch')) { g.mode = 'perch'; g.t = 0; }
    if (g.mode === 'perch' || g.mode === 'eye') {
      // Sidling along the rail toward the angler while he eyes the catch.
      const sidle = g.mode === 'eye' ? Math.min(1, g.t / 2.5) : 0;
      group.position.copy(post.position).addScaledVector(post.east, -sidle * .55).addScaledVector(post.up, reduced ? 0 : Math.abs(Math.sin(g.t * 9)) * .04 * sidle);
      group.quaternion.copy(post.quaternion).multiply(this.turn.setFromAxisAngle(Y, Math.PI + (g.mode === 'eye' ? .9 : .3)));
      if (g.mode === 'eye') look = .4;
    } else if (g.mode === 'steal') {
      // Swoop to the catch, then carry it up and out to sea; the flock helps with big ones.
      const t = Math.min(1, g.t / (reduced ? .01 : .55));
      group.position.lerpVectors(g.from.copy(post.position), g.carried ? g.carried.group.position : post.position, t);
      flap = 1;
      if (g.t >= .55 || reduced) { g.mode = 'away'; g.t = 0; }
    } else {
      const carried = g.carried, out = this.probe.copy(this.spot.rail.south).multiplyScalar(4 * dt).addScaledVector(this.spot.rail.up, 2.2 * dt);
      flap = 1;
      group.position.add(out);
      if (carried) { carried.group.position.add(out); carried.group.visible = g.t < 2.6 && !reduced; }
      if (g.t > 3.2) { if (carried) carried.group.visible = false; g.carried = null; g.mode = 'perch'; g.t = 0; }
    }
    poseGull(this.gull, flap, this.clock, look);
    this.updateFlock(reduced);
  }
  private updateFlock(reduced: boolean) {
    const g = this.gary, flock = this.gull.flock;
    if (!g.flock || g.mode !== 'away' || !g.carried || reduced) { flock.count = 0; return; }
    const center = g.carried.group.position, rail = this.spot.rail, size = g.carried.length;
    flock.count = FLOCK_SIZE;
    for (let i = 0; i < FLOCK_SIZE; i++) {
      const a = i / FLOCK_SIZE * Math.PI * 2 + this.clock * 2, r = 1 + size * .4;
      this.probe.copy(center).addScaledVector(rail.east, Math.cos(a) * r).addScaledVector(rail.south, Math.sin(a) * r * .6).addScaledVector(rail.up, size * .4 + Math.sin(a * 3 + this.clock * 9) * .2);
      this.quaternion.copy(rail.quaternion).multiply(this.turn.setFromAxisAngle(Y, a + Math.PI / 2));
      flock.setMatrixAt(i, this.matrix.compose(this.probe, this.quaternion, this.scale.setScalar(1.1)));
    }
    flock.instanceMatrix.needsUpdate = true;
  }

  /** The caught Sun lights the pier through one of the existing lantern lights. */
  private updateSun(session: FishingSession, tide: TideState, dt: number, reduced: boolean) {
    const sun = this.sun, showing = this.card?.catch.species === 'sun' && tide.phase === 'catch';
    const on = (showing || sun.kept) && tide.phase !== 'over';
    sun.strength = reduced ? Number(on) : sun.strength + (Number(on) - sun.strength) * (1 - Math.exp(-(on ? 2.5 : 1.5) * dt));
    this.keptSun.group.visible = sun.kept && !showing && sun.strength >= .01;
    if (sun.strength < .01) { session.sunLight = null; return; }
    const at = showing && this.card ? this.card.model.group.position : this.probe.copy(this.spot.cooler.position).addScaledVector(this.spot.cooler.up, 2.3);
    sun.light.x = at.x; sun.light.y = at.y; sun.light.z = at.z; sun.light.strength = sun.strength;
    session.sunLight = sun.light;
    // A kept Sun shrinks to sit glowing above the cooler until the tide ends.
    if (this.keptSun.group.visible) { this.keptSun.group.position.copy(at); this.keptSun.group.quaternion.copy(this.spot.cooler.quaternion); }
  }

  private updateCamera(camera: THREE.Camera, tide: TideState, dt: number, reduced: boolean) {
    const C = T.camera, rail = this.spot.rail, f = tide.fight;
    this.ownsCamera = true;
    const portrait = camera instanceof THREE.PerspectiveCamera && camera.aspect < 1 ? Math.min(1, (1 - camera.aspect) * 2) : 0;
    const local = (east: number, up: number, south: number, out: THREE.Vector3) => out.copy(rail.position).addScaledVector(rail.east, east).addScaledVector(rail.up, up).addScaledVector(rail.south, south);
    const card = this.card;
    if (tide.phase === 'catch' && card) {
      // The trophy shot from over the water, looking back between the catch and the angler,
      // pulled back as far as the catch is big.
      const length = card.model.length, big = length > 1.5;
      this.look.copy(this.spot.stand.position).addScaledVector(rail.up, 1.3).lerp(card.model.group.position, big ? .7 : .55);
      this.desired.copy(this.look).addScaledVector(rail.south, (big ? 3 : 2.8) + length * (big ? 1.4 : 1.6))
        .addScaledVector(rail.east, (big ? 1 : .9) + length * .35).addScaledVector(rail.up, (big ? 1 : .8) + length * .35);
      // The card covers the right of the screen; shift the subject left (east, seen from the sea).
      this.look.addScaledVector(rail.east, (portrait ? 0 : .9) + length * .45);
    } else if (tide.phase === 'over') {
      local(6.5, 6, 9, this.desired);
      local(-1, 1, -4, this.look);
    } else if (tide.phase === 'fight' && f) {
      local(-.9 * (1 + portrait), C.fightHeight * (1 + .3 * portrait), -C.fightBack * (1 + .4 * portrait), this.desired);
      this.look.copy(this.fish).lerp(this.tipWorld, .25);
    } else {
      local(-.9 * (1 + portrait), C.height * (1 + .3 * portrait), -C.back * (1 + .4 * portrait), this.desired);
      water(tide.aim, C.lookAhead, this.look).addScaledVector(rail.up, 1.2);
    }
    // Keep clear of the shack and the pier's solid furniture.
    this.probe.copy(this.spot.stand.position).addScaledVector(rail.up, 1.4);
    const offset = this.scratch2.copy(this.desired).sub(this.probe), length = offset.length();
    const clear = cameraClearDistance(this.probe, offset.divideScalar(length), length, null);
    if (clear < length) this.desired.copy(this.probe).addScaledVector(offset, Math.max(1, clear));
    if (!this.cameraReady) { this.camPosition.copy(this.desired); this.camTarget.copy(this.look); this.cameraReady = true; }
    const k = reduced ? 1 : 1 - Math.exp(-C.damping * dt);
    this.camPosition.lerp(this.desired, k); this.camTarget.lerp(this.look, k);
    camera.position.copy(this.camPosition);
    if (!reduced && f && tide.phase === 'fight') {
      const shake = Math.max(0, f.tension / f.gear.snapAt - .8) * C.shake;
      camera.position.addScaledVector(rail.east, (Math.random() - .5) * shake).addScaledVector(rail.up, (Math.random() - .5) * shake);
    }
    camera.up.copy(rail.up);
    camera.lookAt(this.camTarget);
    const review = this.runtime.debugCamera;
    if (review) {
      camera.position.set(review.position.x, review.position.y, review.position.z);
      camera.up.set(review.up.x, review.up.y, review.up.z);
      camera.lookAt(review.target.x, review.target.y, review.target.z);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = BASE_FOV + 12 * portrait;
      this.fov += (fov - this.fov) * (1 - Math.exp(-3 * dt));
      if (Math.abs(camera.fov - this.fov) > .01 || camera.near !== .08) { camera.fov = this.fov; camera.near = .08; camera.updateProjectionMatrix(); }
    }
  }
  private releaseCamera(camera: THREE.Camera) {
    this.ownsCamera = false; this.cameraReady = false; this.fov = BASE_FOV;
    if (camera instanceof THREE.PerspectiveCamera && (camera.fov !== BASE_FOV || camera.near !== .08)) { camera.fov = BASE_FOV; camera.near = .08; camera.updateProjectionMatrix(); }
  }

  /** Write the HUD's numbers, the heckle bubble's screen anchor, and the reel ratchet. */
  private snapshot(session: FishingSession, tide: TideState, camera: THREE.Camera) {
    const hud = session.hud, f = tide.fight;
    hud.phase = tide.phase; hud.worms = tide.worms; hud.cooler = tide.cooler.length;
    hud.clams = tide.cooler.reduce((sum, c) => sum + c.clams, 0); hud.chain = tide.chain;
    hud.live = tide.live ? { species: tide.live.species, tier: tide.live.tier } : null;
    hud.charge = tide.charge; hud.aim = tide.aim / T.cast.aim;
    if (f) {
      hud.tension = f.tension / f.gear.snapAt; hud.stamina = f.stamina; hud.distance = f.distance;
      hud.fish = f.species.id; hud.fishTier = f.tier; hud.move = f.move; hud.ink = f.ink;
      hud.tell = f.tell ? { move: f.tell.move, dir: f.tell.shown } : null;
      hud.glare = f.species.gimmick === 'glare' ? .55 + f.heat : 0;
    } else { hud.tension = 0; hud.stamina = 0; hud.fish = null; hud.fishTier = -1; hud.tell = null; hud.move = null; hud.ink = 0; hud.glare = 0; }
    hud.bite = tide.phase === 'bite' && tide.pending ? Math.min(1, tide.time / biteWindow(tide.pending)) : 0;
    hud.catch = tide.phase === 'catch' ? tide.catch : null;
    hud.gary = tide.gary; hud.decide = tide.phase === 'catch' && tide.time >= T.decisionLock;
    hud.hint = this.tutorial ? HINTS[tide.phase] ?? '' : '';
    if (this.tutorial && tide.cooler.length + tide.stats.baited >= 1 && tide.phase !== 'catch') this.tutorial = false;
    // The heckle bubble floats over the fish (or the catch) while it is on screen.
    const bubble = hud.bubble;
    bubble.visible = false;
    if (this.clock < this.heckle.until) {
      const anchor = this.probe.copy(this.card?.model.group.position ?? (f ? this.fish : this.bobberAt)).addScaledVector(this.spot.rail.up, 1.1).project(camera);
      if (anchor.z < 1 && Math.abs(anchor.x) < 1.1 && Math.abs(anchor.y) < 1.1) {
        bubble.visible = true; bubble.text = this.heckle.text;
        bubble.x = Math.min(.85, Math.max(.15, (anchor.x + 1) / 2)); bubble.y = Math.min(.8, Math.max(.12, (1 - anchor.y) / 2));
      }
    }
    // The reel's ratchet clicks while reeling in a fight.
    if (f && this.reeling) {
      this.reelClick -= .016;
      if (this.reelClick <= 0) { this.reelClick = .07; this.play('reel', .6 + .4 * hud.tension); }
    }
    session.debug.phase = tide.phase; session.debug.time = tide.clock;
  }
}
