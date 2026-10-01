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
import { MAP_RADIUS, MAP_VIEW_SCALE, mapCoordinates, mapDirection, mapFrame } from './data/world-map';
import Modal from './ui/Modal';
import SnowboardController from './snowboard/SnowboardController';
import SnowboardHud from './snowboard/ui/SnowboardHud';
import TicketBoothMenu from './snowboard/ui/TicketBoothMenu';
import RunResults, { type ResultsAction } from './snowboard/ui/RunResults';
import { loadProgress, recordResult, saveProgress, type RecordOutcome, type SnowboardProgress } from './snowboard/progress';
import { clearSnowboardInput } from './runtime/snowboard-session';
import type { BoardInput } from './snowboard/physics';
import type { RunResult } from './snowboard/scoring';
import { skiRunById, type SkiRunId } from './data/ski-runs';
import { MOUNTAIN_FINISH_AREAS } from './data/mountain-layout';
import SkateController from './skate/SkateController';
import SkateHud from './skate/ui/SkateHud';
import SkateResults, { type SkateResultsAction } from './skate/ui/SkateResults';
import { loadSkateProgress, recordSkateGame, saveSkateProgress, type SkateProgress, type SkateRecordOutcome } from './skate/progress';
import { clearSkateInput, type SkateGameResult } from './runtime/skate-session';
import type { SkateInput } from './skate/physics';
import { parkDirection, parkTangents } from './data/skatepark-layout';
import './planet.css';
import './snowboard/snowboard.css';
import './skate/skate.css';

type State = { mode: WorldMode; panel: ContentId | null; ready: boolean; hotspot: string | null; area: string };
type Action = { type: 'mode'; mode: WorldMode } | { type: 'ready' } | { type: 'panel'; panel: ContentId } | { type: 'hotspot'; hotspot: string | null } | { type: 'area'; area: string };
type MapFacing = 'east' | 'north' | 'south' | 'west' | Readonly<{ east: number; north: number }>;
const CAMERA_START: [number, number, number] = [80 * MAP_VIEW_SCALE, 70 * MAP_VIEW_SCALE, 110 * MAP_VIEW_SCALE];
const CAMERA_FAR = 550 * MAP_VIEW_SCALE;
type WorldRuntimeData = ReturnType<typeof createRuntimeState>;
/** Move the walker (never the snowboard rider) to a chart point, facing a map direction. */
function requestWalker(r: WorldRuntimeData, x: number, z: number, facing: MapFacing = 'south', layer: SupportLayer = 'upper') {
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
}
/** Where the walker stands after a run: the ticket window, or the run's own finish area. */
function runExit(runId: SkiRunId | null, to: 'tickets' | 'finish'): { x: number; z: number; facing: MapFacing } {
  if (to === 'finish' && runId) { const area = MOUNTAIN_FINISH_AREAS[skiRunById(runId).finish]; return { x: area.x, z: area.z, facing: 'south' }; }
  return PLANET_FIXTURES.tickets;
}
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
  const [progress, setProgress] = useState<SnowboardProgress>(() => loadProgress());
  const progressRef = useRef(progress);
  const [results, setResults] = useState<{ result: RunResult; outcome: RecordOutcome | null } | null>(null);
  const [coarse, setCoarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [skateProgress, setSkateProgress] = useState<SkateProgress>(() => loadSkateProgress());
  const skateProgressRef = useRef(skateProgress);
  const [riding, setRiding] = useState(false);
  const [indoors, setIndoors] = useState(false);
  const [skateResults, setSkateResults] = useState<{ result: SkateGameResult; outcome: SkateRecordOutcome | null } | null>(null);
  const [note, setNote] = useState<{ id: number; text: string; detail?: string } | null>(null);

  const change = useCallback((action: Action) => {
    const r = runtimeRef.current;
    if (action.type === 'mode') {
      r.mode = action.mode;
      if (action.mode === 'exploring') hasEntered.current = true;
    } else if (action.type === 'ready' && r.mode === 'loading') r.mode = 'intro';
    else if (action.type === 'panel') r.mode = 'reading';
    if (action.type !== 'hotspot' && action.type !== 'area') { clearWorldInput(r); clearSnowboardInput(r.snowboard); clearSkateInput(r.skate); }
    dispatch(action);
    if (action.type === 'mode' && (action.mode === 'exploring' || action.mode === 'snowboard' || action.mode === 'skating')) setTimeout(() => viewport.current?.focus({ preventScroll: true }), 0);
  }, []);
  useEffect(() => { actionRef.current = change; }, [change]);
  const ready = useCallback(() => actionRef.current({ type: 'ready' }), []);
  const hotspotChange = useCallback((hotspot: string | null) => actionRef.current({ type: 'hotspot', hotspot }), []);
  const areaChange = useCallback((area: string) => actionRef.current({ type: 'area', area }), []);
  const lost = useCallback(() => actionRef.current({ type: 'mode', mode: 'error' }), []);
  // A paused run resumes the run, a paused skate the board; everything else returns to walking (or the intro).
  const resume = useCallback(() => change({ type: 'mode', mode: runtimeRef.current.snowboard.active ? 'snowboard' : runtimeRef.current.skate.riding ? 'skating' : hasEntered.current ? 'exploring' : 'intro' }), [change]);
  const noteId = useRef(0);
  const notify = useCallback((text: string, detail?: string) => setNote({ id: ++noteId.current, text, detail }), []);
  useEffect(() => { if (!note) return; const timer = window.setTimeout(() => setNote(current => current?.id === note.id ? null : current), 3400); return () => clearTimeout(timer); }, [note]);
  useEffect(() => { skateProgressRef.current = skateProgress; runtimeRef.current.skate.owned = skateProgress.owned; }, [skateProgress]);
  // The equip button greys out indoors; poll the walker's room rather than re-render per frame.
  useEffect(() => { const timer = window.setInterval(() => setIndoors(runtimeRef.current.interior !== null), 250); return () => clearInterval(timer); }, []);

  /** The counter at the skate shop: the first visit hands over a board. */
  const takeBoard = useCallback(() => {
    if (skateProgressRef.current.owned) { notify('You already have a board', 'Equip it outside with B or the Equip skateboard button.'); return; }
    const next = { ...skateProgressRef.current, owned: true };
    saveSkateProgress(next); skateProgressRef.current = next; runtimeRef.current.skate.owned = true; setSkateProgress(next);
    notify('Skateboard added', 'Head outside and press B, or tap Equip skateboard, to ride.');
  }, [notify]);
  const equip = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.skate.owned || r.skate.riding || r.snowboard.active || r.mode !== 'exploring') return;
    if (r.interior) { notify('Boards stay off indoors', 'Step outside to ride.'); return; }
    r.skate.riding = true; r.skate.request = { kind: 'equip' }; setRiding(true);
    change({ type: 'mode', mode: 'skating' });
  }, [change, notify]);
  /** Hand back to the walker where the rider is, facing the way they were rolling. */
  const unequip = useCallback((message?: string) => {
    const r = runtimeRef.current;
    r.skate.riding = false; r.skate.request = null; r.skate.testInput = null; clearSkateInput(r.skate);
    const map = mapCoordinates(r.skate.focus), frame = mapFrame(map.x, map.z), h = r.skate.heading;
    const east = h.x * frame.east.x + h.y * frame.east.y + h.z * frame.east.z, north = h.x * frame.north.x + h.y * frame.north.y + h.z * frame.north.z;
    requestWalker(r, map.x, map.z, Math.hypot(east, north) > .1 ? { east, north } : 'south');
    setRiding(false); setSkateResults(null);
    hasEntered.current = true;
    change({ type: 'mode', mode: 'exploring' });
    if (message) notify(message);
  }, [change, notify]);
  const dismount = useCallback(() => unequip('Board off indoors'), [unequip]);
  const startSkateGame = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.skate.owned) { notify('You need a skateboard', 'Pick one up at the counter in the WestCose Skate Shop on Main Street.'); return; }
    if (r.snowboard.active) return;
    setSkateResults(null);
    r.skate.riding = true; r.skate.request = { kind: 'game' }; setRiding(true);
    change({ type: 'mode', mode: 'skating' });
  }, [change, notify]);
  const finishSkateGame = useCallback((result: SkateGameResult) => {
    const outcome = recordSkateGame(skateProgressRef.current, result);
    saveSkateProgress(outcome.progress); skateProgressRef.current = outcome.progress; setSkateProgress(outcome.progress);
    setSkateResults({ result, outcome });
  }, []);
  const skateResultsAction = useCallback((action: SkateResultsAction) => {
    setSkateResults(null);
    if (action === 'again') { runtimeRef.current.skate.request = { kind: 'restart-game' }; change({ type: 'mode', mode: 'skating' }); }
    else if (action === 'off') unequip();
    else change({ type: 'mode', mode: 'skating' });
  }, [change, unequip]);
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const startRun = useCallback((runId: SkiRunId) => {
    const r = runtimeRef.current;
    setResults(null);
    r.snowboard.active = true;
    r.snowboard.hud.runId = runId;
    r.snowboard.request = { kind: 'start', runId };
    change({ type: 'mode', mode: 'snowboard' });
  }, [change]);
  const leaveRun = useCallback((to: 'tickets' | 'finish', then: WorldMode = 'exploring') => {
    const r = runtimeRef.current, exit = runExit(r.snowboard.hud.runId, to);
    r.snowboard.active = false; r.snowboard.request = null; r.snowboard.testInput = null;
    setResults(null);
    requestWalker(r, exit.x, exit.z, exit.facing);
    hasEntered.current = true;
    change({ type: 'mode', mode: then });
  }, [change]);
  const finishRun = useCallback((result: RunResult) => {
    const outcome = recordResult(progressRef.current, result);
    saveProgress(outcome.progress);
    progressRef.current = outcome.progress;
    setProgress(outcome.progress);
    setResults({ result, outcome });
  }, []);
  const resultsAction = useCallback((action: ResultsAction) => {
    const runId = runtimeRef.current.snowboard.hud.runId;
    if (action === 'again' && runId) startRun(runId);
    else if (action === 'runs') leaveRun('tickets', 'tickets');
    else leaveRun(action === 'explore' ? 'finish' : 'tickets');
  }, [leaveRun, startRun]);

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
      if (r.mode === 'exploring' || r.mode === 'overview' || r.mode === 'snowboard' || r.mode === 'skating') change({ type: 'mode', mode: 'paused' });
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
    // At the booth itself, the lift-ticket window opens the run menu.
    if (id === 'snowboard' && place) { change({ type: 'mode', mode: 'tickets' }); return; }
    // The skate-shop counter hands over a board; the grand stairs start a game of S.K.A.T.E.
    if (id === 'skateshop' && place) { takeBoard(); return; }
    if (id === 'skatepark' && place) { startSkateGame(); return; }
    change({ type: 'panel', panel: id });
  }, [change, startSkateGame, takeBoard]);
  useEffect(() => {
    const r = runtimeRef.current;
    const keys = (event: KeyboardEvent) => {
      if (event.repeat || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (r.mode === 'exploring' || r.mode === 'snowboard' || r.mode === 'skating') change({ type: 'mode', mode: 'paused' });
        else if (r.mode !== 'loading' && r.mode !== 'intro') resume();
      }
      if (event.code === 'KeyB' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (r.mode === 'exploring') { event.preventDefault(); equip(); }
        else if (r.mode === 'skating') { event.preventDefault(); unequip(); }
      }
      if (event.key.toLowerCase() === 'e' && r.mode === 'exploring') {
        const place = HOTSPOTS.find(h => h.id === r.hotspot);
        if (place) { event.preventDefault(); read(place.contentId, place.id); }
      } else if (event.key.toLowerCase() === 'e' && r.mode === 'skating' && r.skate.hud.nearGame) { event.preventDefault(); startSkateGame(); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [change, equip, read, resume, startSkateGame, unequip]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const r = runtimeRef.current;
    const spawnAt = (x: number, z: number, facing: MapFacing = 'south', layer: SupportLayer = 'upper') => {
      r.snowboard.active = false; r.snowboard.request = null;
      if (r.skate.riding) { r.skate.riding = false; r.skate.request = null; setRiding(false); setSkateResults(null); }
      requestWalker(r, x, z, facing, layer);
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
      /** Fixed review camera from chart (x, z, height) toward chart (x, z, height); null restores the follow camera. */
      setCamera: (view: { from: [number, number, number]; to: [number, number, number] } | null) => {
        if (!view) { r.debugCamera = null; return; }
        const position = mapDirection(view.from[0], view.from[1]).multiplyScalar(MAP_RADIUS + view.from[2]);
        const target = mapDirection(view.to[0], view.to[1]).multiplyScalar(MAP_RADIUS + view.to[2]);
        const up = mapDirection(view.from[0], view.from[1]);
        r.debugCamera = { position: { x: position.x, y: position.y, z: position.z }, target: { x: target.x, y: target.y, z: target.z }, up: { x: up.x, y: up.y, z: up.z } };
      },
      spawnTunnelAt: (x: number, z: number, facing: MapFacing = 'east') => spawnAt(x, z, facing, 'tunnel'),
      snowboard: {
        getState: () => {
          const board = r.snowboard;
          return { active: board.active, mode: r.mode, ...board.hud, ...board.debug, result: board.result };
        },
        startRun: (id: SkiRunId) => startRun(id),
        /** Ride from a fraction of the run at a speed, skipping the countdown. */
        spawnOnRun: (id: SkiRunId, progress = 0, speed = 8) => {
          setResults(null);
          r.snowboard.active = true; r.snowboard.hud.runId = id;
          r.snowboard.request = { kind: 'spawn', runId: id, progress, speed };
          change({ type:'mode', mode:'snowboard' });
        },
        setInput: (input: Partial<BoardInput> | null) => { r.snowboard.testInput = input; },
        leave: (to: 'tickets' | 'finish' = 'tickets') => leaveRun(to),
      },
      skate: {
        getState: () => ({ owned: r.skate.owned, riding: r.skate.riding, worldMode: r.mode, ...r.skate.debug, hud: JSON.parse(JSON.stringify(r.skate.hud)), result: r.skate.result, focus: { ...r.skate.focus } }),
        giveBoard: () => takeBoard(),
        equip: () => equip(),
        unequip: () => unequip(),
        startGame: () => startSkateGame(),
        /** Ride from a chart point, facing (east, north), already rolling. */
        spawnAt: (x: number, z: number, east = 0, north = 1, speed = 0) => {
          if (!r.skate.owned) takeBoard();
          if (!r.skate.riding) { r.skate.riding = true; setRiding(true); change({ type: 'mode', mode: 'skating' }); }
          r.skate.request = { kind: 'spawn', x, z, east, north, speed };
        },
        /** Ride from a skate-park local point (metres east/north of its centre), facing (du, dv). */
        spawnPark: (u: number, v: number, du = 0, dv = 1, speed = 0) => {
          const chart = mapCoordinates(parkDirection(u, v)), frame = mapFrame(chart.x, chart.z), t = parkTangents(u, v);
          const forward = t.east.multiplyScalar(du).addScaledVector(t.north, dv);
          if (!r.skate.owned) takeBoard();
          if (!r.skate.riding) { r.skate.riding = true; setRiding(true); change({ type: 'mode', mode: 'skating' }); }
          r.skate.request = { kind: 'spawn', x: chart.x, z: chart.z, east: forward.dot(frame.east), north: forward.dot(frame.north), speed };
        },
        setInput: (input: Partial<SkateInput> | null) => { r.skate.testInput = input; },
      },
    };
    Object.assign(window, { __WESTCOSE_WORLD__: debug });
    return () => { Reflect.deleteProperty(window, '__WESTCOSE_WORLD__'); };
  }, [change, equip, leaveRun, startRun, startSkateGame, takeBoard, unequip]);

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
  // The run HUD stays up while a run is paused; the walker's tools and place label step aside.
  const boarding = runtime.snowboard.active && (ui.mode === 'snowboard' || ui.mode === 'paused');
  const skating = riding && (ui.mode === 'skating' || ui.mode === 'paused');
  // The counter and the stairs read differently depending on whether you have a board yet.
  const interactLabel = !nearby ? '' : nearby.id === 'skateshop' ? (skateProgress.owned ? 'Skate Shop Counter' : 'Take a skateboard') : nearby.id === 'skatepark' ? (skateProgress.owned ? 'Start Game of S.K.A.T.E.' : 'Game of S.K.A.T.E. (needs a board)') : nearby.label;

  return <main className="planet-shell">
    <div className="planet-viewport" ref={viewport} tabIndex={0} aria-label="WestCose planet. WASD or the arrow keys walk, left and right arrows turn, and a mouse drag looks around. E to interact. Escape to pause.">
      <Canvas shadows={reduced ? false : {type:PCFShadowMap}} dpr={reduced ? 1 : [1,1.5]} camera={{position:CAMERA_START,fov:52,near:.08,far:CAMERA_FAR}} frameloop={hidden ? 'never' : ['exploring','loading','intro','overview','snowboard','skating'].includes(ui.mode) ? 'always' : 'demand'} gl={{antialias:true,powerPreference:'high-performance',alpha:false,toneMapping:ACESFilmicToneMapping,toneMappingExposure:.84,outputColorSpace:SRGBColorSpace}}>
        <Suspense fallback={null}>
          <PlayerController runtime={runtime} onReady={ready} onHotspot={hotspotChange} onArea={areaChange}/>
          <SnowboardController runtime={runtime} onFinish={finishRun}/>
          <SkateController runtime={runtime} onGameFinished={finishSkateGame} onDismount={dismount} onArea={areaChange}/>
          <Environment runtime={runtime}/>
          <CoastalLighting runtime={runtime} reduced={reduced}/>
          <RendererLifecycle onLost={lost}/>
        </Suspense>
      </Canvas>
    </div>

    <div className="planet-wordmark">WESTCOSE <span>WORLD</span></div>
    {ui.ready && ui.mode !== 'intro' && !boarding && !skating && <div className="planet-tools">
      <button className="planet-icon" aria-label="Field notes" aria-expanded={ui.mode === 'menu'} onClick={() => ui.mode === 'menu' ? resume() : change({type:'mode',mode:'menu'})}><ListChecks/></button>
      <button className="planet-icon" aria-label={ui.mode === 'overview' ? 'Back to walking' : 'Planet view'} onClick={() => ui.mode === 'overview' ? resume() : change({type:'mode',mode:'overview'})}><Globe2/></button>
    </div>}

    {(ui.mode === 'intro' || ui.mode === 'loading') && <section className="planet-intro"><div className="planet-tag">A WESTCOSE TOWN. TAKE THE LONG WAY.</div><h1>WESTCOSE<br/><span>WORLD</span></h1><button className="planet-enter" data-testid="enter-world" disabled={!ui.ready} onClick={() => change({type:'mode',mode:'exploring'})}>{ui.ready ? 'Enter world' : 'Building your planet…'}<ArrowRight size={19}/></button></section>}

    {ui.mode === 'overview' && <div className="planet-overview-caption"><span>ONE SMALL PLANET</span><strong>Keep going. It all connects.</strong><button onClick={resume}>Back to walking <ArrowRight size={16}/></button></div>}

    {!globe && !boarding && !skating && <div className="planet-place"><span>WESTCOSE / 01</span><strong>{ui.area}</strong></div>}
    {boarding && <SnowboardHud key={runtime.snowboard.hud.runId ?? 'run'} session={runtime.snowboard} coarse={coarse}/>}
    {skating && <SkateHud session={runtime.skate} coarse={coarse} onStartGame={startSkateGame}/>}
    {ui.ready && skateProgress.owned && (active || ui.mode === 'skating') && <button className={`board-toggle ${riding ? 'is-riding' : ''}`} data-testid="board-toggle" disabled={!riding && indoors} aria-label={riding ? 'Unequip skateboard' : indoors ? 'Equip skateboard outside' : 'Equip skateboard'} onClick={() => riding ? unequip() : equip()}><kbd>B</kbd><span>{riding ? 'Unequip skateboard' : indoors ? 'Ride outside' : 'Equip skateboard'}</span></button>}
    {note && <div key={note.id} className="board-note" role="status">{note.text}{note.detail && <small>{note.detail}</small>}</div>}
    {active && <>
      <div className="planet-hint">{coarse ? <>Drag to walk <span>·</span> Tap a prompt to interact</> : <>WASD / arrows to walk <span>·</span> Drag to look <span>·</span> Shift to run</>}</div>
      {nearby && <button className="planet-interact" aria-label={`Explore ${nearby.label}`} onClick={() => read(nearby.contentId,nearby.id)}><kbd>E</kbd><span>{interactLabel}</span><ArrowUpRight size={17}/></button>}
      <div ref={stick} className="planet-move-pad" data-testid="move-pad" aria-label="Drag to walk" role="group"
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const box=event.currentTarget.getBoundingClientRect(); pointerAnchor.current={id:event.pointerId,x:box.left+box.width/2,y:box.top+box.height/2}; const anchor=pointerAnchor.current; const dx=event.clientX-anchor.x,dy=event.clientY-anchor.y; const length=Math.max(42,Math.hypot(dx,dy)); runtimeRef.current.touch={x:dx/length,y:-dy/length,active:true}; setStickOffset({x:dx/length*36,y:dy/length*36}); }}
        onPointerMove={event => { const anchor=pointerAnchor.current; if(!anchor||event.pointerId!==anchor.id)return; const dx=event.clientX-anchor.x,dy=event.clientY-anchor.y; const length=Math.max(42,Math.hypot(dx,dy)); runtimeRef.current.touch={x:dx/length,y:-dy/length,active:true}; setStickOffset({x:dx/length*36,y:dy/length*36}); }}
        onPointerUp={endStick} onPointerCancel={endStick} onLostPointerCapture={endStick}><span style={{transform:`translate(${stickOffset.x}px,${stickOffset.y}px)`}}/></div>
    </>}

    {!globe && <button className="planet-icon planet-settings" aria-label="Controls" onClick={() => ui.mode === 'paused' ? resume() : change({type:'mode',mode:'paused'})}><SlidersHorizontal/></button>}

    {ui.mode === 'menu' && <aside className="planet-note" aria-label="Field notes"><button className="note-close" aria-label="Close field notes" onClick={resume}><X size={18}/></button><span className="planet-tag">THINGS ALONG THE WAY</span><h2>Field notes</h2><p>Follow a street. See where it leads.</p><ol>{HOTSPOTS.map(place => <li key={place.id}><button onClick={() => read(place.contentId)}><span className={`note-check ${visited.includes(place.id)?'is-found':''}`}>{visited.includes(place.id)&&<Check size={13}/>}</span><span>{place.label}</span><ArrowUpRight size={13}/></button></li>)}</ol><small>{visited.length} of {HOTSPOTS.length} places explored · All optional</small></aside>}

    {ui.mode === 'paused' && boarding && <aside className="planet-note controls-note" aria-label="Run paused"><button className="note-close" aria-label="Resume run" onClick={resume}><X size={18}/></button><Pause size={24}/><h2>Run paused.</h2><p>A/D carve, W tuck, S brake, Space to ollie.<br/>In the air: A/D spin, W/S flip, J/K/L grab.</p><button className="note-action primary" onClick={resume}>Resume run<ArrowRight size={16}/></button><button className="note-action" onClick={() => { runtimeRef.current.snowboard.request = { kind: 'restart' }; resume(); }}>Restart run<RotateCcw size={15}/></button><button className="note-action" onClick={() => leaveRun('tickets')}>Quit to resort<X size={15}/></button><label className="note-effects"><span>Reduced effects</span><input type="checkbox" checked={reduced} onChange={event=>setReduced(event.target.checked)}/></label><small>Escape resumes the run. R restarts it.</small></aside>}
    {ui.mode === 'paused' && skating && <aside className="planet-note controls-note" aria-label="Skating paused"><button className="note-close" aria-label="Resume skating" onClick={resume}><X size={18}/></button><Pause size={24}/><h2>Skating paused.</h2><p>↑ push, ←/→ turn, ↓ brake, Space ollie (hold to crouch).<br/>J flip, K grab, L grind, ↑ then ↓ manual; the arrows pick the trick.<br/>Left/right spin in the air and balance grinds; hold ↑ at a lip to air out of a bowl.</p><button className="note-action primary" onClick={resume}>Resume skating<ArrowRight size={16}/></button>{runtime.skate.hud.game.phase !== 'none' && <button className="note-action" onClick={() => { runtimeRef.current.skate.request = { kind: 'restart-game' }; resume(); }}>Restart game<RotateCcw size={15}/></button>}<button className="note-action" onClick={() => unequip()}>Board off<X size={15}/></button><label className="note-effects"><span>Reduced effects</span><input type="checkbox" checked={reduced} onChange={event=>setReduced(event.target.checked)}/></label><small>Escape resumes. B takes the board off. R restarts a game.</small></aside>}
    {ui.mode === 'paused' && !boarding && !skating && <aside className="planet-note controls-note" aria-label="World controls"><button className="note-close" aria-label="Close controls" onClick={resume}><X size={18}/></button><Pause size={24}/><h2>Take your time.</h2>{coarse ? <p>Drag anywhere to walk. The camera follows.<br/>The pad takes small steps.</p> : <p>W/S or ↑/↓ walk, A/D step sideways, ←/→ turn.<br/>Drag the mouse to look, scroll to zoom, Shift to run.</p>}<button className="note-action primary" onClick={resume}>Resume exploring<ArrowRight size={16}/></button><button className="note-action" onClick={reset}>Return to entry<RotateCcw size={15}/></button><label className="note-effects"><span>Reduced effects</span><input type="checkbox" checked={reduced} onChange={event=>setReduced(event.target.checked)}/></label><small>Escape closes a note or pauses the world.</small></aside>}

    {content && <Modal title={content.title} onClose={resume} className="planet-talk"><span className="talk-label">{nearby?.label || content.eyebrow}</span><h2>{content.title}</h2><p>{content.summary}</p><span className="talk-status">{content.status}</span>{content.id === 'fightclub' && <p>The game needs a working build or URL before this cabinet can launch it.</p>}{content.href && <Link href={content.href} prefetch={false} onClick={()=>saveSession(runtimeRef.current)}>{content.linkLabel}<ArrowUpRight size={17}/></Link>}</Modal>}
    {ui.mode === 'tickets' && <TicketBoothMenu progress={progress} onRide={startRun} onClose={resume}/>}
    {results && ui.mode === 'snowboard' && <RunResults result={results.result} outcome={results.outcome} onAction={resultsAction}/>}
    {skateResults && ui.mode === 'skating' && <SkateResults result={skateResults.result} outcome={skateResults.outcome} onAction={skateResultsAction}/>}

    {ui.mode === 'error' && <div className="planet-failure"><h2>The planet couldn’t load.</h2><p>Try again, or open a destination directly.</p><button onClick={()=>window.location.reload()}>Reload world</button><nav>{DESTINATIONS.map(d=><Link key={d.id} href={d.href}>{d.label}</Link>)}</nav></div>}
    <span className="sr-only" aria-live="polite">{active && nearby ? `Near ${interactLabel}. Press E.` : ''}</span>
  </main>;
}
