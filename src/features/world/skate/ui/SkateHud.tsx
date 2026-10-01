'use client';

import { useEffect, useRef, useState } from 'react';
import type { SkateLetterId, SkateSession } from '../../runtime/skate-session';
import type { SkatePopup } from '../tricks';

const LETTERS: readonly SkateLetterId[] = ['S', 'K', 'A', 'T', 'E'];
export const formatPoints = (value: number) => Math.round(value).toLocaleString('en-US');
export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Skateboard HUD outside the canvas: score, the live combo, grind and manual balance,
 * the S.K.A.T.E. letters and clock, trick popups and touch controls. The controller writes a
 * snapshot every frame; this copies it into the DOM from its own animation frame. */
export default function SkateHud({ session, coarse, onStartGame }: { session: SkateSession; coarse: boolean; onStartGame: () => void }) {
  const sessionRef = useRef(session);
  const score = useRef<HTMLSpanElement>(null), combo = useRef<HTMLDivElement>(null), comboPoints = useRef<HTMLSpanElement>(null), comboTricks = useRef<HTMLSpanElement>(null);
  const balance = useRef<HTMLDivElement>(null), balanceMarker = useRef<HTMLSpanElement>(null), balanceLabel = useRef<HTMLSpanElement>(null);
  const game = useRef<HTMLDivElement>(null), clock = useRef<HTMLSpanElement>(null), letters = useRef<(HTMLSpanElement | null)[]>([]);
  const center = useRef<HTMLDivElement>(null), speed = useRef<HTMLElement>(null), charge = useRef<HTMLSpanElement>(null), live = useRef<HTMLSpanElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const pad = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const session = sessionRef.current;
    let frame = 0;
    const last = new Map<HTMLElement, string>();
    const text = (element: HTMLElement | null, value: string) => { if (element && last.get(element) !== value) { element.textContent = value; last.set(element, value); } };
    const styles = new Map<HTMLElement, Map<string, string>>();
    const style = (element: HTMLElement | null, property: string, value: string) => {
      if (!element) return;
      const known = styles.get(element) ?? new Map<string, string>();
      if (known.get(property) !== value) { element.style.setProperty(property, value); known.set(property, value); styles.set(element, known); }
    };
    const show = (popup: SkatePopup) => {
      const host = center.current;
      if (!host) return;
      const element = document.createElement('div');
      element.className = `hud-popup popup-${popup.kind}${/^\d$|^GO!$/.test(popup.text) ? ' popup-count' : ''}`;
      const label = document.createElement('strong'); label.textContent = popup.text; element.append(label);
      if (popup.points !== undefined) { const points = document.createElement('span'); points.textContent = `+${formatPoints(popup.points)}`; element.append(points); }
      host.append(element);
      while (host.children.length > 3) host.firstElementChild?.remove();
      window.setTimeout(() => element.remove(), popup.kind === 'trick' ? 1100 : 1800);
      if (popup.kind !== 'trick' && live.current) live.current.textContent = `${popup.text}${popup.points ? ` ${formatPoints(popup.points)} points` : ''}`;
    };
    const tick = () => {
      const hud = session.hud;
      text(score.current, formatPoints(hud.score));
      const names = [...hud.comboTricks, ...hud.airTricks];
      style(combo.current, 'opacity', names.length ? '1' : '0');
      text(comboPoints.current, hud.comboTricks.length ? `${formatPoints(hud.comboBase)} × ${hud.comboMultiplier}` : '');
      text(comboTricks.current, names.slice(-5).join(' + '));
      style(balance.current, 'opacity', hud.balance === null ? '0' : '1');
      style(balanceMarker.current, 'left', `${(50 + Math.max(-1, Math.min(1, hud.balance ?? 0)) * 50).toFixed(1)}%`);
      style(balanceMarker.current, '--danger', String(Math.min(1, Math.abs(hud.balance ?? 0))));
      text(balanceLabel.current, hud.balanceKind === 'manual' ? 'MANUAL · ↑ / ↓ TO BALANCE' : 'GRIND · ← / → TO BALANCE');
      const playing = hud.game.phase === 'countdown' || hud.game.phase === 'playing';
      style(game.current, 'display', playing || hud.game.phase === 'finished' ? 'flex' : 'none');
      text(clock.current, formatClock(hud.game.phase === 'countdown' ? 120 : hud.game.time));
      style(clock.current, 'color', hud.game.phase === 'playing' && hud.game.time < 15 ? '#f0a47a' : '');
      LETTERS.forEach((id, i) => { const element = letters.current[i]; if (element) element.classList.toggle('is-got', hud.game.letters[id]); });
      text(speed.current, String(Math.round(hud.speed * 3.6)));
      style(charge.current, 'transform', `scaleX(${hud.charge.toFixed(3)})`);
      style(start.current, 'display', hud.nearGame ? 'flex' : 'none');
      while (session.popups.length) show(session.popups.shift()!);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const setTouch = (x: number, y: number, active: boolean) => {
    const touch = sessionRef.current.touch;
    touch.x = x; touch.y = y; touch.active = active;
    setStick({ x: x * 34, y: -y * 34 });
  };
  const padMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const anchor = pad.current;
    if (!anchor || anchor.id !== event.pointerId) return;
    const dx = event.clientX - anchor.x, dy = event.clientY - anchor.y, length = Math.max(40, Math.hypot(dx, dy));
    setTouch(dx / length, -dy / length, true);
  };
  const padStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    pad.current = { id: event.pointerId, x: box.left + box.width / 2, y: box.top + box.height / 2 };
    padMove(event);
  };
  const padEnd = () => { pad.current = null; setTouch(0, 0, false); };
  const hold = (key: 'jump' | 'grab', value: boolean) => { sessionRef.current.touch[key] = value; };
  const tap = (key: 'flip' | 'grind' | 'manual') => { sessionRef.current.touch[key] = true; };
  const holdButton = (key: 'jump' | 'grab', label: string, className: string, testId: string, aria: string) => <button className={`hud-button ${className}`} data-testid={testId} aria-label={aria}
    onPointerDown={event => { event.preventDefault(); hold(key, true); }} onPointerUp={() => hold(key, false)} onPointerCancel={() => hold(key, false)} onPointerLeave={() => hold(key, false)}>{label}</button>;
  const tapButton = (key: 'flip' | 'grind' | 'manual', label: string, className: string, testId: string, aria: string) => <button className={`hud-button ${className}`} data-testid={testId} aria-label={aria}
    onPointerDown={event => { event.preventDefault(); tap(key); }}>{label}</button>;

  return <div className="snowboard-hud skate-hud" aria-label="Skateboard">
    <div className="hud-score">
      <span className="hud-label">SCORE</span>
      <span ref={score} className="hud-points" data-testid="skate-score">0</span>
    </div>
    <div ref={game} className="skate-game" style={{ display: 'none' }} aria-label="Game of S.K.A.T.E.">
      <span className="skate-letters">{LETTERS.map((id, i) => <span key={id} ref={element => { letters.current[i] = element; }} data-letter={id}>{id}</span>)}</span>
      <span ref={clock} className="skate-clock">2:00</span>
    </div>
    <div ref={combo} className="hud-combo skate-combo" style={{ opacity: 0 }}>
      <span ref={comboPoints} className="hud-combo-points" />
      <span ref={comboTricks} className="hud-combo-tricks" />
    </div>
    <div ref={center} className="hud-center" />
    <div ref={balance} className="skate-balance" style={{ opacity: 0 }} aria-hidden="true">
      <span className="skate-balance-track"><span ref={balanceMarker} className="skate-balance-marker" /></span>
      <span ref={balanceLabel} className="skate-balance-label" />
    </div>
    <div className="hud-stats skate-stats">
      <span><b ref={speed}>0</b><small>KM/H</small></span>
      <span className="hud-charge" aria-hidden="true"><span ref={charge} /></span>
    </div>
    <button ref={start} className="skate-start" style={{ display: 'none' }} data-testid="skate-start-game" onClick={onStartGame}><kbd>E</kbd><span>Start Game of S.K.A.T.E.</span></button>
    {!coarse && <div className="hud-keys skate-keys">↑ push · ←/→ turn · ↓ brake · Space ollie <span>· J flip · K grab · L grind · ↑↓ manual · hold ↑ at a lip to air out ·</span> B board off · Esc pause</div>}
    {coarse && <>
      <div className="hud-pad" data-testid="skate-pad" role="group" aria-label="Drag to steer, up to push, down to brake"
        onPointerDown={padStart} onPointerMove={padMove} onPointerUp={padEnd} onPointerCancel={padEnd} onLostPointerCapture={padEnd}>
        <span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </div>
      {holdButton('jump', 'Ollie', 'hud-jump', 'skate-ollie', 'Ollie: hold to crouch, release to pop')}
      {tapButton('flip', 'Flip', 'skate-flip', 'skate-flip', 'Flip trick')}
      {holdButton('grab', 'Grab', 'hud-grab', 'skate-grab', 'Grab: hold in the air')}
      {tapButton('grind', 'Grind', 'skate-grind', 'skate-grind', 'Grind: near a rail, ledge or coping')}
      {tapButton('manual', 'Manual', 'skate-manual', 'skate-manual', 'Manual')}
    </>}
    <span ref={live} className="sr-only" aria-live="polite" />
  </div>;
}
