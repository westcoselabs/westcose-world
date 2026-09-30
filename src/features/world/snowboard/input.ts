/** Snowboard controls: keyboard codes and the merge of keyboard, touch and test input. */
import type { BoardInput, GrabId } from './physics';
import type { SnowboardSession } from '../runtime/snowboard-session';

export const SNOWBOARD_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'ShiftRight',
]);
const GRAB_KEYS: readonly [string, GrabId][] = [['KeyJ', 'indy'], ['KeyK', 'melon'], ['KeyL', 'method']];

/** In the air, tuck/brake become flips only after being pressed again, so a rider who
 * tucks into a kicker does not flip by accident. */
export class InputReader {
  private flipArmed = false;
  private wasAirborne = false;

  read(session: SnowboardSession, airborne: boolean): BoardInput {
    const keys = session.keys, touch = session.touch;
    const has = (code: string) => keys.has(code);
    let steer = Number(has('KeyD') || has('ArrowRight')) - Number(has('KeyA') || has('ArrowLeft'));
    let forward = Number(has('KeyW') || has('ArrowUp')) - Number(has('KeyS') || has('ArrowDown'));
    if (touch.active) { steer += touch.x; forward += touch.y; }
    steer = Math.max(-1, Math.min(1, steer));
    const tuck = forward > .5 || has('ShiftLeft') || has('ShiftRight'), brake = forward < -.5;
    if (airborne !== this.wasAirborne) { this.flipArmed = false; this.wasAirborne = airborne; }
    if (airborne && Math.abs(forward) <= .5) this.flipArmed = true;
    let grab: GrabId | null = null;
    for (const [code, id] of GRAB_KEYS) if (has(code)) { grab = id; break; }
    if (!grab && touch.grab) grab = forward < -.5 ? 'melon' : forward > .5 ? 'method' : 'indy';
    const input: BoardInput = {
      steer, tuck: tuck && !airborne, brake: brake && !airborne,
      jump: has('Space') || touch.jump,
      grab,
      flip: airborne && this.flipArmed ? (forward > .5 ? 1 : forward < -.5 ? -1 : 0) : 0,
    };
    return session.testInput ? { ...input, ...session.testInput } : input;
  }

  reset() { this.flipArmed = false; this.wasAirborne = false; }
}
