'use client';

import { useEffect, useRef, useState } from 'react';
import { skiRunById } from '../../data/ski-runs';
import type { SnowboardSession } from '../../runtime/snowboard-session';
import { formatMultiplier, formatPoints, formatTime, type Popup } from '../scoring';
import DifficultyBadge from './DifficultyBadge';

const TOAST_KINDS = new Set<Popup['kind']>(['gate', 'miss', 'token', 'near', 'multiplier']);

/** Run HUD outside the canvas. The controller writes a snapshot every frame; this
 * component copies it into the DOM from its own animation frame, never re-rendering React. */
export default function SnowboardHud({ session, coarse }: { session: SnowboardSession; coarse: boolean }) {
  const sessionRef = useRef(session);
  const [run] = useState(() => session.hud.runId ? skiRunById(session.hud.runId) : null);
  const time = useRef<HTMLSpanElement>(null), score = useRef<HTMLSpanElement>(null), multiplier = useRef<HTMLSpanElement>(null);
  const flow = useRef<HTMLSpanElement>(null), progress = useRef<HTMLSpanElement>(null), speed = useRef<HTMLElement>(null);
  const tokens = useRef<HTMLElement>(null), gates = useRef<HTMLElement>(null), combo = useRef<HTMLDivElement>(null);
  const comboPoints = useRef<HTMLSpanElement>(null), comboTricks = useRef<HTMLSpanElement>(null), warning = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null), toasts = useRef<HTMLDivElement>(null), live = useRef<HTMLSpanElement>(null), charge = useRef<HTMLSpanElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const pad = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const session = sessionRef.current;
    let frame = 0;
    const last = new Map<HTMLElement, string>();
    const text = (element: HTMLElement | null, value: string) => {
      if (element && last.get(element) !== value) { element.textContent = value; last.set(element, value); }
    };
    const styles = new Map<string, string>();
    const style = (element: HTMLElement | null, property: string, value: string) => {
      if (!element) return;
      const key = `${element.className}:${property}`;
      if (styles.get(key) !== value) { element.style.setProperty(property, value); styles.set(key, value); }
    };
    const show = (popup: Popup) => {
      const toast = TOAST_KINDS.has(popup.kind);
      const host = toast ? toasts.current : center.current;
      if (!host) return;
      const element = document.createElement('div');
      element.className = `hud-popup popup-${popup.kind}${/^\d$|^GO$/.test(popup.text) ? ' popup-count' : ''}`;
      const label = document.createElement('strong'); label.textContent = popup.text; element.append(label);
      if (popup.points !== undefined) { const points = document.createElement('span'); points.textContent = `${popup.points > 0 ? '+' : ''}${formatPoints(popup.points)}`; element.append(points); }
      if (popup.detail) { const detail = document.createElement('small'); detail.textContent = popup.detail; element.append(detail); }
      host.append(element);
      while (host.children.length > (toast ? 4 : 3)) host.firstElementChild?.remove();
      window.setTimeout(() => element.remove(), toast ? 1500 : 1900);
      if ((popup.kind === 'trick' || popup.kind === 'bank' || popup.text === 'FINISH') && live.current) {
        live.current.textContent = `${popup.text}${popup.points ? ` ${formatPoints(popup.points)} points` : ''}`;
      }
    };
    const tick = () => {
      const hud = session.hud;
      text(time.current, formatTime(hud.time));
      text(score.current, formatPoints(hud.score));
      text(multiplier.current, `×${formatMultiplier(hud.multiplier)}`);
      style(multiplier.current, '--heat', String(Math.min(1, (hud.multiplier - 1) / 4)));
      style(flow.current, 'transform', `scaleX(${hud.flow.toFixed(3)})`);
      style(progress.current, 'transform', `scaleX(${hud.progress.toFixed(3)})`);
      text(speed.current, String(Math.round(hud.speed * 3.6)));
      text(tokens.current, `${hud.tokens}/${hud.tokenTotal}`);
      text(gates.current, `${hud.gates}/${hud.gateTotal}`);
      style(combo.current, 'opacity', hud.combo > 0 ? '1' : '0');
      text(comboPoints.current, `${formatPoints(hud.combo)} ×${formatMultiplier(hud.multiplier)}`);
      text(comboTricks.current, hud.comboTricks);
      style(warning.current, 'opacity', hud.offCourse > .15 ? '1' : '0');
      style(charge.current, 'transform', `scaleX(${hud.charge.toFixed(3)})`);
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

  return <div className="snowboard-hud" aria-label="Snowboard run">
    <div className="hud-run">
      {run && <DifficultyBadge difficulty={run.difficulty} size="small" />}
      <span><strong>{run?.name}</strong><small>{run?.rating}</small></span>
    </div>
    <div className="hud-clock">
      <span ref={time} className="hud-time">0:00.0</span>
      <span className="hud-track"><span ref={progress} /></span>
    </div>
    <div className="hud-score">
      <span className="hud-label">SCORE</span>
      <span ref={score} className="hud-points">0</span>
      <span className="hud-multiplier-row"><span ref={multiplier} className="hud-multiplier">×1</span><span className="hud-flow"><span ref={flow} /></span></span>
    </div>
    <div ref={combo} className="hud-combo" style={{ opacity: 0 }}>
      <span className="hud-label">COMBO</span>
      <span ref={comboPoints} className="hud-combo-points" />
      <span ref={comboTricks} className="hud-combo-tricks" />
    </div>
    <div ref={center} className="hud-center" />
    <div ref={toasts} className="hud-toasts" />
    <div ref={warning} className="hud-warning" style={{ opacity: 0 }} role="status">Return to the run</div>
    <div className="hud-stats">
      <span><b ref={speed}>0</b><small>KM/H</small></span>
      <span><b ref={tokens}>0/0</b><small>TOKENS</small></span>
      {run && run.gates.length > 0 && <span><b ref={gates}>0/0</b><small>GATES</small></span>}
      <span className="hud-charge" aria-hidden="true"><span ref={charge} /></span>
    </div>
    {!coarse && <div className="hud-keys">A/D carve · W tuck · S brake · Space ollie <span>· in the air: A/D spin · W/S flip · J/K/L grab ·</span> R restart · Esc pause</div>}
    {coarse && <>
      <div className="hud-pad" data-testid="snowboard-pad" role="group" aria-label="Drag to steer, up to tuck, down to brake"
        onPointerDown={padStart} onPointerMove={padMove} onPointerUp={padEnd} onPointerCancel={padEnd} onLostPointerCapture={padEnd}>
        <span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </div>
      <button className="hud-button hud-jump" data-testid="snowboard-jump" aria-label="Jump: hold to crouch, release to ollie"
        onPointerDown={event => { event.preventDefault(); hold('jump', true); }} onPointerUp={() => hold('jump', false)} onPointerCancel={() => hold('jump', false)} onPointerLeave={() => hold('jump', false)}>Jump</button>
      <button className="hud-button hud-grab" data-testid="snowboard-grab" aria-label="Grab: hold in the air"
        onPointerDown={event => { event.preventDefault(); hold('grab', true); }} onPointerUp={() => hold('grab', false)} onPointerCancel={() => hold('grab', false)} onPointerLeave={() => hold('grab', false)}>Grab</button>
    </>}
    <span ref={live} className="sr-only" aria-live="polite" />
  </div>;
}
