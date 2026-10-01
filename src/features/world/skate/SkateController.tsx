'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { mapCoordinates, mapDirection, mapFrame } from '../data/world-map';
import { areaAt } from '../data/planet';
import { HOTSPOTS } from '../data/hotspots';
import { parkDirection, parkTangents, SKATE_GAME_START, SKATE_GAME_TIME, SKATE_LETTER_BODY, SKATE_LETTER_REACH, SKATE_LETTERS, skateLetterPoint } from '../data/skatepark-layout';
import { activeInteriorAt, cameraClearDistance } from '../runtime/planet-collision';
import { isEditableTarget } from '../runtime/input';
import { PLAYER_CENTER_HEIGHT, type WorldRuntimeState } from '../runtime/types';
import { clearSkateInput, emptySkateHud, type SkateGameResult, type SkateLetterId } from '../runtime/skate-session';
import { groundRadius, placeSkater, SkaterState, stepSkater, type AirSummary, type SkateEvent, type SurfaceSample } from './physics';
import { WORLD_SKATE } from './surface';
import { SkateInputReader, SKATE_CODES } from './input';
import { createSkaterModel, createSkaterPose, placeSkaterShadow, poseSkater } from './skater';
import { FLIPS, GRAB_PER_SECOND, GRABS, GRIND_PER_SECOND, GRINDS, MANUAL_PER_SECOND, MANUALS, SkateScore, spinName } from './tricks';
import { SKATE as T } from './tuning';

const BASE_FOV = 52;
const COUNTDOWN = 3;
const GAME_HOTSPOT = HOTSPOTS.find(place => place.id === 'skatepark')!;
const LETTER_IDS: readonly SkateLetterId[] = ['S', 'K', 'A', 'T', 'E'];

interface Props {
  runtime: WorldRuntimeState;
  /** A game of S.K.A.T.E. ended (all letters, or the clock ran out). */
  onGameFinished: (result: SkateGameResult) => void;
  /** The rider rolled through a doorway: boards come off indoors. */
  onDismount: () => void;
  onArea?: (area: string) => void;
}

function letterTexture(letter: string) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#E4B36E'; ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#243235'; ctx.stroke();
  ctx.fillStyle = '#243235'; ctx.font = '900 84px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The skateboard inside the world canvas: input, fixed-step physics, tricks and combos,
 * the Game of S.K.A.T.E., the chase camera and the rider. It owns the camera while the
 * board is equipped; the walker's controller owns it otherwise. */
export default function SkateController({ runtime, onGameFinished, onDismount, onArea }: Props) {
  const runtimeRef = useRef(runtime);
  const callbacks = useRef({ onGameFinished, onDismount, onArea });
  useEffect(() => { callbacks.current = { onGameFinished, onDismount, onArea }; }, [onGameFinished, onDismount, onArea]);
  const model = useMemo(() => createSkaterModel(), []);
  const letters = useMemo(() => SKATE_LETTERS.map(spec => {
    const material = new THREE.SpriteMaterial({ map: letterTexture(spec.letter), depthTest: true, transparent: true });
    const sprite = new THREE.Sprite(material); sprite.scale.setScalar(1.15); sprite.name = `skate-letter-${spec.letter}`;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.78, .045, 6, 32), new THREE.MeshBasicMaterial({ color: '#F1D39A', transparent: true, opacity: .8 }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 6, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#F1D39A', transparent: true, opacity: .28, depthWrite: false }));
    const group = new THREE.Group(); group.add(sprite, ring, beam); group.visible = false;
    const point = skateLetterPoint(spec);
    group.position.copy(point);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), point.clone().normalize());
    beam.position.y = -2.4;
    return { spec, group, sprite, ring, point, material };
  }), []);
  const root = useRef<THREE.Group>(null);
  const sim = useRef({
    board: new SkaterState(), reader: new SkateInputReader(), score: new SkateScore(), pose: createSkaterPose(), events: [] as SkateEvent[],
    accumulator: 0, riding: false, cameraReady: false, ownsCamera: false, fov: BASE_FOV, area: '',
    game: { phase: 'none' as 'none' | 'countdown' | 'playing' | 'finished', countdown: 0, time: 0, got: new Set<SkateLetterId>(), sent: false },
    direction: new THREE.Vector3(), offset: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), desired: new THREE.Vector3(),
    up: new THREE.Vector3(), scratch: new THREE.Vector3(), probe: new THREE.Vector3(), sample: { height: 0, kind: 'concrete', normal: new THREE.Vector3() } as SurfaceSample,
    ground: new THREE.Vector3(), center: new THREE.Vector3(), clock: 0,
  });

  useEffect(() => () => {
    model.dispose();
    for (const letter of letters) { letter.material.map?.dispose(); letter.material.dispose(); letter.ring.geometry.dispose(); (letter.ring.material as THREE.Material).dispose(); (letter.group.children[2] as THREE.Mesh).geometry.dispose(); ((letter.group.children[2] as THREE.Mesh).material as THREE.Material).dispose(); }
  }, [model, letters]);

  useEffect(() => {
    const runtime = runtimeRef.current, session = runtime.skate;
    const down = (event: KeyboardEvent) => {
      if (!session.riding || runtime.mode !== 'skating') return;
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
      if (event.code === 'KeyR' && !event.repeat && sim.current.game.phase !== 'none') { event.preventDefault(); session.request = { kind: 'restart-game' }; return; }
      if (!SKATE_CODES.has(event.code)) return;
      event.preventDefault();
      if (!event.repeat) session.pressed.add(event.code);
      session.keys.add(event.code);
    };
    const up = (event: KeyboardEvent) => { session.keys.delete(event.code); };
    const clear = () => clearSkateInput(session);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  useFrame((frame, delta) => {
    const runtime = runtimeRef.current, session = runtime.skate, state = sim.current, board = state.board;
    const dt = Math.min(delta, .1);
    state.clock += dt;
    const request = session.request;
    if (request && session.riding) { session.request = null; handle(request); }
    if (!session.riding) {
      if (state.riding) { state.riding = false; state.game.phase = 'none'; session.hud = emptySkateHud(); }
      if (root.current) root.current.visible = false;
      if (state.ownsCamera) releaseCamera(frame.camera);
      return;
    }
    if (!state.riding) begin();
    if (root.current) root.current.visible = true;

    if (runtime.mode === 'skating') {
      const game = state.game;
      if (game.phase === 'countdown') {
        const before = Math.ceil(game.countdown);
        game.countdown -= dt;
        if (game.countdown <= 0) { game.phase = 'playing'; game.countdown = 0; state.score.popup('info', 'GO!'); }
        else if (Math.ceil(game.countdown) !== before) state.score.popup('info', String(Math.ceil(game.countdown)));
      } else {
        state.accumulator = Math.min(state.accumulator + dt, T.step * T.maxSubsteps);
        while (state.accumulator >= T.step) { state.accumulator -= T.step; simulate(T.step); }
        if (game.phase === 'playing') {
          game.time += dt;
          if (game.time >= SKATE_GAME_TIME) finishGame(false);
        }
      }
    }

    // Rider, shadow, letters and camera.
    poseSkater(model, board, state.pose, dt, runtime.reducedMotion);
    state.up.copy(board.position).normalize();
    WORLD_SKATE.sample(state.up, state.sample);
    state.ground.copy(state.up).multiplyScalar(groundRadius(state.sample.height));
    placeSkaterShadow(model, state.ground, state.sample.normal, Math.max(0, board.position.length() - state.ground.length()));
    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i], shown = state.game.phase === 'countdown' || state.game.phase === 'playing';
      letter.group.visible = shown && !state.game.got.has(letter.spec.letter);
      if (!letter.group.visible) continue;
      letter.sprite.position.y = runtime.reducedMotion ? 0 : Math.sin(state.clock * 2.2 + i) * .12;
      letter.ring.rotation.y = state.clock * 1.6 + i;
    }
    updateCamera(frame.camera, dt, runtime.reducedMotion);

    // Hand the walker's position along, and publish the HUD snapshot.
    const up = state.up;
    runtime.position.x = board.position.x + up.x * PLAYER_CENTER_HEIGHT; runtime.position.y = board.position.y + up.y * PLAYER_CENTER_HEIGHT; runtime.position.z = board.position.z + up.z * PLAYER_CENTER_HEIGHT;
    runtime.up.x = up.x; runtime.up.y = up.y; runtime.up.z = up.z;
    const travel = state.scratch.copy(board.heading).multiplyScalar(board.fakie ? -1 : 1).addScaledVector(up, -board.heading.dot(up) * (board.fakie ? -1 : 1));
    if (travel.lengthSq() > 1e-6) { travel.normalize(); runtime.forward.x = travel.x; runtime.forward.y = travel.y; runtime.forward.z = travel.z; }
    session.focus.x = board.position.x; session.focus.y = board.position.y; session.focus.z = board.position.z;
    session.heading.x = runtime.forward.x; session.heading.y = runtime.forward.y; session.heading.z = runtime.forward.z;
    const area = areaAt(board.position);
    if (area !== state.area) { state.area = area; callbacks.current.onArea?.(area); }
    const hud = session.hud, score = state.score;
    hud.mode = board.mode; hud.speed = board.velocity.length(); hud.score = score.score;
    hud.comboTricks = score.tricks.map(trick => trick.name); hud.comboBase = score.comboBase; hud.comboMultiplier = score.multiplier;
    hud.airTricks = board.mode === 'air' ? [...board.air.flips.map(id => FLIPS[id].name), ...board.air.grabs.map(g => GRABS[g.id].name), ...(board.air.grab ? [GRABS[board.air.grab].name] : [])] : [];
    hud.balance = board.grind ? board.grind.balance : board.manual ? board.manual.balance : null;
    hud.balanceKind = board.grind ? 'grind' : board.manual ? 'manual' : null;
    hud.charge = board.charge;
    hud.nearGame = state.game.phase !== 'playing' && state.game.phase !== 'countdown' && Math.hypot(board.position.x - GAME_HOTSPOT.position[0], board.position.y - GAME_HOTSPOT.position[1], board.position.z - GAME_HOTSPOT.position[2]) <= GAME_HOTSPOT.radius + 1.5;
    hud.game.phase = state.game.phase; hud.game.countdown = state.game.countdown; hud.game.time = Math.max(0, SKATE_GAME_TIME - state.game.time);
    for (const id of LETTER_IDS) hud.game.letters[id] = state.game.got.has(id);
    if (score.popups.length) { session.popups.push(...score.popups); score.popups.length = 0; if (session.popups.length > 20) session.popups.splice(0, session.popups.length - 20); }
    const map = mapCoordinates(board.position), debug = session.debug;
    debug.mapX = map.x; debug.mapZ = map.z; debug.mode = board.mode; debug.surface = board.surface; debug.grounded = board.mode === 'ground';
    debug.air = board.mode === 'air' ? board.air.height : 0;
    runtime.counters.drawCalls = frame.gl.info.render.calls; runtime.counters.triangles = frame.gl.info.render.triangles;
  });

  /** Put the rider down where the walker stands, facing the same way. */
  function begin() {
    const state = sim.current, runtime = runtimeRef.current;
    state.riding = true; state.cameraReady = false; state.accumulator = 0; state.game.phase = 'none'; state.area = '';
    state.reader.reset(); state.score.reset();
    runtime.skate.popups.length = 0; runtime.skate.result = null;
    const up = new THREE.Vector3(runtime.position.x, runtime.position.y, runtime.position.z).normalize();
    const forward = new THREE.Vector3(runtime.forward.x, runtime.forward.y, runtime.forward.z);
    placeSkater(state.board, WORLD_SKATE, up, forward, 0);
    state.direction.copy(forward).addScaledVector(up, -forward.dot(up)).normalize();
    state.score.popup('info', 'BOARD ON');
  }

  function handle(request: NonNullable<WorldRuntimeState['skate']['request']>) {
    const state = sim.current;
    if (!state.riding) begin();
    if (request.kind === 'game' || request.kind === 'restart-game') {
      // Start at the top of the grand stairs, facing into the park, for a 3-2-1.
      const start = SKATE_GAME_START, tangents = parkTangents(start.u, start.v);
      const forward = tangents.east.clone().multiplyScalar(start.facing.u).addScaledVector(tangents.north, start.facing.v);
      placeSkater(state.board, WORLD_SKATE, parkDirection(start.u, start.v), forward, 0);
      state.direction.copy(forward); state.cameraReady = false;
      state.score.reset(); state.reader.reset();
      const game = state.game;
      game.phase = 'countdown'; game.countdown = COUNTDOWN; game.time = 0; game.got.clear(); game.sent = false;
      runtimeRef.current.skate.result = null; runtimeRef.current.skate.popups.length = 0;
      clearSkateInput(runtimeRef.current.skate);
      state.score.popup('info', String(COUNTDOWN));
    } else if (request.kind === 'end-game') {
      if (state.game.phase === 'playing' || state.game.phase === 'countdown') state.game.phase = 'none';
    } else if (request.kind === 'spawn') {
      const frame = mapFrame(request.x, request.z);
      placeSkater(state.board, WORLD_SKATE, mapDirection(request.x, request.z), frame.east.clone().multiplyScalar(request.east).addScaledVector(frame.north, request.north), request.speed);
      state.cameraReady = false;
    }
  }

  function finishGame(complete: boolean) {
    const state = sim.current, game = state.game, score = state.score;
    if (game.phase !== 'playing' || game.sent) return;
    score.bank();
    game.phase = 'finished'; game.sent = true;
    const result: SkateGameResult = { complete, time: Math.min(game.time, SKATE_GAME_TIME), letters: game.got.size, got: [...game.got], score: score.score, bestCombo: score.bestCombo };
    runtimeRef.current.skate.result = result;
    score.popup('info', complete ? 'S.K.A.T.E.!' : 'TIME');
    callbacks.current.onGameFinished(result);
  }

  function scoreAir(air: AirSummary) {
    const score = sim.current.score;
    for (const grab of air.grabs) score.add(GRABS[grab.id].name, Math.round(GRABS[grab.id].points + GRAB_PER_SECOND * Math.min(3, grab.time)), grab.id);
    const spin = spinName(air.spin);
    if (spin) score.add(`${air.fakieTakeoff ? 'Fakie ' : ''}${spin.side} ${spin.degrees}`, spin.points);
    const tricks = air.flips.length + air.grabs.length + (spin ? 1 : 0);
    if (!tricks && air.vert && air.height > .5) score.add('Air', 60);
    else if (!tricks && air.popped && air.time > .35) score.add('Ollie', 30);
  }

  function simulate(dt: number) {
    const state = sim.current, board = state.board, runtime = runtimeRef.current, session = runtime.skate, score = state.score, debug = session.debug;
    const input = state.reader.read(session, dt);
    state.events.length = 0;
    stepSkater(board, input, dt, WORLD_SKATE, state.events);
    for (const event of state.events) {
      debug.lastEvent = event.type;
      if (event.type === 'launch') debug.launches++;
      else if (event.type === 'flip') score.add(FLIPS[event.id].name, FLIPS[event.id].points, event.id);
      else if (event.type === 'land') { debug.landings++; if (event.air.popped || event.air.time > .22 || event.air.flips.length || event.air.grabs.length) scoreAir(event.air); }
      else if (event.type === 'grind-start') { debug.grinds++; state.reader.consumeGrind(); if (event.air) scoreAir(event.air); }
      else if (event.type === 'grind-end' && !event.bailed) score.add(GRINDS[event.trick].name, Math.round(GRINDS[event.trick].points + GRIND_PER_SECOND * event.time), event.trick);
      else if (event.type === 'manual-end' && !event.bailed) score.add(MANUALS[event.id].name, Math.round(MANUALS[event.id].points + MANUAL_PER_SECOND * event.time), event.id);
      else if (event.type === 'bail') { debug.bails++; score.lose(event.reason === 'water' ? 'SPLASH' : 'BAILED'); }
    }
    // Rolling away clean banks the combo; manuals and grinds keep it open.
    if (board.mode === 'ground' && !board.manual && score.tricks.length) score.bank();
    // Letters: pass close to one to take it.
    const game = state.game;
    if (game.phase === 'playing') {
      state.center.copy(board.position).addScaledVector(state.up.copy(board.position).normalize(), SKATE_LETTER_BODY);
      for (const letter of letters) {
        if (game.got.has(letter.spec.letter) || state.center.distanceTo(letter.point) > SKATE_LETTER_REACH) continue;
        game.got.add(letter.spec.letter);
        score.popup('letter', `${letter.spec.letter}!`);
        if (game.got.size === letters.length) finishGame(true);
      }
    }
    // Boards come off at the door: rolling into a room hands back to the walker.
    const inside = activeInteriorAt(board.position) !== null;
    debug.interior = inside;
    if (inside && state.riding) { state.riding = false; session.riding = false; callbacks.current.onDismount(); }
  }

  function updateCamera(camera: RootState['camera'], dt: number, reduced: boolean) {
    const state = sim.current, board = state.board, C = T.camera;
    state.ownsCamera = true;
    const up = state.up.copy(board.position).normalize();
    const speed = board.velocity.length();
    // Chase the travel line on rideable ground; hold steady on walls, in the air and in bails.
    const steady = board.mode === 'ground' && board.groundNormal.dot(up) > .7 || board.mode === 'grind';
    const travel = state.scratch.copy(speed > 1.2 ? board.velocity : board.heading).multiplyScalar(speed > 1.2 ? 1 : board.fakie ? -1 : 1);
    travel.addScaledVector(up, -travel.dot(up));
    state.direction.addScaledVector(up, -state.direction.dot(up));
    if (!state.cameraReady || state.direction.lengthSq() < 1e-6) state.direction.copy(travel.lengthSq() > 1e-6 ? travel : board.heading);
    else if (steady && travel.lengthSq() > 1e-6) state.direction.lerp(travel.normalize(), 1 - Math.exp(-C.directionDamping * dt));
    state.direction.normalize();
    const portrait = camera instanceof THREE.PerspectiveCamera && camera.aspect < 1 ? Math.min(1, (1 - camera.aspect) * 2) : 0;
    const distance = Math.min(C.maxDistance, C.distance + C.distancePerSpeed * speed) * (1 + .3 * portrait);
    const height = Math.min(C.maxHeight, C.height + C.heightPerSpeed * speed) * (1 + .3 * portrait);
    state.target.copy(board.position).addScaledVector(up, C.lookUp);
    // In a vert air the camera waits near the coping and looks up at the rider.
    const vertAir = board.mode === 'air' && board.air.vert;
    if (vertAir) { const cap = board.air.startRadius + 1.1 + C.lookUp, radius = state.target.length(); if (radius > cap) state.target.multiplyScalar(cap / radius); }
    state.desired.copy(state.direction).multiplyScalar(-distance * (vertAir ? 1.15 : 1)).addScaledVector(up, height);
    // Keep out of building walls, then above whatever surface lies beneath the camera.
    const length = state.desired.length();
    const clear = cameraClearDistance(state.target, state.probe.copy(state.desired).divideScalar(length), length, null);
    if (clear < length) state.desired.multiplyScalar(Math.max(.6, clear) / length);
    state.probe.copy(state.target).add(state.desired);
    WORLD_SKATE.sample(state.center.copy(state.probe).normalize(), state.sample);
    const lift = groundRadius(state.sample.height) + C.groundClearance - state.probe.length();
    if (lift > 0) state.desired.addScaledVector(up, lift);
    if (!state.cameraReady) { state.offset.copy(state.desired); state.cameraReady = true; }
    else state.offset.lerp(state.desired, 1 - Math.exp(-C.positionDamping * dt));
    const look = state.probe.copy(state.direction).multiplyScalar(vertAir ? C.lookAhead * .15 : C.lookAhead);
    state.look.lerp(look, 1 - Math.exp(-6 * dt));
    camera.position.copy(state.target).add(state.offset);
    camera.up.copy(up);
    // Aim at the rider's body, even when the camera itself is held at the coping.
    camera.lookAt(state.probe.copy(board.position).addScaledVector(up, C.lookUp).add(state.look));
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = (reduced ? C.fov : C.fov + Math.min(C.maxFovBoost, Math.max(0, speed - 7) * C.fovPerSpeed)) + 8 * portrait;
      state.fov += (fov - state.fov) * (1 - Math.exp(-3 * dt));
      if (Math.abs(camera.fov - state.fov) > .01 || camera.near !== .08) { camera.fov = state.fov; camera.near = .08; camera.updateProjectionMatrix(); }
    }
  }

  function releaseCamera(camera: RootState['camera']) {
    const state = sim.current;
    state.ownsCamera = false; state.cameraReady = false; state.fov = BASE_FOV;
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  }

  return <group ref={root} name="skateboard" visible={false}>
    <primitive object={model.group} />
    <primitive object={model.shadow} />
    {letters.map(letter => <primitive key={letter.spec.letter} object={letter.group} />)}
  </group>;
}
