"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { HOTSPOTS } from "../data/hotspots";
import { areaAt, frameAt, RADIUS } from "../data/planet";
import { MAP_MAX_HEIGHT, MAP_SUMMIT, mapPoint } from "../data/world-map";
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
/** Arrow-key turning, radians per second. */
const TURN_RATE = 2.5;
/** Walking forward eases the camera back behind the visitor; a mouse orbit pauses that. */
const CAMERA_FOLLOW_RATE = 1.4;
const ORBIT_HOLD = 1.6;
const ZOOM_RANGE = [.6, 1.7] as const;
/** Globe view raises the near plane so the shoreline keeps depth precision at distance. */
const OVERVIEW_NEAR = 12;
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
  const backBoard = useRef<Group>(null);
  const callbacks = useRef({ onReady, onHotspot, onArea });
  const ready = useRef(false);
  const pointer = useRef<{ id: number; look: boolean; x: number; y: number } | null>(null);
  const { camera, gl } = useThree();
  const simulation = useRef({
    accumulator: 0, verticalVelocity: 0, inputActive: false, cameraInitialized: false,
    lastMode: runtime.mode, area: "", phase: 0, gait: 0, cameraHeight: 3.0, zoom: 1, orbitHold: 0,
    up: new Vector3(), forward: new Vector3(), right: new Vector3(), wish: new Vector3(),
    inputForward: new Vector3(runtime.forward.x, runtime.forward.y, runtime.forward.z),
    facing: new Vector3(runtime.forward.x, runtime.forward.y, runtime.forward.z),
    target: new Vector3(), look: new Vector3(), desired: new Vector3(), cameraDirection: new Vector3(),
    summitNdc: new Vector3(), summitFraming: 0,
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
      // A mouse drag looks around, like other desktop games; touch and pen drag to walk.
      const look = event.pointerType === "mouse" || event.button === 2;
      pointer.current = { id: event.pointerId, look, x: event.clientX, y: event.clientY };
      runtime.pointer = { x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, active: !look };
      runtime.touch = { x: 0, y: 0, active: !look };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const held = pointer.current;
      if (!held || held.id !== event.pointerId || runtime.mode !== "exploring") return;
      event.preventDefault();
      if (held.look) {
        const state = simulation.current;
        state.up.set(runtime.up.x, runtime.up.y, runtime.up.z);
        state.rotation.setFromAxisAngle(state.up, -(event.clientX - held.x) * 0.005);
        state.forward.set(runtime.forward.x, runtime.forward.y, runtime.forward.z).applyQuaternion(state.rotation);
        state.inputForward.applyQuaternion(state.rotation);
        copyPoint(runtime.forward, state.forward);
        state.cameraHeight = MathUtils.clamp(state.cameraHeight + (event.clientY - held.y) * 0.025, 1.6, 5.5);
        state.orbitHold = ORBIT_HOLD;
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
    const wheel = (event: WheelEvent) => {
      if (runtime.mode !== "exploring") return;
      event.preventDefault();
      const state = simulation.current;
      state.zoom = MathUtils.clamp(state.zoom * Math.exp(event.deltaY * 0.0012), ZOOM_RANGE[0], ZOOM_RANGE[1]);
    };
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", "WestCose planet. W A S D or the arrow keys walk; left and right arrows turn. Drag with the mouse to look around; on touch screens, drag to walk.");
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
    canvas.addEventListener("wheel", wheel, { passive: false });
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
      canvas.removeEventListener("wheel", wheel);
    };
  }, [gl, runtime]);

  useFrame((frame, delta) => {
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

    // A snowboard run, the skateboard or a tide owns the camera and hides the walker; a run or
    // a tide leaves the walker waiting where it began, while the skateboard carries it along.
    if (runtime.snowboard.active || runtime.skate.riding || runtime.fishing.active) {
      if (avatar.current) avatar.current.visible = false;
      state.cameraInitialized = false; state.accumulator = 0; state.inputActive = false;
      runtime.counters.drawCalls = gl.info.render.calls;
      runtime.counters.triangles = gl.info.render.triangles;
      return;
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
      const strafe = moving ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0;
      const turn = moving ? Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")) : 0;
      const advance = moving ? Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")) : 0;
      // Touch drag keeps its chase camera; the keyboard walks relative to a steady camera.
      const chase = moving && runtime.touch.active;
      const x = strafe + (chase ? runtime.touch.x : 0);
      const y = advance + (chase ? runtime.touch.y : 0);
      state.orbitHold = Math.max(0, state.orbitHold - FIXED_STEP);
      if (turn !== 0) {
        // Arrow turning swings the visitor and the camera together, as in classic keyboard games.
        state.rotation.setFromAxisAngle(state.up, -turn * TURN_RATE * FIXED_STEP);
        state.forward.applyQuaternion(state.rotation).normalize();
        state.facing.applyQuaternion(state.rotation).normalize();
        state.inputForward.applyQuaternion(state.rotation).normalize();
      }
      const inputLength = Math.hypot(x, y);
      if (inputLength > 0.025) {
        if (!state.inputActive || !chase) state.inputForward.copy(state.forward);
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
          // A touch gesture latches and transports its input basis: holding diagonally
          // traces a geodesic instead of feeding camera turn back into endless circles.
          // The keyboard camera only eases in behind forward walking, never flips on S.
          // Rotate within the tangent plane, including the exact 180-degree reverse case.
          let angle = Math.atan2(state.right.crossVectors(state.forward, state.wish).dot(state.up), state.forward.dot(state.wish));
          const follow = chase ? 4.5 : state.orbitHold > 0 ? 0 : CAMERA_FOLLOW_RATE * Math.max(0, Math.min(1, y));
          state.forward.applyAxisAngle(state.up, angle * (1 - Math.exp(-follow * FIXED_STEP))).normalize();
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
    // The radius-72 planet hides the summit from the pier and resort, so there is no
    // summit-framing assist; the follow camera always keeps the user's own pitch.
    state.summitFraming = 0;
    state.target.set(runtime.position.x, runtime.position.y, runtime.position.z).addScaledVector(state.up, 0.55);
    state.right.crossVectors(state.forward, state.up).normalize();
    // Keep the visitor just off the center sightline so the raised follow
    // camera can see ahead without obscuring input or the user's right-drag pitch.
    state.target.addScaledVector(state.right, 0.55);
    const followDistance = CAMERA_FOLLOW_DISTANCE * state.zoom;
    state.cameraDirection.copy(state.forward).multiplyScalar(-followDistance).addScaledVector(state.up, state.cameraHeight * state.zoom).normalize();
    const availableDistance = cameraClearDistance(state.target, state.cameraDirection, followDistance, runtime.interior, runtime.supportLayer);
    runtime.desiredCameraDistance = followDistance;
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
    const lens = frame.camera;
    if (lens instanceof PerspectiveCamera) {
      const near = MathUtils.lerp(0.08, OVERVIEW_NEAR, runtime.overviewTransition ** 2);
      if (Math.abs(lens.near - near) > 1e-4) { lens.near = near; lens.updateProjectionMatrix(); }
    }
    camera.position.copy(state.desired);
    camera.up.copy(state.up);
    camera.lookAt(state.look);
    const review = runtime.debugCamera;
    if (review) {
      camera.position.set(review.position.x, review.position.y, review.position.z);
      camera.up.set(review.up.x, review.up.y, review.up.z);
      camera.lookAt(review.target.x, review.target.y, review.target.z);
    }
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

    if (backBoard.current) backBoard.current.visible = runtime.skate.owned;
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
    {/* The skate-shop board rides strapped to the pack once the visitor has one. */}
    <group ref={backBoard} position={[0, 1.02, 0.39]} rotation={[0.12, 0, 0.18]} visible={false}>
      <mesh castShadow><boxGeometry args={[0.2, 0.78, 0.022]} /><meshToonMaterial color="#c9ae86" /></mesh>
      <mesh position={[0, 0, 0.013]}><boxGeometry args={[0.18, 0.7, 0.006]} /><meshToonMaterial color="#bf5f3f" /></mesh>
      {[-0.24, 0.24].map(y => <mesh key={y} position={[0, y, 0.045]}><boxGeometry args={[0.2, 0.05, 0.05]} /><meshToonMaterial color="#efe6cf" /></mesh>)}
      <mesh position={[0, 0.05, -0.02]}><boxGeometry args={[0.24, 0.05, 0.03]} /><meshToonMaterial color="#2c4047" /></mesh>
    </group>
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
