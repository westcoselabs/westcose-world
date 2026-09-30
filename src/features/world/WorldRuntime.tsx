'use client';

import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { ArrowRight, ArrowUpRight, Check, Globe2, ListChecks, Pause, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { CONTENT, DESTINATIONS, type ContentId } from '@/content/registry';
import Environment from './scene/Environment';
import CoastalLighting from './scene/CoastalLighting';
import PlayerController from './player/PlayerController';
import { createRuntimeState, PLAYER_CENTER_HEIGHT, type SupportLayer, type WorldMode } from './runtime/types';
import { saveSession } from './runtime/session';
import { clearWorldInput } from './runtime/input';
import { supportAt } from './runtime/planet-collision';
import { HOTSPOTS } from './data/hotspots';
import { areaAt, coordinatesAt, PLANET_FIXTURES } from './data/planet';
import { mapCoordinates, mapDirection, mapFrame } from './data/world-map';
import Modal from './ui/Modal';
import './planet.css';

type State = { mode: WorldMode; panel: ContentId | null; ready: boolean; hotspot: string | null; area: string };
type Action = { type: 'mode'; mode: WorldMode } | { type: 'ready' } | { type: 'panel'; panel: ContentId } | { type: 'hotspot'; hotspot: string | null } | { type: 'area'; area: string };
type MapFacing = 'east' | 'north' | 'south' | 'west' | Readonly<{ east: number; north: number }>;
function reducer(state: State, action: Action): State {
  if (action.type === 'ready') return { ...state, ready: true, mode: state.mode === 'loading' ? 'intro' : state.mode };
  if (action.type === 'mode') return { ...state, mode: action.mode, panel: null };
  if (action.type === 'panel') return { ...state, mode: 'reading', panel: action.panel };
  if (action.type === 'hotspot') return { ...state, hotspot: action.hotspot };
  return { ...state, area: action.area };
}

function RendererLifecycle({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);
  return null;
}

export default function WorldRuntime() {
  const [runtime] = useState(createRuntimeState);
  const runtimeRef = useRef(runtime);
  const [ui, dispatch] = useReducer(reducer, { mode: 'loading', panel: null, ready: false, hotspot: null, area: 'WestCose Courtyard' });
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visited, setVisited] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem('westcose-planet:field-notes') || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && HOTSPOTS.some(h => h.id === id)) : []; }
    catch { return []; }
  });
  const viewport = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const pointerAnchor = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });
  const actionRef = useRef<(action: Action) => void>(() => {});
  const hasEntered = useRef(false);

  const change = useCallback((action: Action) => {
    const r = runtimeRef.current;
    if (action.type === 'mode') {
      r.mode = action.mode;
      if (action.mode === 'exploring') hasEntered.current = true;
    } else if (action.type === 'ready' && r.mode === 'loading') r.mode = 'intro';
    else if (action.type === 'panel') r.mode = 'reading';
    if (action.type !== 'hotspot' && action.type !== 'area') clearWorldInput(r);
    dispatch(action);
    if (action.type === 'mode' && action.mode === 'exploring') setTimeout(() => viewport.current?.focus({ preventScroll: true }), 0);
  }, []);
  useEffect(() => { actionRef.current = change; }, [change]);
  const ready = useCallback(() => actionRef.current({ type: 'ready' }), []);
  const hotspotChange = useCallback((hotspot: string | null) => actionRef.current({ type: 'hotspot', hotspot }), []);
  const areaChange = useCallback((area: string) => actionRef.current({ type: 'area', area }), []);
  const lost = useCallback(() => actionRef.current({ type: 'mode', mode: 'error' }), []);
  const resume = useCallback(() => change({ type: 'mode', mode: hasEntered.current ? 'exploring' : 'intro' }), [change]);

  useEffect(() => {
    const r = runtimeRef.current;
    r.reducedMotion = reduced;
  }, [reduced]);
  useEffect(() => {
    if (ui.ready) return;
    const timer = window.setTimeout(lost, 45_000);
    return () => clearTimeout(timer);
  }, [ui.ready, lost]);
  useEffect(() => {
    const r = runtimeRef.current;
    // Layout v5 begins every document load at the courtyard. Field notes and
    // reduced-motion preferences remain device-local, but old coordinates are
    // never restored into this new periodic-map layout.
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => setReduced(media.matches);
    const pause = () => {
      clearWorldInput(r);
      if (r.mode === 'exploring' || r.mode === 'overview') change({ type: 'mode', mode: 'paused' });
      saveSession(r);
    };
    const visibility = () => { setHidden(document.hidden); if (document.hidden) pause(); };
    window.addEventListener('blur', pause);
    window.addEventListener('pagehide', pause);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    return () => {
      saveSession(r);
      window.removeEventListener('blur', pause); window.removeEventListener('pagehide', pause);
      document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preference);
    };
  }, [change]);

  const read = useCallback((id: ContentId, place?: string) => {
    saveSession(runtimeRef.current);
    if (place) setVisited(previous => {
      const next = previous.includes(place) ? previous : [...previous, place];
      try { localStorage.setItem('westcose-planet:field-notes', JSON.stringify(next)); } catch { /* Optional device-local notes. */ }
      return next;
    });
    change({ type: 'panel', panel: id });
  }, [change]);
  useEffect(() => {
    const r = runtimeRef.current;
    const keys = (event: KeyboardEvent) => {
      if (event.repeat || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (r.mode === 'exploring') change({ type: 'mode', mode: 'paused' });
        else if (r.mode !== 'loading' && r.mode !== 'intro') resume();
      }
      if (event.key.toLowerCase() === 'e' && r.mode === 'exploring') {
        const place = HOTSPOTS.find(h => h.id === r.hotspot);
        if (place) { event.preventDefault(); read(place.contentId, place.id); }
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [change, read, resume]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const r = runtimeRef.current;
    const spawnAt = (x: number, z: number, facing: MapFacing = 'south', layer: SupportLayer = 'upper') => {
      const direction = mapDirection(x, z);
      const support = supportAt(direction, { layer });
      const frame = mapFrame(x, z);
      const position = direction.clone().multiplyScalar(support.radius + PLAYER_CENTER_HEIGHT);
      const forward = typeof facing === 'object'
        ? frame.east.clone().multiplyScalar(facing.east).addScaledVector(frame.north, facing.north).normalize()
        : facing === 'east' ? frame.east : facing === 'west' ? frame.east.clone().negate() : facing === 'south' ? frame.north.clone().negate() : frame.north;
      r.teleportRequested = { x:position.x,y:position.y,z:position.z };
      r.forwardRequested = { x:forward.x,y:forward.y,z:forward.z };
      r.teleportSupportLayer = layer;
      r.grounded = false;
      change({ type:'mode', mode:'exploring' });
    };
    const debug = {
      getState: () => {
        const map = mapCoordinates(r.position);
        return { mode: r.mode, position: { ...r.position }, forward: { ...r.forward }, up: { ...r.up }, heading: r.heading, ...coordinatesAt(r.position), map, mapX:map.x, mapZ:map.z, radius: Math.hypot(r.position.x,r.position.y,r.position.z), travelDistance: r.travelDistance, lapCount: r.lapCount, currentArea: areaAt(r.position), hotspot: r.hotspot, grounded: r.grounded, swimming: r.swimming, interior:r.interior, supportKind:r.supportKind, supportLayer:r.supportLayer, cameraDistance: r.cameraDistance, desiredCameraDistance: r.desiredCameraDistance, overviewTransition: r.overviewTransition, landmarkFraming: { summitNdc: { ...r.landmarkFraming.summitNdc }, summitFraming: r.landmarkFraming.summitFraming, summitVisible: r.landmarkFraming.summitVisible }, counters: { ...r.counters } };
      },
      spawn: (name: string) => {
        if (!Object.hasOwn(PLANET_FIXTURES, name)) throw new Error('Unknown planet fixture');
        const f = PLANET_FIXTURES[name as keyof typeof PLANET_FIXTURES];
        spawnAt(f.x, f.z, f.facing);
      },
      spawnAt,
      spawnTunnelAt: (x: number, z: number, facing: MapFacing = 'east') => spawnAt(x, z, facing, 'tunnel'),
    };
    Object.assign(window, { __WESTCOSE_WORLD__: debug });
    return () => { Reflect.deleteProperty(window, '__WESTCOSE_WORLD__'); };
  }, [change]);

  const reset = () => { runtimeRef.current.resetRequested = true; change({ type:'mode',mode:'exploring' }); };
  const endStick = () => {
    pointerAnchor.current = null;
    const r = runtimeRef.current; r.touch = { x:0,y:0,active:false };
    setStickOffset({ x:0,y:0 });
  };
  const nearby = HOTSPOTS.find(h => h.id === ui.hotspot);
  const content = ui.panel ? CONTENT[ui.panel] : null;
  const active = ui.mode === 'exploring';
  const globe = ui.mode === 'intro' || ui.mode === 'loading' || ui.mode === 'overview';

  return <main className="planet-shell">
    <div className="planet-viewport" ref={viewport} tabIndex={0} aria-label="WestCose planet. Drag to walk, or use WASD and arrow keys. E to interact. Escape to pause.">
      <Canvas shadows={reduced ? false : {type:PCFShadowMap}} dpr={reduced ? 1 : [1,1.5]} camera={{position:[80,70,110],fov:52,near:.08,far:550}} frameloop={hidden ? 'never' : ['exploring','loading','intro','overview'].includes(ui.mode) ? 'always' : 'demand'} gl={{antialias:true,powerPreference:'high-performance',alpha:false,toneMapping:ACESFilmicToneMapping,toneMappingExposure:.84,outputColorSpace:SRGBColorSpace}}>
        <Suspense fallback={null}>
          <PlayerController runtime={runtime} onReady={ready} onHotspot={hotspotChange} onArea={areaChange}/>
          <Environment runtime={runtime}/>
          <CoastalLighting runtime={runtime} reduced={reduced}/>
          <RendererLifecycle onLost={lost}/>
        </Suspense>
      </Canvas>
    </div>

    <div className="planet-wordmark">WESTCOSE <span>WORLD</span></div>
    {ui.ready && ui.mode !== 'intro' && <div className="planet-tools">
      <button className="planet-icon" aria-label="Field notes" aria-expanded={ui.mode === 'menu'} onClick={() => ui.mode === 'menu' ? resume() : change({type:'mode',mode:'menu'})}><ListChecks/></button>
      <button className="planet-icon" aria-label={ui.mode === 'overview' ? 'Back to walking' : 'Planet view'} onClick={() => ui.mode === 'overview' ? resume() : change({type:'mode',mode:'overview'})}><Globe2/></button>
    </div>}

    {(ui.mode === 'intro' || ui.mode === 'loading') && <section className="planet-intro"><div className="planet-tag">A WESTCOSE TOWN. TAKE THE LONG WAY.</div><h1>WESTCOSE<br/><span>WORLD</span></h1><button className="planet-enter" data-testid="enter-world" disabled={!ui.ready} onClick={() => change({type:'mode',mode:'exploring'})}>{ui.ready ? 'Enter world' : 'Building your planet…'}<ArrowRight size={19}/></button></section>}

    {ui.mode === 'overview' && <div className="planet-overview-caption"><span>ONE SMALL PLANET</span><strong>Keep going. It all connects.</strong><button onClick={resume}>Back to walking <ArrowRight size={16}/></button></div>}

    {!globe && <div className="planet-place"><span>WESTCOSE / 01</span><strong>{ui.area}</strong></div>}
    {active && <>
      <div className="planet-hint">Drag to walk <span>·</span> WASD / arrows <span>·</span> Shift to run</div>
      {nearby && <button className="planet-interact" aria-label={`Explore ${nearby.label}`} onClick={() => read(nearby.contentId,nearby.id)}><kbd>E</kbd><span>{nearby.label}</span><ArrowUpRight size={17}/></button>}
      <div ref={stick} className="planet-move-pad" data-testid="move-pad" aria-label="Drag to walk" role="group"
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const box=event.currentTarget.getBoundingClientRect(); pointerAnchor.current={id:event.pointerId,x:box.left+box.width/2,y:box.top+box.height/2}; const anchor=pointerAnchor.current; const dx=event.clientX-anchor.x,dy=event.clientY-anchor.y; const length=Math.max(42,Math.hypot(dx,dy)); runtimeRef.current.touch={x:dx/length,y:-dy/length,active:true}; setStickOffset({x:dx/length*36,y:dy/length*36}); }}
        onPointerMove={event => { const anchor=pointerAnchor.current; if(!anchor||event.pointerId!==anchor.id)return; const dx=event.clientX-anchor.x,dy=event.clientY-anchor.y; const length=Math.max(42,Math.hypot(dx,dy)); runtimeRef.current.touch={x:dx/length,y:-dy/length,active:true}; setStickOffset({x:dx/length*36,y:dy/length*36}); }}
        onPointerUp={endStick} onPointerCancel={endStick} onLostPointerCapture={endStick}><span style={{transform:`translate(${stickOffset.x}px,${stickOffset.y}px)`}}/></div>
    </>}

    {!globe && <button className="planet-icon planet-settings" aria-label="Controls" onClick={() => ui.mode === 'paused' ? resume() : change({type:'mode',mode:'paused'})}><SlidersHorizontal/></button>}

    {ui.mode === 'menu' && <aside className="planet-note" aria-label="Field notes"><button className="note-close" aria-label="Close field notes" onClick={resume}><X size={18}/></button><span className="planet-tag">THINGS ALONG THE WAY</span><h2>Field notes</h2><p>Follow a street. See where it leads.</p><ol>{HOTSPOTS.map(place => <li key={place.id}><button onClick={() => read(place.contentId)}><span className={`note-check ${visited.includes(place.id)?'is-found':''}`}>{visited.includes(place.id)&&<Check size={13}/>}</span><span>{place.label}</span><ArrowUpRight size={13}/></button></li>)}</ol><small>{visited.length} of {HOTSPOTS.length} places explored · All optional</small></aside>}

    {ui.mode === 'paused' && <aside className="planet-note controls-note" aria-label="World controls"><button className="note-close" aria-label="Close controls" onClick={resume}><X size={18}/></button><Pause size={24}/><h2>Take your time.</h2><p>Drag anywhere to walk. The camera follows.<br/>WASD / arrows also work. Hold Shift to run.</p><button className="note-action primary" onClick={resume}>Resume exploring<ArrowRight size={16}/></button><button className="note-action" onClick={reset}>Return to entry<RotateCcw size={15}/></button><label className="note-effects"><span>Reduced effects</span><input type="checkbox" checked={reduced} onChange={event=>setReduced(event.target.checked)}/></label><small>Escape closes a note or pauses the world.</small></aside>}

    {content && <Modal title={content.title} onClose={resume} className="planet-talk"><span className="talk-label">{nearby?.label || content.eyebrow}</span><h2>{content.title}</h2><p>{content.summary}</p><span className="talk-status">{content.status}</span>{content.id === 'fightclub' && <p>The game needs a working build or URL before this cabinet can launch it.</p>}<Link href={content.href} prefetch={false} onClick={()=>saveSession(runtimeRef.current)}>{content.linkLabel}<ArrowUpRight size={17}/></Link></Modal>}

    {ui.mode === 'error' && <div className="planet-failure"><h2>The planet couldn’t load.</h2><p>Try again, or open a destination directly.</p><button onClick={()=>window.location.reload()}>Reload world</button><nav>{DESTINATIONS.map(d=><Link key={d.id} href={d.href}>{d.label}</Link>)}</nav></div>}
    <span className="sr-only" aria-live="polite">{active && nearby ? `Near ${nearby.label}. Press E to explore.` : ''}</span>
  </main>;
}
