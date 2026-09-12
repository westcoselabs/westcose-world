import type { WorldRuntimeState } from "./types";

export const MOVEMENT_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
  "ShiftLeft", "ShiftRight",
]);

/** Forms, links and controls keep their ordinary browser keyboard behavior. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"]',
  ));
}

export function clearWorldInput(runtime: WorldRuntimeState): void {
  runtime.keys.clear();
  runtime.touch.x = 0;
  runtime.touch.y = 0;
  runtime.touch.active = false;
  runtime.pointer.active = false;
}
