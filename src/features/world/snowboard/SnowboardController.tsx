'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { mapCoordinates } from '../data/world-map';
import { skiRunById, type SkiRun, type SkiRunId } from '../data/ski-runs';
import { isEditableTarget } from '../runtime/input';
import type { WorldRuntimeState } from '../runtime/types';
import { BoardState, IDLE_INPUT, groundRadius, placeBoard, stepBoard, surfaceNormal, type BoardEvent, type BoardInput } from './physics';
import { RunCourse, runPose, type CourseEvent } from './course';
import { WORLD_SNOW } from './terrain';
import { applyBoardEvent, applyCourseEvent, createScore, finishScore, FLOW_WINDOW, loseCombo, noteLanding, notify, tickScore, type RunResult } from './scoring';
import { InputReader, SNOWBOARD_CODES } from './input';
import { createPose, createRiderModel, placeShadow, poseRider } from './rider';
import { clearSnowboardInput, type SnowboardPhase } from '../runtime/snowboard-session';
import { SNOWBOARD as T } from './tuning';

const MAX_TOKENS = 64;
const SPRAY = 160;
const FINISH_INPUT: Readonly<BoardInput> = { ...IDLE_INPUT, brake: true };
const BASE_FOV = 52;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Props {
  runtime: WorldRuntimeState;
  /** Called once per run, after the rider coasts to a stop past the finish line. */
  onFinish: (result: RunResult) => void;
}

/** The snowboard mini-game inside the world canvas: input, fixed-step physics, course,
 * scoring, chase camera, rider, tokens and spray. It owns the camera only while a run is
 * active; the walker's controller owns it otherwise. */
export default function SnowboardController({ runtime, onFinish }: Props) {
  const runtimeRef = useRef(runtime);
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  const model = useMemo(() => createRiderModel(), []);
  const tokenGeometry = useMemo(() => new THREE.CylinderGeometry(.34, .34, .09, 6).rotateX(Math.PI / 2), []);
  const tokenMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#E4B36E', emissive: '#6B4A1E', emissiveIntensity: .45 }), []);
  const spray = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPRAY * 3), 3));
    const material = new THREE.PointsMaterial({ color: '#F4F7F6', size: .13, sizeAttenuation: true, transparent: true, opacity: .85, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { geometry, material, points, velocity: new Float32Array(SPRAY * 3), life: new Float32Array(SPRAY), next: 0 };
  }, []);
  const tokens = useRef<THREE.InstancedMesh>(null);
  const root = useRef<THREE.Group>(null);
  const sim = useRef({
    board: new BoardState(), courses: new Map<SkiRunId, RunCourse>(), course: null as RunCourse | null, run: null as SkiRun | null,
    score: createScore(), phase: 'idle' as SnowboardPhase, countdown: 0, time: 0, finishTimer: 0, resultSent: false, result: null as RunResult | null,
    accumulator: 0, launchS: 0, reader: new InputReader(), pose: createPose(), boardEvents: [] as BoardEvent[], courseEvents: [] as CourseEvent[],
    cameraReady: false, offset: new THREE.Vector3(), look: new THREE.Vector3(), direction: new THREE.Vector3(), fov: BASE_FOV, ownsCamera: false,
    up: new THREE.Vector3(), travel: new THREE.Vector3(), desired: new THREE.Vector3(), target: new THREE.Vector3(), scratch: new THREE.Vector3(),
    ground: new THREE.Vector3(), normal: new THREE.Vector3(), probe: new THREE.Vector3(), matrix: new THREE.Matrix4(), quaternion: new THREE.Quaternion(), spin: new THREE.Quaternion(),
    scale: new THREE.Vector3(), tokenClock: 0,
  });

  useEffect(() => () => { model.dispose(); tokenGeometry.dispose(); tokenMaterial.dispose(); spray.geometry.dispose(); spray.material.dispose(); }, [model, tokenGeometry, tokenMaterial, spray]);

  useEffect(() => {
    const runtime = runtimeRef.current, session = runtime.snowboard;
    const down = (event: KeyboardEvent) => {
      if (!session.active || runtime.mode !== 'snowboard') return;
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
      if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) session.request = { kind: 'restart' }; return; }
      if (!SNOWBOARD_CODES.has(event.code)) return;
      event.preventDefault(); session.keys.add(event.code);
    };
    const up = (event: KeyboardEvent) => { session.keys.delete(event.code); };
    const clear = () => clearSnowboardInput(session);
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
    const runtime = runtimeRef.current, session = runtime.snowboard, state = sim.current, board = state.board;
    const dt = Math.min(delta, .1);
    const request = session.request;
    if (request) {
      session.request = null;
      const runId = request.kind === 'restart' ? state.run?.id : request.runId;
      if (runId) begin(runId, request.kind === 'spawn' ? request : null);
    }
    if (!session.active || !state.course || !state.run) {
      if (root.current) root.current.visible = false;
      if (state.ownsCamera) releaseCamera(frame.camera);
      return;
    }
    if (root.current) root.current.visible = true;
    const course = state.course, run = state.run;

    if (runtime.mode === 'snowboard') {
      if (state.phase === 'countdown') {
        const before = Math.ceil(state.countdown);
        state.countdown -= dt;
        if (state.countdown <= 0) {
          state.phase = 'riding'; state.countdown = 0;
          board.velocity.copy(board.heading).multiplyScalar(T.startPush);
          notify(state.score, 'info', 'GO');
        } else if (Math.ceil(state.countdown) !== before) notify(state.score, 'info', String(Math.ceil(state.countdown)));
      } else {
        state.accumulator = Math.min(state.accumulator + dt, T.step * T.maxSubsteps);
        while (state.accumulator >= T.step) { state.accumulator -= T.step; simulate(T.step); }
      }
    }
    if (state.phase === 'finished' && !state.resultSent && state.finishTimer >= T.finishCoast && state.result) {
      state.resultSent = true;
      finishRef.current(state.result);
    }

    // Rider, shadow, tokens and spray.
    poseRider(model, board, state.pose, dt, runtime.reducedMotion);
    state.up.copy(board.position).normalize();
    state.ground.copy(state.up).multiplyScalar(groundRadius(WORLD_SNOW, state.up));
    surfaceNormal(WORLD_SNOW, state.ground, board.heading, state.normal);
    placeShadow(model, state.ground, state.normal, Math.max(0, board.position.length() - state.ground.length()));
    updateTokens(dt);
    updateSpray(dt, runtime.reducedMotion);
    updateCamera(frame.camera, dt, runtime.reducedMotion);

    // HUD snapshot and debugger state; popups drain into the session queue.
    const hud = session.hud, score = state.score, speed = board.velocity.length();
    hud.runId = run.id; hud.phase = state.phase; hud.countdown = state.countdown; hud.time = state.time;
    hud.score = score.score; hud.combo = Math.round(score.combo); hud.comboTricks = score.comboTricks.slice(-3).join(' + ');
    hud.multiplier = score.multiplier; hud.flow = score.flow / FLOW_WINDOW; hud.speed = speed;
    hud.progress = Math.max(0, Math.min(1, course.location.s / run.length));
    hud.tokens = course.tokenCount; hud.tokenTotal = course.tokenPoints.length;
    hud.gates = score.stats.gatesPassed; hud.gatesMissed = score.stats.gatesMissed; hud.gateTotal = run.gates.length;
    hud.airborne = board.airborne; hud.offCourse = course.offCourse; hud.charge = board.charge;
    if (score.popups.length) { session.popups.push(...score.popups); score.popups.length = 0; if (session.popups.length > 16) session.popups.splice(0, session.popups.length - 16); }
    session.focus.x = board.position.x; session.focus.y = board.position.y; session.focus.z = board.position.z;
    const map = mapCoordinates(board.position), debug = session.debug;
    debug.mapX = map.x; debug.mapZ = map.z; debug.lateral = course.location.lateral; debug.distance = course.location.distance;
    debug.airborne = board.airborne; debug.crashed = board.crashed; debug.surface = board.surface;
  });

  function begin(runId: SkiRunId, spawn: { progress: number; speed: number } | null) {
    const state = sim.current, runtime = runtimeRef.current, session = runtime.snowboard;
    const run = skiRunById(runId);
    let course = state.courses.get(runId);
    if (!course) { course = new RunCourse(run); state.courses.set(runId, course); }
    course.reset();
    state.run = run; state.course = course; state.score = createScore();
    state.time = 0; state.finishTimer = 0; state.resultSent = false; state.result = null; state.accumulator = 0; state.launchS = 0;
    state.reader.reset(); state.cameraReady = false;
    session.result = null; session.popups.length = 0; session.debug.launches = 0; session.debug.lastLanding = null;
    clearSnowboardInput(session);
    const s = spawn ? Math.max(.5, Math.min(run.length - 1, spawn.progress * run.length)) : .5;
    const pose = runPose(run, s);
    placeBoard(state.board, WORLD_SNOW, pose.direction, pose.forward, spawn ? spawn.speed : 0);
    course.relocate(state.board.position);
    if (spawn) {
      while (course.checkpoint + 1 < run.checkpoints.length && run.checkpoints[course.checkpoint + 1] <= s) course.checkpoint++;
      course.progress = s;
      for (let i = 0; i < run.gates.length; i++) if (run.gates[i].s < s) course.gates[i] = false;
      // A development spawn starts the clock pro rata, so the time bonus stays meaningful.
      state.time = s / run.length * run.par;
      state.phase = 'riding'; state.countdown = 0;
    } else { state.phase = 'countdown'; state.countdown = T.countdown; notify(state.score, 'info', String(T.countdown)); }
    for (let i = 0; i < SPRAY; i++) spray.life[i] = 0;
  }

  function respawn(message?: string) {
    const state = sim.current, course = state.course!, run = state.run!;
    const pose = runPose(run, course.respawnDistance() + .5);
    placeBoard(state.board, WORLD_SNOW, pose.direction, pose.forward, T.respawnSpeed);
    course.relocate(state.board.position);
    state.reader.reset();
    state.phase = 'riding'; state.cameraReady = false;
    if (message) notify(state.score, 'info', message);
  }

  function simulate(dt: number) {
    const state = sim.current, board = state.board, course = state.course!, run = state.run!, score = state.score, session = runtimeRef.current.snowboard;
    const input = state.phase === 'riding' ? state.reader.read(session, board.airborne) : state.phase === 'finished' ? FINISH_INPUT : IDLE_INPUT;
    state.boardEvents.length = 0; state.courseEvents.length = 0;
    stepBoard(board, input, dt, WORLD_SNOW, state.boardEvents);
    if (state.phase === 'finished') { board.velocity.multiplyScalar(Math.exp(-2.4 * dt)); state.finishTimer += dt; }
    else state.time += dt;
    const speed = board.velocity.length();
    course.update(board.position, speed, board.airborne, board.crashed, dt, state.courseEvents);
    if (state.phase === 'finished') return;
    for (const event of state.boardEvents) {
      if (event.type === 'launch') { state.launchS = course.location.s; session.debug.launches++; }
      else if (event.type === 'land') { noteLanding(score, run, state.launchS, event.quality); session.debug.lastLanding = event.hop ? 'hop' : event.quality; burst(event.hop ? 6 : 22); }
      else if (event.type === 'crash') { state.phase = 'crashed'; burst(30); }
      applyBoardEvent(score, event);
    }
    for (const event of state.courseEvents) {
      if (event.type === 'finish') {
        state.phase = 'finished'; state.finishTimer = 0;
        state.result = finishScore(score, run, state.time, course.tokenPoints.length);
        session.result = state.result;
        notify(score, 'info', 'FINISH');
        return;
      }
      applyCourseEvent(score, event);
    }
    if (state.phase === 'riding') tickScore(score, dt, board.carving && board.carveLoad > .45 && speed >= 9);
    if (state.phase === 'crashed' && board.crashTimer <= 0) respawn('BACK AT THE CHECKPOINT');
    else if (state.phase === 'riding' && course.outOfBounds()) { loseCombo(score, 'OUT OF BOUNDS'); respawn(); }
    else if (state.phase === 'riding' && course.stuck > T.stuckTime) respawn('BACK AT THE CHECKPOINT');
  }

  function updateTokens(dt: number) {
    const state = sim.current, course = state.course, mesh = tokens.current;
    if (!mesh || !course) return;
    state.tokenClock += dt;
    const count = Math.min(MAX_TOKENS, course.tokenPoints.length);
    for (let i = 0; i < count; i++) {
      const point = course.tokenPoints[i];
      state.up.copy(point).normalize();
      state.quaternion.setFromUnitVectors(Y_AXIS, state.up).multiply(state.spin.setFromAxisAngle(Y_AXIS, state.tokenClock * 2.6 + i * .7));
      state.scale.setScalar(course.tokens[i] ? 0 : 1);
      mesh.setMatrixAt(i, state.matrix.compose(point, state.quaternion, state.scale));
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function burst(count: number) {
    if (runtimeRef.current.reducedMotion) return;
    for (let i = 0; i < count; i++) emit(1.8 + Math.random() * 2.4, 1);
  }
  function emit(lift: number, spread: number) {
    const state = sim.current, board = state.board, i = spray.next;
    spray.next = (spray.next + 1) % SPRAY;
    const position = spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    const up = state.scratch.copy(board.position).normalize();
    const along = (Math.random() - .5) * 1.2;
    position.setXYZ(i, board.position.x + board.heading.x * along + up.x * .06, board.position.y + board.heading.y * along + up.y * .06, board.position.z + board.heading.z * along + up.z * .06);
    const v = board.velocity, side = (Math.random() - .5) * 2 * spread;
    spray.velocity[i * 3] = -v.x * .18 + up.x * lift + board.boardUp.x * side;
    spray.velocity[i * 3 + 1] = -v.y * .18 + up.y * lift + board.boardUp.y * side;
    spray.velocity[i * 3 + 2] = -v.z * .18 + up.z * lift + board.boardUp.z * side;
    spray.life[i] = .45 + Math.random() * .35;
  }
  function updateSpray(dt: number, reduced: boolean) {
    const state = sim.current, board = state.board, speed = board.velocity.length();
    const position = spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!reduced && !board.airborne && !board.crashed && speed > 5) {
      const rate = (board.skidding || board.braking ? 110 : board.carveLoad > .45 ? 70 * board.carveLoad : 0) * Math.min(1, speed / 14);
      let emissions = rate * dt;
      while (emissions > 0) { if (Math.random() < emissions) emit(.6 + Math.random() * 1.6, .8); emissions -= 1; }
    }
    for (let i = 0; i < SPRAY; i++) {
      if (spray.life[i] <= 0) { position.setXYZ(i, 0, 0, 0); continue; }
      spray.life[i] -= dt;
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i), r = Math.hypot(x, y, z) || 1;
      spray.velocity[i * 3] -= x / r * 9 * dt; spray.velocity[i * 3 + 1] -= y / r * 9 * dt; spray.velocity[i * 3 + 2] -= z / r * 9 * dt;
      position.setXYZ(i, x + spray.velocity[i * 3] * dt, y + spray.velocity[i * 3 + 1] * dt, z + spray.velocity[i * 3 + 2] * dt);
    }
    position.needsUpdate = true;
  }

  function updateCamera(camera: RootState['camera'], dt: number, reduced: boolean) {
    const state = sim.current, board = state.board, C = T.camera;
    state.ownsCamera = true;
    const up = state.up.copy(board.position).normalize();
    const speed = board.velocity.length();
    // Chase direction: the travel line at speed, the board's facing axis when slow; held
    // steady through the air and a crash so spins and tumbles never whip the view.
    state.travel.copy(speed > 2.5 ? board.velocity : board.heading).addScaledVector(up, -(speed > 2.5 ? board.velocity : board.heading).dot(up));
    if (speed <= 2.5 && board.switchStance) state.travel.negate();
    if (state.travel.lengthSq() < 1e-6) state.travel.copy(state.direction);
    state.travel.normalize();
    state.direction.addScaledVector(up, -state.direction.dot(up));
    if (!state.cameraReady || state.direction.lengthSq() < 1e-6) state.direction.copy(state.travel);
    else if (!board.airborne && !board.crashed) state.direction.lerp(state.travel, 1 - Math.exp(-C.directionDamping * dt));
    state.direction.normalize();
    // Portrait screens pull the camera back and up so the run ahead stays in view.
    const portrait = camera instanceof THREE.PerspectiveCamera && camera.aspect < 1 ? Math.min(1, (1 - camera.aspect) * 2) : 0;
    const distance = Math.min(C.maxDistance, C.distance + C.distancePerSpeed * speed) * (1 + .3 * portrait);
    const height = Math.min(C.maxHeight, C.height + C.heightPerSpeed * speed) * (1 + .35 * portrait);
    state.target.copy(board.position).addScaledVector(up, 1);
    state.desired.copy(state.direction).multiplyScalar(-distance).addScaledVector(up, height);
    // Keep the camera above the snow behind the rider.
    state.scratch.copy(state.target).add(state.desired);
    const clearance = groundRadius(WORLD_SNOW, state.probe.copy(state.scratch).normalize()) + C.groundClearance - state.scratch.length();
    if (clearance > 0) state.desired.addScaledVector(up, clearance);
    if (!state.cameraReady) { state.offset.copy(state.desired); state.cameraReady = true; }
    else if (!board.crashed) state.offset.lerp(state.desired, 1 - Math.exp(-C.positionDamping * dt));
    const look = state.scratch.copy(state.direction).multiplyScalar(C.lookAhead).addScaledVector(up, -C.lookDown);
    state.look.lerp(look, 1 - Math.exp(-C.lookDamping * dt));
    if (state.look.lengthSq() < 1e-6) state.look.copy(look);
    camera.position.copy(state.target).add(state.offset);
    camera.up.copy(up);
    camera.lookAt(state.scratch.copy(state.target).add(state.look));
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = (reduced ? BASE_FOV : BASE_FOV + Math.min(C.maxFovBoost, Math.max(0, speed - 8) * C.fovPerSpeed)) + 10 * portrait;
      state.fov += (fov - state.fov) * (1 - Math.exp(-3 * dt));
      if (Math.abs(camera.fov - state.fov) > .01 || camera.near !== .08) { camera.fov = state.fov; camera.near = .08; camera.updateProjectionMatrix(); }
    }
  }

  function releaseCamera(camera: RootState['camera']) {
    const state = sim.current;
    state.ownsCamera = false; state.cameraReady = false; state.fov = BASE_FOV;
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  }

  return <group ref={root} name="snowboard" visible={false}>
    <primitive object={model.group} />
    <primitive object={model.shadow} />
    <instancedMesh ref={tokens} args={[tokenGeometry, tokenMaterial, MAX_TOKENS]} frustumCulled={false} />
    <primitive object={spray.points} />
  </group>;
}
