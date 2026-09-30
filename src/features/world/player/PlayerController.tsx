"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { HOTSPOTS } from "../data/hotspots";
import { areaAt, frameAt, RADIUS } from "../data/planet";
import { PIER_LAYOUT } from "../data/pier-layout";
import { MAP_MAX_HEIGHT, MAP_SUMMIT, mapCoordinates, mapPoint } from "../data/world-map";
import { clearWorldInput, isEditableTarget, MOVEMENT_CODES } from "../runtime/input";
import { activeInteriorAt, cameraClearDistance, moveOnSurface, supportAt } from "../runtime/planet-collision";
import {
  CAMERA_FOLLOW_DISTANCE, DEFAULT_FORWARD, DEFAULT_HEADING, DEFAULT_SPAWN, PLAYER_CENTER_HEIGHT,
  type WorldRuntimeState,
} from "../runtime/types";

interface PlayerControllerProps {
  runtime: WorldRuntimeState;
  onReady: () => void;
  onHotspot: (id: string | null) => void;
  onArea?: (area: string) => void;
}

const FIXED_STEP = 1 / 60;
const WALK_SPEED = 4.8;
const RUN_SPEED = 7.8;
const SUMMIT_POINT = mapPoint(MAP_SUMMIT.x, MAP_SUMMIT.z, MAP_SUMMIT.height);
const copyPoint = (target: { x: number; y: number; z: number }, source: Vector3) => {
  target.x = source.x; target.y = source.y; target.z = source.z;
};

/** A center-gravity controller; local up and travel direction survive full circuits and poles. */
export default function PlayerController({ runtime, onReady, onHotspot, onArea }: PlayerControllerProps) {
  const runtimeRef = useRef(runtime);
  const avatar = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const callbacks = useRef({ onReady, onHotspot, onArea });
  const ready = useRef(false);
  const pointer = useRef<{ id: number; button: number; x: number; y: number } | null>(null);
  const { camera, gl } = useThree();
  const simulation = useRef({
    accumulator: 0, verticalVelocity: 0, inputActive: false, cameraInitialized: false,
    lastMode: runtime.mode, area: "", phase: 0, gait: 0, cameraHeight: 3.0,
    up: new Vector3(), forward: new Vector3(), right: new Vector3(), wish: new Vector3(),
    inputForward: new Vector3(runtime.forward.x, runtime.forward.y, runtime.forward.z),
    facing: new Vector3(runtime.forward.x, runtime.forward.y, runtime.forward.z),
    target: new Vector3(), look: new Vector3(), desired: new Vector3(), cameraDirection: new Vector3(),
    summit: new Vector3(), summitNdc: new Vector3(), framingForward: new Vector3(), cameraRight: new Vector3(), screenUp: new Vector3(), summitFraming: 0,
    overview: new Vector3(), back: new Vector3(), matrix: new Matrix4(), rotation: new Quaternion(),
  });

  useEffect(() => { callbacks.current = { onReady, onHotspot, onArea }; }, [onReady, onHotspot, onArea]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const canvas = gl.domElement;
    const clearPointer = () => {
      const held = pointer.current;
      pointer.current = null;
      runtime.touch.x = 0; runtime.touch.y = 0; runtime.touch.active = false;
      runtime.pointer.active = false;
      if (held && canvas.hasPointerCapture(held.id)) canvas.releasePointerCapture(held.id);
    };
    const clear = () => { clearWorldInput(runtime); clearPointer(); simulation.current.inputActive = false; };
    const keyDown = (event: KeyboardEvent) => {
      if (!MOVEMENT_CODES.has(event.code) || runtime.mode !== "exploring") return;
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)
        || isEditableTarget(document.activeElement)) return;
      event.preventDefault(); runtime.keys.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => runtime.keys.delete(event.code);
    const pointerDown = (event: PointerEvent) => {
      if (runtime.mode !== "exploring" || pointer.current || ![0, 2].includes(event.button)) return;
      event.preventDefault(); canvas.focus({ preventScroll: true });
      pointer.current = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY };
      runtime.pointer = { x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, active: event.button === 0 };
      runtime.touch = { x: 0, y: 0, active: event.button === 0 };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const held = pointer.current;
      if (!held || held.id !== event.pointerId || runtime.mode !== "exploring") return;
      event.preventDefault();
      if (held.button === 2) {
        const state = simulation.current;
        state.up.set(runtime.up.x, runtime.up.y, runtime.up.z);
        state.rotation.setFromAxisAngle(state.up, -(event.clientX - held.x) * 0.005);
        state.forward.set(runtime.forward.x, runtime.forward.y, runtime.forward.z).applyQuaternion(state.rotation);
        state.inputForward.applyQuaternion(state.rotation);
        copyPoint(runtime.forward, state.forward);
        state.cameraHeight = MathUtils.clamp(state.cameraHeight + (event.clientY - held.y) * 0.025, 1.6, 5.5);
        held.x = event.clientX; held.y = event.clientY;
      } else {
        const dx = event.clientX - held.x;
        const dy = held.y - event.clientY;
        const distance = Math.hypot(dx, dy);
        const strength = MathUtils.clamp((distance - 7) / 60, 0, 1);
        runtime.touch.x = distance > 0 ? dx / distance * strength : 0;
        runtime.touch.y = distance > 0 ? dy / distance * strength : 0;
        runtime.pointer.x = event.clientX; runtime.pointer.y = event.clientY;
      }
    };
    const pointerEnd = (event: PointerEvent) => { if (event.pointerId === pointer.current?.id) clearPointer(); };
    const focusChange = (event: FocusEvent) => { if (isEditableTarget(event.target)) clear(); };
    const contextMenu = (event: MouseEvent) => event.preventDefault();
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", "WestCose planet. Drag to walk, or use W A S D and arrow keys. Right-drag to look around.");
    canvas.style.setProperty("touch-action", "none");
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    document.addEventListener("focusin", focusChange);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerEnd);
    canvas.addEventListener("lostpointercapture", clearPointer);
    canvas.addEventListener("contextmenu", contextMenu);
    return () => {
      clear();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      document.removeEventListener("focusin", focusChange);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerEnd);
      canvas.removeEventListener("pointercancel", pointerEnd);
      canvas.removeEventListener("lostpointercapture", clearPointer);
      canvas.removeEventListener("contextmenu", contextMenu);
    };
  }, [gl, runtime]);

  useFrame((_, delta) => {
    const runtime = runtimeRef.current;
    const state = simulation.current;
    const dt = Math.min(delta, 0.05);
    if (runtime.mode !== state.lastMode) {
      if (runtime.mode !== "exploring") {
        clearWorldInput(runtime);
        const held = pointer.current;
        pointer.current = null;
        if (held && gl.domElement.hasPointerCapture(held.id)) gl.domElement.releasePointerCapture(held.id);
      }
      state.inputActive = false;
      state.lastMode = runtime.mode;
    }

    if (runtime.resetRequested || runtime.teleportRequested) {
      const reset = runtime.resetRequested;
      const destination = reset ? DEFAULT_SPAWN : runtime.teleportRequested!;
      const requestedLayer = reset ? 'upper' : runtime.teleportSupportLayer ?? 'upper';
      state.up.set(destination.x, destination.y, destination.z).normalize();
      if (state.up.lengthSq() < 0.5) state.up.set(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, DEFAULT_SPAWN.z).normalize();
      const forward = reset ? DEFAULT_FORWARD : runtime.forwardRequested ?? frameAt(Math.atan2(state.up.x, state.up.z), Math.asin(state.up.y)).east;
      state.forward.set(forward.x, forward.y, forward.z).addScaledVector(state.up, -(forward.x * state.up.x + forward.y * state.up.y + forward.z * state.up.z));
      if (state.forward.lengthSq() < 0.001) state.forward.copy(frameAt(Math.atan2(state.up.x, state.up.z), Math.asin(state.up.y)).east);
      state.forward.normalize();
      const resetSupport = supportAt(state.up, { layer:requestedLayer });
      copyPoint(runtime.position, state.up.clone().multiplyScalar(resetSupport.radius + PLAYER_CENTER_HEIGHT));
      copyPoint(runtime.up, state.up); copyPoint(runtime.forward, state.forward);
      state.inputForward.copy(state.forward); state.facing.copy(state.forward);
      state.verticalVelocity = 0; state.inputActive = false; state.cameraInitialized = false; state.accumulator = 0;
      runtime.supportKind = resetSupport.kind;
      runtime.supportLayer = resetSupport.layer;
      runtime.swimming = resetSupport.kind === 'water';
      if (reset) { runtime.heading = DEFAULT_HEADING; runtime.travelDistance = 0; runtime.lapCount = 0; }
      runtime.resetRequested = false; runtime.teleportRequested = undefined; runtime.forwardRequested = undefined; runtime.teleportSupportLayer = undefined;
      clearWorldInput(runtime);
    }

    // The bounded accumulator uses real fixed simulation steps, independent of display refresh rate.
    state.accumulator = Math.min(state.accumulator + Math.min(delta, 0.1), FIXED_STEP * 5);
    while (state.accumulator >= FIXED_STEP) {
      state.accumulator -= FIXED_STEP;
      state.up.set(runtime.position.x, runtime.position.y, runtime.position.z);
      let radius = state.up.length();
      state.up.normalize();
      state.forward.set(runtime.forward.x, runtime.forward.y, runtime.forward.z).addScaledVector(state.up, -(runtime.forward.x * state.up.x + runtime.forward.y * state.up.y + runtime.forward.z * state.up.z)).normalize();
      const moving = runtime.mode === "exploring" && (!isEditableTarget(document.activeElement) || runtime.touch.active);
      if (!moving) clearWorldInput(runtime);
      const keys = runtime.keys;
      const x = moving ? Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft")) + runtime.touch.x : 0;
      const y = moving ? Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")) + runtime.touch.y : 0;
      const inputLength = Math.hypot(x, y);
      if (inputLength > 0.025) {
        if (!state.inputActive) state.inputForward.copy(state.forward);
        state.inputActive = true;
        state.right.crossVectors(state.inputForward, state.up).normalize();
        state.wish.copy(state.inputForward).multiplyScalar(y).addScaledVector(state.right, x).normalize();
        const currentFootRadius = radius - PLAYER_CENTER_HEIGHT;
        const currentSupport = supportAt(state.up, { footRadius:currentFootRadius, layer:runtime.supportLayer });
        const water = currentSupport.kind === "water";
        const speed = (water ? 2.5 : keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN_SPEED : WALK_SPEED) * Math.min(inputLength, 1);
        const movement = moveOnSurface(state.up, state.wish, speed * FIXED_STEP, currentFootRadius, currentSupport.layer);
        state.inputForward.applyQuaternion(movement.rotation).normalize();
        state.forward.applyQuaternion(movement.rotation).normalize();
        state.facing.applyQuaternion(movement.rotation).normalize();
        state.wish.applyQuaternion(movement.rotation).normalize();
        state.up.copy(movement.up);
        // Entering a low portal is an intentional layer handoff. Persist it
        // before grounding at the advanced map direction so the next fixed
        // step cannot resolve the same tunnel point back to the terrace.
        runtime.supportLayer = movement.support.layer;
        if (movement.distance > 0.001) {
          // The input basis is latched for a gesture and transported too: holding diagonally
          // traces a geodesic instead of feeding camera turn back into endless circles.
          // Rotate within the tangent plane, including the exact 180-degree reverse case.
          let angle = Math.atan2(state.right.crossVectors(state.forward, state.wish).dot(state.up), state.forward.dot(state.wish));
          state.forward.applyAxisAngle(state.up, angle * (1 - Math.exp(-4.5 * FIXED_STEP))).normalize();
          angle = Math.atan2(state.right.crossVectors(state.facing, state.wish).dot(state.up), state.facing.dot(state.wish));
          state.facing.applyAxisAngle(state.up, angle * (1 - Math.exp(-12 * FIXED_STEP))).normalize();
          runtime.travelDistance += movement.distance;
          runtime.lapCount = Math.floor(runtime.travelDistance / (Math.PI * 2 * RADIUS));
          state.phase += movement.distance * 4.5;
        }
        state.gait = MathUtils.damp(state.gait, movement.distance > 0.001 ? Math.min(inputLength, 1) : 0, 12, FIXED_STEP);
      } else {
        state.inputActive = false;
        state.gait = MathUtils.damp(state.gait, 0, 12, FIXED_STEP);
      }

      const surface = supportAt(state.up, {
        footRadius:radius - PLAYER_CENTER_HEIGHT,
        layer:runtime.supportLayer,
      });
      const support = surface.radius + PLAYER_CENTER_HEIGHT;
      runtime.supportKind = surface.kind;
      runtime.supportLayer = surface.layer;
      runtime.swimming = surface.kind === "water";
      if (radius <= support + 0.22) {
        radius = support;
        state.verticalVelocity = 0;
        runtime.grounded = !runtime.swimming;
      } else {
        state.verticalVelocity = Math.max(-24, state.verticalVelocity - 22 * FIXED_STEP);
        radius = Math.max(support, radius + state.verticalVelocity * FIXED_STEP);
        runtime.grounded = radius <= support + 0.005 && !runtime.swimming;
        if (radius === support) state.verticalVelocity = 0;
      }
      copyPoint(runtime.position, state.up.clone().multiplyScalar(radius));
      runtime.interior = activeInteriorAt(runtime.position);
      copyPoint(runtime.up, state.up); copyPoint(runtime.forward, state.forward);
      const geographic = frameAt(Math.atan2(state.up.x, state.up.z), Math.asin(MathUtils.clamp(state.up.y, -1, 1)));
      runtime.heading = Math.atan2(state.forward.dot(geographic.east), state.forward.dot(geographic.north));
      if (!ready.current) { ready.current = true; callbacks.current.onReady(); }
    }

    state.up.set(runtime.up.x, runtime.up.y, runtime.up.z);
    state.forward.set(runtime.forward.x, runtime.forward.y, runtime.forward.z);
    const chart = mapCoordinates(runtime.position);
    const pierTip = PIER_LAYOUT.head.center[1] - PIER_LAYOUT.head.depth / 2;
    const pierProgress = MathUtils.clamp((PIER_LAYOUT.entrance[1] - chart.z) / (PIER_LAYOUT.entrance[1] - pierTip), 0, 1);
    const pierFraming = runtime.supportKind === "pier" ? 0.2 + pierProgress * 0.8 : 0;
    const resortFraming = MathUtils.clamp((chart.z - 101) / 12, 0, 1) * MathUtils.clamp((140 - chart.z) / 14, 0, 1);
    state.summit.copy(SUMMIT_POINT).sub(runtime.position);
    state.summit.addScaledVector(state.up, -state.summit.dot(state.up));
    const summitAhead = state.summit.lengthSq() > 1e-8 ? state.summit.normalize().dot(state.forward) : -1;
    const forwardFraming = MathUtils.clamp((summitAhead - .2) / .65, 0, 1);
    // Vertical right-drag adjusts cameraHeight. Once someone deliberately departs
    // from the default shoulder view, fade out the convenience framing so it
    // never fights their chosen pitch.
    const manualPitchAllowance = MathUtils.clamp(1 - Math.abs(state.cameraHeight - 3) / .6, 0, 1);
    const desiredSummitFraming = runtime.mode === "exploring"
      ? Math.max(pierFraming, resortFraming) * forwardFraming * manualPitchAllowance
      : 0;
    state.summitFraming = runtime.reducedMotion
      ? desiredSummitFraming
      : MathUtils.damp(state.summitFraming, desiredSummitFraming, 3.2, dt);
    state.target.set(runtime.position.x, runtime.position.y, runtime.position.z).addScaledVector(state.up, 0.55);
    state.right.crossVectors(state.forward, state.up).normalize();
    // Keep the visitor just off the center sightline so the raised follow
    // camera can see the mountain and pier landmarks without obscuring input
    // or changing the user's right-drag pitch control.
    state.target.addScaledVector(state.right, 0.55);
    state.cameraDirection.copy(state.forward).multiplyScalar(-CAMERA_FOLLOW_DISTANCE).addScaledVector(state.up, state.cameraHeight).normalize();
    const availableDistance = cameraClearDistance(state.target, state.cameraDirection, CAMERA_FOLLOW_DISTANCE, runtime.interior, runtime.supportLayer);
    runtime.desiredCameraDistance = CAMERA_FOLLOW_DISTANCE;
    if (!state.cameraInitialized || availableDistance < runtime.cameraDistance) runtime.cameraDistance = availableDistance;
    else runtime.cameraDistance = MathUtils.damp(runtime.cameraDistance, availableDistance, 5, dt);
    state.desired.copy(state.target).addScaledVector(state.cameraDirection, runtime.cameraDistance);
    state.look.copy(state.target).addScaledVector(state.forward, 1.2);
    const overview = ["loading", "intro", "overview"].includes(runtime.mode) ? 1 : 0;
    runtime.overviewTransition = runtime.reducedMotion ? overview : MathUtils.damp(runtime.overviewTransition, overview, 3.2, dt);
    if (Math.abs(runtime.overviewTransition - overview) < 0.0005) runtime.overviewTransition = overview;
    // Frame the entire inhabited globe against the narrower field of view. Portrait
    // screens need a much greater distance than landscape to preserve both shores.
    const verticalHalfAngle = MathUtils.degToRad(camera instanceof PerspectiveCamera ? camera.fov : 52) / 2;
    const aspect = camera instanceof PerspectiveCamera ? Math.max(camera.aspect, 0.1) : 1;
    const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);
    const globeDistance = (RADIUS + MAP_MAX_HEIGHT + 4) / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle)) * 1.2;
    state.overview.copy(state.up).addScaledVector(state.forward, -0.23).normalize().multiplyScalar(globeDistance);
    state.desired.lerp(state.overview, runtime.overviewTransition);
    state.look.multiplyScalar(1 - runtime.overviewTransition);
    if (state.summitFraming > .002 && runtime.overviewTransition < .01) {
      const lookDistance = state.look.distanceTo(state.desired);
      state.framingForward.copy(state.look).sub(state.desired).normalize();
      state.cameraRight.crossVectors(state.framingForward, state.up).normalize();
      state.screenUp.crossVectors(state.cameraRight, state.framingForward).normalize();
      state.summit.copy(SUMMIT_POINT).sub(state.desired).normalize();
      const forwardDot = state.summit.dot(state.framingForward);
      if (forwardDot > .05) {
        // Keep the real summit below the top of the actual camera frustum.
        // This only rotates the look target; collision-safe camera placement
        // and the user's right-drag height/heading controls remain unchanged.
        const summitElevation = Math.atan2(state.summit.dot(state.screenUp), forwardDot);
        const safeElevation = verticalHalfAngle * .58;
        const pitch = MathUtils.clamp(summitElevation - safeElevation, 0, .65) * state.summitFraming;
        state.framingForward.applyAxisAngle(state.cameraRight, pitch).normalize();
        state.look.copy(state.desired).addScaledVector(state.framingForward, lookDistance);
      }
    }
    camera.position.copy(state.desired);
    camera.up.copy(state.up);
    camera.lookAt(state.look);
    // Measure the final, real camera matrix rather than reproducing this math
    // in browser tests. This reaches the development-only world debugger below.
    camera.updateMatrixWorld();
    state.summitNdc.copy(SUMMIT_POINT).project(camera);
    const summitVisible = Number.isFinite(state.summitNdc.x) && Number.isFinite(state.summitNdc.y) && Number.isFinite(state.summitNdc.z)
      && Math.abs(state.summitNdc.x) < 1 && Math.abs(state.summitNdc.y) < 1 && state.summitNdc.z > -1 && state.summitNdc.z < 1;
    runtime.landmarkFraming.summitNdc.x = state.summitNdc.x;
    runtime.landmarkFraming.summitNdc.y = state.summitNdc.y;
    runtime.landmarkFraming.summitNdc.z = state.summitNdc.z;
    runtime.landmarkFraming.summitFraming = state.summitFraming;
    runtime.landmarkFraming.summitVisible = summitVisible;
    state.cameraInitialized = true;

    if (avatar.current) {
      // A collision-shortened follow camera otherwise fills the viewport with
      // the visitor. Treat that close range as a clear first-person cutaway;
      // collision, movement, and the normal third-person view are unchanged.
      avatar.current.visible = runtime.cameraDistance >= 1.6;
      const bob = runtime.reducedMotion ? 0 : Math.abs(Math.sin(state.phase)) * 0.045 * state.gait;
      avatar.current.position.set(runtime.position.x, runtime.position.y, runtime.position.z).addScaledVector(state.up, -PLAYER_CENTER_HEIGHT + bob - (runtime.swimming ? 0.48 : 0));
      state.back.copy(state.facing).negate();
      state.right.crossVectors(state.up, state.back).normalize();
      state.matrix.makeBasis(state.right, state.up, state.back);
      avatar.current.quaternion.setFromRotationMatrix(state.matrix);
      const swing = runtime.reducedMotion ? 0 : Math.sin(state.phase) * 0.6 * state.gait;
      if (leftLeg.current) leftLeg.current.rotation.x = swing;
      if (rightLeg.current) rightLeg.current.rotation.x = -swing;
      if (leftArm.current) leftArm.current.rotation.x = -swing * 0.78;
      if (rightArm.current) rightArm.current.rotation.x = swing * 0.78;
    }

    if (runtime.mode === "exploring") {
      const area = areaAt(runtime.position);
      if (area !== state.area) { state.area = area; callbacks.current.onArea?.(area); }
      let nearest: string | null = null;
      let nearestDistance = Infinity;
      for (const hotspot of HOTSPOTS) {
        if (hotspot.interior && hotspot.interior !== runtime.interior) continue;
        const distance = Math.hypot(runtime.position.x - hotspot.position[0], runtime.position.y - hotspot.position[1], runtime.position.z - hotspot.position[2]);
        if (distance <= hotspot.radius && distance < nearestDistance) { nearest = hotspot.id; nearestDistance = distance; }
      }
      if (nearest !== runtime.hotspot) { runtime.hotspot = nearest; callbacks.current.onHotspot(nearest); }
    }
    runtime.counters.drawCalls = gl.info.render.calls;
    runtime.counters.triangles = gl.info.render.triangles;
    runtime.counters.geometries = gl.info.memory.geometries;
    runtime.counters.textures = gl.info.memory.textures;
  });

  return <group ref={avatar} name="visitor">
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <circleGeometry args={[0.4, 24]} /><meshBasicMaterial color="#233a3c" transparent opacity={0.2} depthWrite={false} />
    </mesh>
    <mesh position={[0, 1.13, 0]} castShadow><capsuleGeometry args={[0.285, 0.36, 5, 10]} /><meshToonMaterial color="#eee7d4" /></mesh>
    <mesh position={[0, 1.41, 0.11]} castShadow><sphereGeometry args={[0.26, 10, 8]} /><meshToonMaterial color="#d9d7c9" /></mesh>
    <mesh position={[0, 1.62, -0.015]} castShadow><sphereGeometry args={[0.235, 12, 10]} /><meshToonMaterial color="#c58d6a" /></mesh>
    <mesh position={[0, 1.76, 0]} castShadow><sphereGeometry args={[0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshToonMaterial color="#253f4b" /></mesh>
    <mesh position={[0, 1.765, -0.2]} castShadow><boxGeometry args={[0.38, 0.045, 0.25]} /><meshToonMaterial color="#253f4b" /></mesh>
    {[-0.075, 0.075].map(x => <mesh key={x} position={[x, 1.63, -0.231]}><sphereGeometry args={[0.019, 6, 6]} /><meshToonMaterial color="#28333a" /></mesh>)}
    <mesh position={[0, 1.04, 0.265]} castShadow><boxGeometry args={[0.37, 0.47, 0.16]} /><meshToonMaterial color="#bf7957" /></mesh>
    <mesh position={[0, 1.08, 0.355]}><boxGeometry args={[0.13, 0.04, 0.012]} /><meshToonMaterial color="#f0e6cc" /></mesh>
    <group ref={leftArm} position={[-0.33, 1.31, 0]} rotation={[0, 0, -0.1]}>
      <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.105, 0.27, 4, 8]} /><meshToonMaterial color="#eee7d4" /></mesh>
      <mesh position={[0, -0.41, 0]} castShadow><sphereGeometry args={[0.09, 8, 8]} /><meshToonMaterial color="#c58d6a" /></mesh>
    </group>
    <group ref={rightArm} position={[0.33, 1.31, 0]} rotation={[0, 0, 0.1]}>
      <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.105, 0.27, 4, 8]} /><meshToonMaterial color="#eee7d4" /></mesh>
      <mesh position={[0, -0.41, 0]} castShadow><sphereGeometry args={[0.09, 8, 8]} /><meshToonMaterial color="#c58d6a" /></mesh>
    </group>
    <group ref={leftLeg} position={[-0.15, 0.81, 0]}>
      <mesh position={[0, -0.18, 0]} castShadow><boxGeometry args={[0.265, 0.38, 0.32]} /><meshToonMaterial color="#2c4047" /></mesh>
      <mesh position={[0, -0.51, 0]} castShadow><capsuleGeometry args={[0.085, 0.27, 4, 8]} /><meshToonMaterial color="#c58d6a" /></mesh>
      <mesh position={[0, -0.69, -0.055]} castShadow><boxGeometry args={[0.22, 0.17, 0.37]} /><meshToonMaterial color="#729eab" /></mesh>
      <mesh position={[0, -0.775, -0.055]}><boxGeometry args={[0.225, 0.055, 0.38]} /><meshToonMaterial color="#ece9d7" /></mesh>
    </group>
    <group ref={rightLeg} position={[0.15, 0.81, 0]}>
      <mesh position={[0, -0.18, 0]} castShadow><boxGeometry args={[0.265, 0.38, 0.32]} /><meshToonMaterial color="#2c4047" /></mesh>
      <mesh position={[0, -0.51, 0]} castShadow><capsuleGeometry args={[0.085, 0.27, 4, 8]} /><meshToonMaterial color="#c58d6a" /></mesh>
      <mesh position={[0, -0.69, -0.055]} castShadow><boxGeometry args={[0.22, 0.17, 0.37]} /><meshToonMaterial color="#729eab" /></mesh>
      <mesh position={[0, -0.775, -0.055]}><boxGeometry args={[0.225, 0.055, 0.38]} /><meshToonMaterial color="#ece9d7" /></mesh>
    </group>
  </group>;
}
