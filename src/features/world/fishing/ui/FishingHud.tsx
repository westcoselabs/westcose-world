'use client';

import { useEffect, useRef, useState } from 'react';
import type { FishingPopup, FishingSession } from '../../runtime/fishing-session';
import { catchName, formatClams, formatWeight, tierName } from '../format';
import { GARY_LINES, GARY_SUN_LINE, speciesById, TIERS, TOP_TIER, type MoveKind } from '../species';
import { canBait, type Catch } from '../tide';
import { FISHING as T } from '../tuning';

const TOASTS = new Set<FishingPopup['kind']>(['info']);
const TELL_TEXT: Partial<Record<MoveKind, string>> = { run: 'RUN!', dive: 'DIVE!', jump: 'JUMP · BOW!', roll: 'ROLL!', playDead: 'PLAYING DEAD…', taunt: 'TAUNTING' };
const HINTS: Record<string, [keys: string, touch: string]> = {
  cast: ['Hold SPACE to cast. Let go in the gold band for a bullseye. A/D aims.', 'Hold the round button to cast. Let go in the gold band. Drag the pad to aim.'],
  aim: ['Let go in the gold band…', 'Let go in the gold band…'],
  wait: ['Watch the bobber. Wait for the CHOMP.', 'Watch the bobber. Wait for the CHOMP.'],
  nibble: ['Nibbles… not yet.', 'Nibbles… not yet.'],
  strike: ['CHOMP! Press SPACE now!', 'CHOMP! Tap the button now!'],
  fight: ['Hold SPACE to reel. Let go when it runs or dives. A/D steers against bolts. S bows to a jump.', 'Hold the button to reel. Let go when it runs or dives. Drag against bolts; pull down to bow.'],
  decide: ['E keeps it. SPACE hooks it back on as bait for something bigger.', 'Keep it, or use it as bait for something bigger.'],
};
const PROMPTS: Record<string, [keys: string, touch: string]> = {
  ready: ['Hold SPACE to cast', 'Hold to cast'], charging: ['Let go to cast', 'Let go to cast'], casting: ['', ''],
  waiting: ['Wait for the CHOMP', 'Wait for the CHOMP'], nibble: ['Not yet…', 'Not yet…'], bite: ['STRIKE!', 'STRIKE!'],
  fight: ['', ''], catch: ['', ''], recover: ['Reeling in…', 'Reeling in…'], gag: ['', ''], over: ['That’s the tide', 'That’s the tide'],
};

/** Tide HUD outside the canvas. The controller writes a snapshot every frame; this component
 * copies it into the DOM from its own animation frame, and re-renders React only when a new
 * catch comes up on the card. */
export default function FishingHud({ session, coarse, sunKnown }: { session: FishingSession; coarse: boolean; sunKnown: boolean }) {
  const sessionRef = useRef(session);
  const worms = useRef<HTMLSpanElement>(null), cooler = useRef<HTMLElement>(null), clams = useRef<HTMLElement>(null), live = useRef<HTMLDivElement>(null);
  const ladder = useRef<HTMLOListElement>(null), prompt = useRef<HTMLDivElement>(null), hint = useRef<HTMLDivElement>(null);
  const cast = useRef<HTMLDivElement>(null), charge = useRef<HTMLSpanElement>(null), bite = useRef<HTMLSpanElement>(null), biteBar = useRef<HTMLDivElement>(null);
  const fight = useRef<HTMLDivElement>(null), fishName = useRef<HTMLElement>(null), fishTier = useRef<HTMLElement>(null), tension = useRef<HTMLSpanElement>(null);
  const stamina = useRef<HTMLSpanElement>(null), distance = useRef<HTMLElement>(null), tell = useRef<HTMLDivElement>(null), ink = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null), bubble = useRef<HTMLDivElement>(null), center = useRef<HTMLDivElement>(null), toasts = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null), announce = useRef<HTMLSpanElement>(null), garyRing = useRef<SVGCircleElement>(null), garyLine = useRef<HTMLElement>(null), primaryLabel = useRef<HTMLSpanElement>(null);
  const [card, setCard] = useState<Catch | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const pad = useRef<{ id: number; x: number; y: number; bowed: boolean } | null>(null);

  useEffect(() => {
    const session = sessionRef.current;
    let frame = 0, shownCard = -1;
    const last = new Map<Element, string>();
    const text = (element: Element | null, value: string) => { if (element && last.get(element) !== value) { element.textContent = value; last.set(element, value); } };
    const styles = new Map<string, string>();
    const style = (element: HTMLElement | SVGElement | null, property: string, value: string) => {
      if (!element) return;
      const key = `${element.getAttribute('data-hud') ?? element.className}:${property}`;
      if (styles.get(key) !== value) { element.style.setProperty(property, value); styles.set(key, value); }
    };
    const show = (popup: FishingPopup) => {
      const toast = TOASTS.has(popup.kind), host = toast ? toasts.current : center.current;
      if (!host) return;
      const element = document.createElement('div');
      element.className = `hud-popup popup-${popup.kind === 'bad' ? 'lost' : popup.kind === 'good' ? 'bank' : popup.kind} fish-pop-${popup.kind}`;
      const label = document.createElement('strong'); label.textContent = popup.text; element.append(label);
      if (popup.detail) { const detail = document.createElement('small'); detail.textContent = popup.detail; element.append(detail); }
      host.append(element);
      while (host.children.length > (toast ? 3 : 2)) host.firstElementChild?.remove();
      window.setTimeout(() => element.remove(), toast ? 2200 : 2000);
      if (announce.current && popup.kind !== 'info') announce.current.textContent = `${popup.text}${popup.detail ? `. ${popup.detail}` : ''}`;
    };
    const tick = () => {
      const hud = session.hud, phase = hud.phase, touchy = coarse ? 1 : 0;
      if (root.current && root.current.dataset.phase !== phase) root.current.dataset.phase = phase;
      text(worms.current, '●'.repeat(Math.max(0, hud.worms)) || '–');
      text(cooler.current, String(hud.cooler));
      text(clams.current, formatClams(hud.clams));
      text(live.current, hud.live ? `LIVE BAIT · ${catchName(hud.live.species)} → ${hud.live.tier + 1 >= TOP_TIER && !sunKnown ? '???' : tierName(hud.live.tier + 1)}` : '');
      style(live.current, 'opacity', hud.live ? '1' : '0');
      // The food chain ladder lights the tier the bait on the hook will draw.
      const target = hud.fish ? hud.fishTier : hud.live ? hud.live.tier + 1 : 0;
      if (ladder.current) Array.from(ladder.current.children).forEach((rung, i) => {
        const tier = TIERS.length - 1 - i;
        rung.classList.toggle('is-target', tier === target);
        rung.classList.toggle('is-climbed', hud.live !== null && tier <= hud.live.tier);
      });
      text(prompt.current, PROMPTS[phase]?.[touchy] ?? '');
      style(prompt.current, 'opacity', PROMPTS[phase]?.[touchy] ? '1' : '0');
      style(prompt.current, '--strike', phase === 'bite' ? '1' : '0');
      text(hint.current, hud.hint ? HINTS[hud.hint]?.[touchy] ?? '' : '');
      style(hint.current, 'opacity', hud.hint ? '1' : '0');
      style(cast.current, 'opacity', phase === 'charging' ? '1' : '0');
      style(charge.current, 'transform', `scaleX(${hud.charge.toFixed(3)})`);
      style(biteBar.current, 'opacity', phase === 'bite' ? '1' : '0');
      style(bite.current, 'transform', `scaleX(${(1 - hud.bite).toFixed(3)})`);
      // The fight panel: who, how hard the line is working, how tired the fish is, how far.
      const fighting = phase === 'fight' && hud.fish !== null;
      style(fight.current, 'opacity', fighting ? '1' : '0');
      if (fighting && hud.fish) {
        text(fishName.current, catchName(hud.fish, 'normal', sunKnown));
        text(fishTier.current, hud.fishTier === TOP_TIER && !sunKnown ? '???' : tierName(hud.fishTier).toUpperCase());
        style(tension.current, 'transform', `scaleX(${Math.min(1, hud.tension / 1.15).toFixed(3)})`);
        style(tension.current, '--hot', hud.tension > T.fight.green[1] ? '1' : hud.tension < T.fight.green[0] ? '.4' : '0');
        style(stamina.current, 'transform', `scaleX(${hud.stamina.toFixed(3)})`);
        text(distance.current, `${Math.max(0, hud.distance).toFixed(1)} m`);
        const tellMove = hud.tell?.move ?? null;
        const tellText = tellMove === 'bolt' || tellMove === 'roll' ? `${hud.tell!.dir < 0 ? '◀ ' : ''}${tellMove === 'roll' ? 'ROLL' : 'BOLT'}${hud.tell!.dir > 0 ? ' ▶' : ''}` : tellMove ? TELL_TEXT[tellMove] ?? '' : hud.move === 'jump' ? 'BOW!' : '';
        text(tell.current, tellText);
        style(tell.current, 'opacity', tellText ? '1' : '0');
        style(ink.current, 'opacity', hud.ink > 0 ? String(Math.min(1, hud.ink)) : '0');
      }
      style(glare.current, 'opacity', String(Math.min(.85, hud.glare * .75)));
      // The heckle bubble rides over the fish.
      const b = hud.bubble;
      style(bubble.current, 'opacity', b.visible ? '1' : '0');
      if (b.visible) { text(bubble.current, b.text); style(bubble.current, 'left', `${(b.x * 100).toFixed(1)}%`); style(bubble.current, 'top', `${(b.y * 100).toFixed(1)}%`); }
      // A new catch on the card re-renders it once; Gary's ring counts down every frame.
      const current = phase === 'catch' ? hud.catch : null;
      if ((current?.id ?? -1) !== shownCard) { shownCard = current?.id ?? -1; setCard(current); }
      if (current && garyRing.current) {
        const left = Number.isFinite(hud.gary) ? Math.max(0, hud.gary / T.gary) : 1;
        style(garyRing.current, 'stroke-dashoffset', String((1 - left) * 100));
        text(garyLine.current, !Number.isFinite(hud.gary) ? (current.species === 'sun' ? GARY_SUN_LINE : 'Gary is letting this one go.') : GARY_LINES[Math.min(GARY_LINES.length - 1, Math.floor((1 - left) * GARY_LINES.length))]);
      }
      text(primaryLabel.current, phase === 'fight' ? 'Reel' : phase === 'waiting' || phase === 'nibble' || phase === 'bite' ? 'Strike' : 'Cast');
      while (session.popups.length) show(session.popups.shift()!);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [coarse, sunKnown]);

  const setTouch = (x: number, y: number, active: boolean) => {
    const touch = sessionRef.current.touch;
    touch.x = x; touch.y = y; touch.active = active;
    setStick({ x: x * 34, y: -y * 34 });
  };
  const padMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const anchor = pad.current;
    if (!anchor || anchor.id !== event.pointerId) return;
    const dx = event.clientX - anchor.x, dy = event.clientY - anchor.y, length = Math.max(40, Math.hypot(dx, dy));
    setTouch(dx / length, 0, true);
    // Pulling the pad down bows to a jumping fish, once per pull.
    const down = dy / length > .6;
    if (down && !anchor.bowed) { anchor.bowed = true; sessionRef.current.touch.bow = true; }
    if (!down) anchor.bowed = false;
    setStick({ x: dx / length * 34, y: Math.max(0, dy / length) * 34 });
  };
  const padStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    pad.current = { id: event.pointerId, x: box.left + box.width / 2, y: box.top + box.height / 2, bowed: false };
    padMove(event);
  };
  const padEnd = () => { pad.current = null; setTouch(0, 0, false); };
  const primary = (value: boolean) => { const touch = sessionRef.current.touch; if (value && !touch.primary) touch.primaryPressed = true; touch.primary = value; };
  const decide = (choice: 'keep' | 'bait') => { sessionRef.current.touch[choice] = true; };

  const species = card ? speciesById(card.species) : null;
  const known = sunKnown || card?.species === 'sun';
  return <div ref={root} className="snowboard-hud fishing-hud" aria-label="Pier Pressure">
    <div className="fish-tide">
      <span className="hud-label">PIER PRESSURE · WORMS</span>
      <span ref={worms} className="fish-worms" aria-label="Worms left" />
      <div className="fish-cooler"><span><b ref={cooler}>0</b><small>IN THE COOLER</small></span><span><b ref={clams}>0</b><small>CLAMS</small></span></div>
      <div ref={live} className="fish-live" style={{ opacity: 0 }} />
    </div>
    <ol ref={ladder} className="fish-ladder" aria-label="The food chain">
      {TIERS.slice().reverse().map((tier, i) => <li key={tier.name}><span>{TIERS.length - 1 - i === TOP_TIER && !sunKnown ? '???' : tier.name}</span></li>)}
    </ol>
    <div ref={center} className="hud-center" />
    <div ref={toasts} className="hud-toasts" />
    <div ref={glare} className="fish-glare" style={{ opacity: 0 }} aria-hidden="true" />
    <div ref={bubble} className="fish-bubble" style={{ opacity: 0 }} aria-hidden="true" />
    <div ref={prompt} className="fish-prompt" style={{ opacity: 0 }} />
    <div ref={hint} className="fish-hint" style={{ opacity: 0 }} role="status" />
    <div ref={cast} className="fish-meter" style={{ opacity: 0 }} aria-hidden="true">
      <span className="fish-meter-band" style={{ left: `${T.cast.bullseye[0] * 100}%`, width: `${(T.cast.bullseye[1] - T.cast.bullseye[0]) * 100}%` }} />
      <span ref={charge} className="fish-meter-fill" data-hud="charge" />
    </div>
    <div ref={biteBar} className="fish-meter fish-bite" style={{ opacity: 0 }} aria-hidden="true"><span ref={bite} className="fish-meter-fill" data-hud="bite" /></div>
    <div ref={fight} className="fish-fight" style={{ opacity: 0 }}>
      <div className="fish-who"><strong ref={fishName} /><small ref={fishTier} /><b ref={distance} /></div>
      <span className="hud-label">LINE</span>
      <span className="fish-gauge" data-hud="gauge"><span className="fish-green" style={{ left: `${T.fight.green[0] / 1.15 * 100}%`, width: `${(T.fight.green[1] - T.fight.green[0]) / 1.15 * 100}%` }} /><span className="fish-snap" style={{ left: `${100 / 1.15}%` }} /><span ref={tension} className="fish-tension" data-hud="tension" /></span>
      <div ref={ink} className="fish-ink" style={{ opacity: 0 }} aria-hidden="true" />
      <span className="hud-label">FISH</span>
      <span className="fish-gauge fish-stamina-gauge"><span ref={stamina} className="fish-stamina" data-hud="stamina" /></span>
      <div ref={tell} className="fish-tell" style={{ opacity: 0 }} aria-live="off" />
    </div>
    {card && species && <div className="fish-card" role="dialog" aria-label="Your catch">
      <span className="fish-card-tier">{card.junk ? 'JUNK' : `${known || species.tier !== TOP_TIER ? tierName(card.tier).toUpperCase() : '???'} · CHAIN ×${card.chain}`}{card.daily && <em>CATCH OF THE DAY ×3</em>}</span>
      <h3>{catchName(card.species, card.variant)}</h3>
      <p className="fish-card-line">{species.lines.catch}</p>
      {card.note && <p className="fish-card-note">{card.note}</p>}
      <div className="fish-card-facts"><span>{formatWeight(card.weight)}</span><span>{formatClams(card.clams)} clams{card.perfect ? ' · perfect' : ''}</span></div>
      <div className="fish-card-gary">
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100" /><circle ref={garyRing} className="fish-gary-ring" cx="18" cy="18" r="15.9" pathLength="100" data-hud="gary" /></svg>
        <small ref={garyLine} />
      </div>
      <div className="fish-card-actions">
        <button type="button" className="fish-keep" data-testid="fish-keep" onPointerDown={event => { event.preventDefault(); decide('keep'); }} onClick={() => decide('keep')}><kbd>E</kbd>Keep it</button>
        {card.junk
          ? <button type="button" className="fish-bait" data-testid="fish-toss" onPointerDown={event => { event.preventDefault(); decide('bait'); }} onClick={() => decide('bait')}><kbd>Space</kbd>Toss it back</button>
          : canBait(card) && <button type="button" className="fish-bait" data-testid="fish-bait" onPointerDown={event => { event.preventDefault(); decide('bait'); }} onClick={() => decide('bait')}><kbd>Space</kbd>Bait it · go bigger</button>}
      </div>
    </div>}
    {!coarse && <div className="hud-keys">Space cast · strike · reel <span>· A/D aim and steer · S bow · E keep · Space bait ·</span> Esc pause</div>}
    {coarse && <>
      <div className="hud-pad" data-testid="fishing-pad" role="group" aria-label="Drag left and right to aim and steer; pull down to bow"
        onPointerDown={padStart} onPointerMove={padMove} onPointerUp={padEnd} onPointerCancel={padEnd} onLostPointerCapture={padEnd}>
        <span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </div>
      <button className="hud-button fish-primary" data-testid="fishing-primary" aria-label="Cast, strike and reel: hold to cast or reel, tap to strike"
        onPointerDown={event => { event.preventDefault(); primary(true); }} onPointerUp={() => primary(false)} onPointerCancel={() => primary(false)} onPointerLeave={() => primary(false)}><span ref={primaryLabel}>Cast</span></button>
    </>}
    <span ref={announce} className="sr-only" aria-live="polite" />
  </div>;
}
