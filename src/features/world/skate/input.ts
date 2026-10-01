/** Skateboard controls in the classic arcade layout: arrows or WASD turn, push and brake;
 * Space ollies (hold to crouch), J flips, K grabs, L grinds; tap up then down for a
 * manual (down then up for a nose manual). The stick direction picks each trick. */
import type { SkateSession } from '../runtime/skate-session';
import type { SkateInput } from './physics';
import type { ManualId } from './tricks';
import { SKATE } from './tuning';

export const SKATE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'ShiftRight',
]);
const UP = ['KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown'];

export class SkateInputReader {
  private clock = 0;
  private lastUpTap = -9;
  private lastDownTap = -9;
  private grindUntil = -9;

  read(session: SkateSession, dt: number): SkateInput {
    this.clock += dt;
    const keys = session.keys, pressed = session.pressed, touch = session.touch;
    const has = (code: string) => keys.has(code);
    const tapped = (codes: readonly string[]) => codes.some(code => pressed.has(code));
    let steer = Number(has('KeyD') || has('ArrowRight')) - Number(has('KeyA') || has('ArrowLeft'));
    let lean = Number(has('KeyW') || has('ArrowUp')) - Number(has('KeyS') || has('ArrowDown'));
    if (touch.active) { steer += touch.x; lean += touch.y; }
    steer = Math.max(-1, Math.min(1, steer)); lean = Math.max(-1, Math.min(1, lean));

    // Up-down and down-up taps inside the window are manuals.
    let manual: ManualId | null = touch.manual ? 'manual' : null;
    if (tapped(DOWN)) { if (this.clock - this.lastUpTap < SKATE.manualWindow) manual = 'manual'; this.lastDownTap = this.clock; }
    if (tapped(UP)) { if (this.clock - this.lastDownTap < SKATE.manualWindow) manual = 'nose'; this.lastUpTap = this.clock; }
    if (manual) { this.lastUpTap = -9; this.lastDownTap = -9; }
    // A grind request stays live briefly, so pressing it just before the rail still catches.
    if (pressed.has('KeyL') || touch.grind) this.grindUntil = this.clock + .22;
    const input: SkateInput = {
      steer, lean,
      push: lean > .5 || has('ShiftLeft') || has('ShiftRight'),
      brake: lean < -.5,
      jump: has('Space') || touch.jump,
      flip: pressed.has('KeyJ') || touch.flip,
      grab: has('KeyK') || touch.grab,
      grind: this.clock <= this.grindUntil,
      manual,
    };
    pressed.clear();
    touch.flip = false; touch.grind = false; touch.manual = false;
    return session.testInput ? { ...input, ...session.testInput } : input;
  }

  /** A caught rail consumes the buffered request. */
  consumeGrind() { this.grindUntil = -9; }
  reset() { this.lastUpTap = -9; this.lastDownTap = -9; this.grindUntil = -9; }
}
