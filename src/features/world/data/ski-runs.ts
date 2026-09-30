/** The four snowboard runs on mountain revision 4.
 * Centerlines are authored chart points; heights come from the mountain itself,
 * smoothed and limited to each rating's grade band (physical degrees), so runs sit
 * in the slope as cut benches instead of raised ribbons. Terrain features (rollers,
 * table-top kickers, moguls, drops, narrows) are authored by distance down the run
 * and added to the groomed surface, so walking, riding and rendering all agree.
 * Pure data and queries: no scene, input or game code.
 */
import { MAP_RADIUS } from './world-map';
import { MOUNTAIN_FINISH_AREAS, mountainBaseAt, mountainRunPlatesAt, type FinishAreaId } from './mountain-layout';

export type Difficulty = 'green' | 'blue' | 'black' | 'double-black';
export type SkiRunId = 'sunday-cruise' | 'lighthouse-line' | 'timber-chute' | 'dead-coast-couloir';
type ChartPoint = readonly [number, number];
/** Distances (`s`, `from`, `to`) are physical metres down the run; lateral offsets are metres left of centre. */
export type SkiFeature =
  | { kind: 'roller'; s: number; length: number; height: number }
  | { kind: 'kicker'; s: number; ramp: number; lip: number; table: number; landing: number; width: number; offset: number }
  | { kind: 'moguls'; from: number; to: number; spacing: number; amplitude: number }
  | { kind: 'drop'; s: number; height: number; approach: number; face: number }
  | { kind: 'narrows'; from: number; to: number; width: number };
export type SkiGate = { s: number; offset: number };
export type SkiToken = { s: number; offset: number; lift: number };
type RunSpec = {
  id: SkiRunId; number: 1 | 2 | 3 | 4; name: string; difficulty: Difficulty; rating: string;
  /** Groomed width in physical metres. */
  width: number;
  /** Allowed physical grade band in degrees for the base profile (features add to it). */
  grade: readonly [number, number];
  /** Maximum banking into turns, degrees. */
  bank: number;
  finish: FinishAreaId;
  character: string;
  controls: readonly ChartPoint[];
  /** When set, the controls are polyline corners joined by arcs of this physical radius
   * (wider than half the run plus its feather, so the groomed surface never folds);
   * otherwise a monotone cubic runs through them. */
  turnRadius?: number;
  /** Convex crests in the base profile are rounded to at least this physical radius. */
  crest: number;
  features: readonly SkiFeature[];
  gates: readonly SkiGate[];
  /** Target time in seconds for the finish bonus. */
  par: number;
};
export type RunSample = {
  x: number; z: number;
  /** Physical horizontal distance from the start gate, metres. */
  s: number;
  /** Carved centerline height above the base sphere, before features. */
  h: number;
  /** Signed physical curvature, 1/m; positive turns left. */
  curvature: number;
};
export type SkiRun = RunSpec & {
  samples: readonly RunSample[]; length: number; drop: number;
  /** Per feature: the base profile's grade (rise over run) under its approach. */
  featureGrades: readonly number[];
  tokens: readonly SkiToken[];
  /** Respawn distances, clear of features. */
  checkpoints: readonly number[];
};
export type SkiRunSample = {
  run: SkiRun; index: number; t: number;
  /** Physical distance from the centerline. */
  distance: number;
  /** Signed physical offset; positive is left of the downhill direction. */
  lateral: number;
  s: number; progress: number; centerHeight: number;
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const DEGREE = Math.PI / 180;
/** Width of the blend from a groomed edge back to natural terrain, physical metres. */
export const RUN_FEATHER = 5;

const SPECS: readonly RunSpec[] = [
  {
    id: 'sunday-cruise', number: 1, name: 'Sunday Cruise', difficulty: 'green', rating: 'Green Circle', width: 14, grade: [6, 19], bank: 5, crest: 40, finish: 'resort', par: 31,
    character: 'Wide, easy sweeping turns across the south-west face, back to the resort and ticket booth.',
    controls: [[-4, 207], [-50, 190], [-8, 158], [-50, 128], [-10, 100], [-32, 80], [0, 64]], turnRadius: 13,
    features: [
      { kind: 'roller', s: 28, length: 14, height: .55 },
      { kind: 'kicker', s: 113, ramp: 5, lip: .75, table: 3, landing: 7, width: 5, offset: 3 },
      { kind: 'roller', s: 132, length: 12, height: .5 },
      { kind: 'kicker', s: 176, ramp: 5, lip: .8, table: 3, landing: 8, width: 5, offset: -3 },
      { kind: 'roller', s: 236, length: 10, height: .5 },
    ],
    gates: [],
  },
  {
    id: 'lighthouse-line', number: 2, name: 'Lighthouse Line', difficulty: 'blue', rating: 'Blue Square', width: 10, grade: [7, 24], bank: 10, crest: 30, finish: 'east', par: 27,
    character: 'Banked S-turns and slalom gates down the south-east face, ending on the bluff above the lighthouse cove.',
    controls: [[16, 208], [56, 190], [28, 160], [62, 130], [34, 104], [48, 76], [31, 44]], turnRadius: 11,
    features: [
      { kind: 'kicker', s: 40, ramp: 5.5, lip: 1, table: 3, landing: 7.5, width: 6, offset: 0 },
      { kind: 'roller', s: 96, length: 8, height: .75 },
      { kind: 'roller', s: 104, length: 8, height: .8 },
      { kind: 'roller', s: 112, length: 8, height: .75 },
      { kind: 'kicker', s: 150, ramp: 6, lip: 1.3, table: 3.5, landing: 8, width: 6, offset: 0 },
      { kind: 'kicker', s: 258, ramp: 5, lip: .9, table: 3, landing: 7, width: 5.5, offset: 0 },
    ],
    gates: [{ s: 64, offset: 2.6 }, { s: 77, offset: -2.6 }, { s: 122, offset: 2.6 }, { s: 135, offset: -2.6 }, { s: 170, offset: 2.6 }, { s: 183, offset: -2.6 },
      { s: 196, offset: 2.6 }, { s: 209, offset: -2.6 }, { s: 222, offset: 2.6 }, { s: 235, offset: -2.6 }, { s: 247, offset: 2.6 }],
  },
  {
    id: 'timber-chute', number: 3, name: 'Timber Chute', difficulty: 'black', rating: 'Black Diamond', width: 8, grade: [5, 36], bank: 8, crest: 22, finish: 'west', par: 26,
    character: 'Moguls, a tight glade chute and a drop down the steep west edge, then big kickers into the west forest.',
    controls: [[-20, 211], [-36, 210], [-50, 205], [-60, 195], [-65, 180], [-66, 162], [-66, 144], [-63, 128], [-60, 112], [-55, 96], [-49, 80], [-41, 64], [-33, 55], [-27, 48]],
    features: [
      { kind: 'moguls', from: 28, to: 70, spacing: 4.2, amplitude: .3 },
      { kind: 'narrows', from: 78, to: 100, width: 5 },
      { kind: 'drop', s: 112, height: 2, approach: 10, face: 1.4 },
      { kind: 'kicker', s: 160, ramp: 6, lip: 1.5, table: 4, landing: 9, width: 6, offset: 0 },
      { kind: 'kicker', s: 196, ramp: 6.5, lip: 1.7, table: 4, landing: 9.5, width: 6, offset: 0 },
    ],
    gates: [],
  },
  {
    id: 'dead-coast-couloir', number: 4, name: 'Dead Coast Couloir', difficulty: 'double-black', rating: 'Double Black Diamond', width: 6, grade: [6, 44], bank: 6, crest: 18, finish: 'resort', par: 20,
    character: 'Cornice drop-in, a narrow couloir and a cliff straight down the fall line, then a big-air kicker to the resort.',
    controls: [[6, 208], [10, 196], [14, 176], [16, 150], [16, 124], [14, 100], [11, 80], [8, 70], [6, 64]],
    features: [
      { kind: 'drop', s: 16, height: 1.6, approach: 10, face: 1.2 },
      { kind: 'narrows', from: 26, to: 92, width: 4.5 },
      { kind: 'drop', s: 116, height: 2.8, approach: 10, face: 1.6 },
      { kind: 'kicker', s: 170, ramp: 7, lip: 1.9, table: 4, landing: 10, width: 6, offset: 0 },
    ],
    gates: [],
  },
];

/** Shape-preserving cubic through z-descending control points; x turns round without overshoot. */
function sampleCenterline(controls: readonly ChartPoint[], maxStep = .4): [number, number][] {
  const t = controls.map(point => -point[1]);
  const h = t.slice(1).map((value, index) => value - t[index]);
  const values = controls.map(point => point[0]);
  const delta = h.map((step, index) => (values[index + 1] - values[index]) / step);
  const m = new Array(values.length).fill(0);
  for (let i = 1; i < values.length - 1; i++) {
    if (delta[i - 1] * delta[i] > 0) {
      const a = 2 * h[i] + h[i - 1], b = h[i] + 2 * h[i - 1];
      m[i] = (a + b) / (a / delta[i - 1] + b / delta[i]);
    }
  }
  const endpoint = (h0: number, h1: number, d0: number, d1: number) => {
    const value = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (value * d0 <= 0) return 0;
    return d0 * d1 <= 0 && Math.abs(value) > Math.abs(3 * d0) ? 3 * d0 : value;
  };
  m[0] = endpoint(h[0], h[1], delta[0], delta[1]);
  const last = h.length - 1;
  m[m.length - 1] = endpoint(h[last], h[last - 1], delta[last], delta[last - 1]);
  const result: [number, number][] = [];
  for (let i = 0; i < h.length; i++) {
    const count = Math.max(1, Math.ceil(Math.hypot(h[i], values[i + 1] - values[i]) / maxStep));
    for (let j = 0; j < count; j++) {
      const u = j / count, u2 = u * u, u3 = u2 * u;
      const x = (2 * u3 - 3 * u2 + 1) * values[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * values[i + 1] + (u3 - u2) * h[i] * m[i + 1];
      result.push([x, -(t[i] + u * h[i])]);
    }
  }
  result.push([controls[controls.length - 1][0], controls[controls.length - 1][1]]);
  return result;
}

/** Physical metric of a chart displacement at elevation h. */
function metric(x: number, h: number) {
  const k = (MAP_RADIUS + h) / MAP_RADIUS;
  return { x: k, z: Math.cos(x / MAP_RADIUS) * k };
}

/** Straight legs between chart corners, joined by circular arcs of a physical radius.
 * Each arc is laid out in its corner's local metric frame; legs descend in z, and so do
 * the arcs between them. */
function filletCenterline(controls: readonly ChartPoint[], radius: number, maxStep = .4): [number, number][] {
  const result: [number, number][] = [];
  const line = (a: readonly [number, number], b: readonly [number, number]) => {
    const m = metric((a[0] + b[0]) / 2, mountainBaseAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    const count = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * m.x, (b[1] - a[1]) * m.z) / maxStep));
    for (let j = 0; j < count; j++) result.push([a[0] + (b[0] - a[0]) * j / count, a[1] + (b[1] - a[1]) * j / count]);
  };
  let cursor: readonly [number, number] = controls[0];
  for (let i = 1; i < controls.length - 1; i++) {
    const [px, pz] = controls[i], m = metric(px, mountainBaseAt(px, pz));
    const ax = (controls[i - 1][0] - px) * m.x, az = (controls[i - 1][1] - pz) * m.z;
    const bx = (controls[i + 1][0] - px) * m.x, bz = (controls[i + 1][1] - pz) * m.z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const ua = [ax / la, az / la], ub = [bx / lb, bz / lb];
    const half = Math.acos(clamp(ua[0] * ub[0] + ua[1] * ub[1], -1, 1)) / 2;
    if (half > Math.PI / 2 - 1e-4) continue;
    // Tangent length for the radius, limited so neighbouring arcs never overlap.
    let r = radius, tangent = r / Math.tan(half);
    const room = Math.min(la, lb) / 2;
    if (tangent > room) { tangent = room; r = tangent * Math.tan(half); }
    const bisector = Math.hypot(ua[0] + ub[0], ua[1] + ub[1]) || 1, reach = r / Math.sin(half);
    const cx = (ua[0] + ub[0]) / bisector * reach, cz = (ua[1] + ub[1]) / bisector * reach;
    const t1 = [ua[0] * tangent, ua[1] * tangent], t2 = [ub[0] * tangent, ub[1] * tangent];
    line(cursor, [px + t1[0] / m.x, pz + t1[1] / m.z]);
    const start = Math.atan2(t1[1] - cz, t1[0] - cx), end = Math.atan2(t2[1] - cz, t2[0] - cx);
    const sweep = Math.atan2(Math.sin(end - start), Math.cos(end - start));
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) * r / maxStep));
    for (let j = 0; j < steps; j++) {
      const angle = start + sweep * j / steps;
      result.push([px + (cx + r * Math.cos(angle)) / m.x, pz + (cz + r * Math.sin(angle)) / m.z]);
    }
    cursor = [px + t2[0] / m.x, pz + t2[1] / m.z];
  }
  line(cursor, controls[controls.length - 1]);
  result.push([controls[controls.length - 1][0], controls[controls.length - 1][1]]);
  return result;
}

/** Gaussian smoothing of a signal sampled at non-uniform distances. */
function gaussian(values: readonly number[], s: readonly number[], sigma: number): number[] {
  return values.map((_, i) => {
    let sum = 0, weight = 0;
    for (let j = i; j >= 0 && s[i] - s[j] <= sigma * 3; j--) { const w = Math.exp(-((s[i] - s[j]) ** 2) / (2 * sigma * sigma)) * ((s[Math.min(j + 1, s.length - 1)] - s[Math.max(j - 1, 0)]) || 1); sum += values[j] * w; weight += w; }
    for (let j = i + 1; j < values.length && s[j] - s[i] <= sigma * 3; j++) { const w = Math.exp(-((s[j] - s[i]) ** 2) / (2 * sigma * sigma)) * ((s[Math.min(j + 1, s.length - 1)] - s[Math.max(j - 1, 0)]) || 1); sum += values[j] * w; weight += w; }
    return weight > 0 ? sum / weight : values[i];
  });
}

/** Round convex crests of a profile to a physical radius by cutting, never filling:
 * a disk rolled beneath the profile (morphological opening). Ends continue on their grade. */
function roundCrests(profile: readonly number[], s: readonly number[], radius: number): number[] {
  const n = profile.length, reach = radius * .8, step = .4;
  const endGrade = (from: number, to: number) => (profile[to] - profile[from]) / ((s[to] - s[from]) || 1);
  let head = 0; while (head < n - 1 && s[head] < 5) head++;
  let tail = n - 1; while (tail > 0 && s[n - 1] - s[tail] < 5) tail--;
  const g0 = endGrade(0, head), g1 = endGrade(tail, n - 1);
  const xs: number[] = [], hs: number[] = [];
  for (let d = reach; d > 0; d -= step) { xs.push(-d); hs.push(profile[0] - g0 * d); }
  const offset = xs.length;
  for (let i = 0; i < n; i++) { xs.push(s[i]); hs.push(profile[i]); }
  for (let d = step; d <= reach; d += step) { xs.push(s[n - 1] + d); hs.push(profile[n - 1] + g1 * d); }
  const cap = (d: number) => Math.sqrt(Math.max(0, radius * radius - d * d)) - radius;
  const eroded = xs.map((x, i) => {
    let low = Infinity;
    for (let j = i; j >= 0 && x - xs[j] <= reach; j--) low = Math.min(low, hs[j] - cap(xs[j] - x));
    for (let j = i + 1; j < xs.length && xs[j] - x <= reach; j++) low = Math.min(low, hs[j] - cap(xs[j] - x));
    return low;
  });
  const opened: number[] = [];
  for (let i = offset; i < offset + n; i++) {
    let high = -Infinity;
    for (let j = i; j >= 0 && xs[i] - xs[j] <= reach; j--) high = Math.max(high, eroded[j] + cap(xs[i] - xs[j]));
    for (let j = i + 1; j < xs.length && xs[j] - xs[i] <= reach; j++) high = Math.max(high, eroded[j] + cap(xs[i] - xs[j]));
    opened.push(Math.min(profile[i - offset], high));
  }
  return opened;
}

/** Span of distances a feature occupies, for masks and checkpoint placement. */
export function featureSpan(feature: SkiFeature): [number, number] {
  switch (feature.kind) {
    case 'roller': return [feature.s - feature.length / 2, feature.s + feature.length / 2];
    case 'kicker': return [feature.s - feature.ramp, feature.s + feature.table + feature.landing];
    case 'moguls': case 'narrows': return [feature.from, feature.to];
    case 'drop': return [feature.s - feature.approach, feature.s + feature.face];
  }
}

/** Tokens: carving lines between features, plus an air line above each kicker's table. */
function tokensFor(spec: RunSpec, length: number): SkiToken[] {
  const tokens: SkiToken[] = [];
  const busy = spec.features.filter(feature => feature.kind !== 'roller' && feature.kind !== 'narrows').map(featureSpan);
  const widthAt = (s: number) => runWidthAt(spec, s);
  for (let s = 24; s < length - 20; s += 34) {
    if (busy.some(([a, b]) => s > a - 6 && s < b + 6)) continue;
    for (let i = 0; i < 5; i++) {
      const at = s + i * 2.6;
      tokens.push({ s: at, offset: Math.sin(at * .21) * Math.max(0, Math.min(3.2, widthAt(at) / 2 - 1.2)), lift: .9 });
    }
  }
  for (const feature of spec.features) {
    if (feature.kind !== 'kicker') continue;
    for (let i = 0; i < 3; i++) tokens.push({ s: feature.s + .6 + i * (feature.table + feature.landing * .4) / 2, offset: feature.offset, lift: 1.6 + feature.lip * (1.1 - Math.abs(i - 1) * .35) });
  }
  return tokens.sort((a, b) => a.s - b.s);
}

/** Gaussian-smooth a sampled centerline so curvature ramps into and out of every turn
 * (a straight meeting an arc otherwise leaves a kink line across the carved surface).
 * Ends are extended along their own direction first, so both stay exactly in place. */
function smoothPath(points: readonly [number, number][], sigma: number): [number, number][] {
  const n = points.length;
  const distance = [0];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1], b = points[i], m = metric((a[0] + b[0]) / 2, mountainBaseAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    distance.push(distance[i - 1] + Math.hypot((b[0] - a[0]) * m.x, (b[1] - a[1]) * m.z));
  }
  const reach = sigma * 3, total = distance[n - 1];
  const direction = (from: number, to: number) => {
    const d = distance[to] - distance[from] || 1;
    return [(points[to][0] - points[from][0]) / d, (points[to][1] - points[from][1]) / d];
  };
  let head = 0; while (head < n - 1 && distance[head] < 3) head++;
  let tail = n - 1; while (tail > 0 && total - distance[tail] < 3) tail--;
  const [hx, hz] = direction(0, head), [tx, tz] = direction(tail, n - 1);
  const ds: number[] = [], xs: number[] = [], zs: number[] = [];
  for (let d = reach; d > 0; d -= .4) { ds.push(-d); xs.push(points[0][0] - hx * d); zs.push(points[0][1] - hz * d); }
  const offset = ds.length;
  for (let i = 0; i < n; i++) { ds.push(distance[i]); xs.push(points[i][0]); zs.push(points[i][1]); }
  for (let d = .4; d <= reach; d += .4) { ds.push(total + d); xs.push(points[n - 1][0] + tx * d); zs.push(points[n - 1][1] + tz * d); }
  const sx = gaussian(xs, ds, sigma), sz = gaussian(zs, ds, sigma);
  const result = points.map((_, i) => [sx[i + offset], sz[i + offset]] as [number, number]);
  result[0] = [points[0][0], points[0][1]]; result[n - 1] = [points[n - 1][0], points[n - 1][1]];
  return result;
}

/** Gaussian-smooth a profile, extending both ends along their own grade first. */
function smoothProfile(profile: readonly number[], s: readonly number[], sigma: number): number[] {
  const n = profile.length, reach = sigma * 3, step = .4;
  const grade = (from: number, to: number) => (profile[to] - profile[from]) / ((s[to] - s[from]) || 1);
  let head = 0; while (head < n - 1 && s[head] < 3) head++;
  let tail = n - 1; while (tail > 0 && s[n - 1] - s[tail] < 3) tail--;
  const g0 = grade(0, head), g1 = grade(tail, n - 1);
  const xs: number[] = [], hs: number[] = [];
  for (let d = reach; d > 0; d -= step) { xs.push(-d); hs.push(profile[0] - g0 * d); }
  const offset = xs.length;
  for (let i = 0; i < n; i++) { xs.push(s[i]); hs.push(profile[i]); }
  for (let d = step; d <= reach; d += step) { xs.push(s[n - 1] + d); hs.push(profile[n - 1] + g1 * d); }
  return gaussian(hs, xs, sigma).slice(offset, offset + n);
}

/** Clamp every step of a profile into a grade band, holding both ends. */
function clampGrades(profile: number[], s: readonly number[], gMin: number, gMax: number, passes: number) {
  const start = profile[0], end = profile[profile.length - 1];
  for (let pass = 0; pass < passes; pass++) {
    profile[0] = start;
    for (let i = 1; i < profile.length; i++) {
      const d = s[i] - s[i - 1];
      profile[i] = Math.min(Math.max(profile[i], profile[i - 1] - gMax * d), profile[i - 1] - gMin * d);
    }
    profile[profile.length - 1] = end;
    for (let i = profile.length - 2; i >= 0; i--) {
      const d = s[i + 1] - s[i];
      profile[i] = Math.min(Math.max(profile[i], profile[i + 1] + gMin * d), profile[i + 1] + gMax * d);
    }
  }
  profile[0] = start; profile[profile.length - 1] = end;
}

function buildRun(spec: RunSpec): SkiRun {
  const points = smoothPath(spec.turnRadius ? filletCenterline(spec.controls, spec.turnRadius) : sampleCenterline(spec.controls), 2.5);
  const natural = points.map(([x, z]) => mountainRunPlatesAt(x, z, mountainBaseAt(x, z)));
  const s = [0];
  for (let i = 1; i < points.length; i++) {
    const m = metric((points[i][0] + points[i - 1][0]) / 2, (natural[i] + natural[i - 1]) / 2);
    s.push(s[i - 1] + Math.hypot((points[i][0] - points[i - 1][0]) * m.x, (points[i][1] - points[i - 1][1]) * m.z));
  }
  // Grade-limited profile: follow the mountain, but clamp every step into the band, then
  // round the crests the band leaves so the snow does not throw riders at every kink.
  const [gMin, gMax] = spec.grade.map(value => Math.tan(value * DEGREE));
  let profile = natural.slice();
  for (let pass = 0; pass < 6; pass++) profile = profile.map((h, i) => i === 0 || i === profile.length - 1 ? h : (profile[i - 1] + 2 * h + profile[i + 1]) / 4);
  const start = natural[0], end = natural[natural.length - 1];
  profile[0] = start; profile[profile.length - 1] = end;
  clampGrades(profile, s, gMin, gMax, 10);
  profile = roundCrests(profile, s, spec.crest);
  // A light Gaussian pass removes the clamp's sample-scale kinks; averaging in-band grades
  // stays in band. Ends continue on their own grade so they stay put.
  profile = smoothProfile(profile, s, 1.5);
  profile[0] = start; profile[profile.length - 1] = end;
  clampGrades(profile, s, gMin, gMax, 1);
  // Heading (unwrapped), differentiated over +-1.5m and smoothed along the run, gives a
  // continuous curvature for banking into turns.
  const heading: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], m = metric(points[i][0], profile[i]);
    let angle = Math.atan2((b[1] - a[1]) * m.z, (b[0] - a[0]) * m.x);
    if (i > 0) angle = heading[i - 1] + Math.atan2(Math.sin(angle - heading[i - 1]), Math.cos(angle - heading[i - 1]));
    heading.push(angle);
  }
  const turning = points.map((_, i) => {
    let j = i, k = i;
    while (j > 0 && s[i] - s[j] < 1.5) j--;
    while (k < points.length - 1 && s[k] - s[i] < 1.5) k++;
    return s[k] > s[j] ? (heading[k] - heading[j]) / (s[k] - s[j]) : 0;
  });
  const curvature = gaussian(turning, s, 2.5);
  const samples = points.map(([x, z], i) => ({ x, z, s: s[i], h: profile[i], curvature: curvature[i] }));
  const length = s[s.length - 1];
  const heightAt = (distance: number) => {
    let i = 0;
    while (i < samples.length - 2 && samples[i + 1].s < distance) i++;
    const a = samples[i], b = samples[i + 1], t = clamp((distance - a.s) / ((b.s - a.s) || 1));
    return mix(a.h, b.h, t);
  };
  const featureGrades = spec.features.map(feature => {
    const [a, b] = featureSpan(feature);
    return b > a ? (heightAt(a) - heightAt(b)) / (b - a) : 0;
  });
  const spans = spec.features.filter(feature => feature.kind !== 'narrows').map(featureSpan);
  const checkpoints = [0];
  for (let target = 40; target < length - 15; target += 40) {
    let candidate = target;
    while (spans.some(([a, b]) => candidate > a - 4 && candidate < b + 4) && candidate < length - 15) candidate += 2;
    if (candidate < length - 15 && candidate - checkpoints[checkpoints.length - 1] > 20) checkpoints.push(candidate);
  }
  return { ...spec, samples, length, drop: start - end, featureGrades, tokens: tokensFor(spec, length), checkpoints };
}

export const SKI_RUNS: readonly SkiRun[] = SPECS.map(buildRun);
export const SKI_RUN_IDS = SKI_RUNS.map(run => run.id);
export function skiRunById(id: SkiRunId): SkiRun { return SKI_RUNS.find(run => run.id === id)!; }
export const SKI_FINISH_AREAS = MOUNTAIN_FINISH_AREAS;

/** Groomed width at a distance down the run, narrowed smoothly through chutes. */
export function runWidthAt(run: Pick<SkiRun, 'width' | 'features'>, s: number): number {
  let width = run.width;
  for (const feature of run.features) {
    if (feature.kind !== 'narrows') continue;
    const inside = smooth(feature.from - 6, feature.from, s) * (1 - smooth(feature.to, feature.to + 6, s));
    width = Math.min(width, mix(run.width, feature.width, inside));
  }
  return width;
}

/** Feature height added to the groomed surface at a run-local position. */
export function runFeatureOffset(run: SkiRun, s: number, lateral: number): number {
  let offset = 0;
  const half = runWidthAt(run, s) / 2;
  for (let index = 0; index < run.features.length; index++) {
    const feature = run.features[index];
    switch (feature.kind) {
      case 'roller': {
        const u = (s - feature.s) / feature.length;
        if (Math.abs(u) < .5) offset += feature.height * .5 * (1 + Math.cos(u * Math.PI * 2));
        break;
      }
      case 'kicker': {
        const across = 1 - smooth(feature.width / 2, feature.width / 2 + 1.2, Math.abs(lateral - feature.offset));
        if (across <= 0) break;
        const rampStart = feature.s - feature.ramp, tableEnd = feature.s + feature.table;
        let h = 0;
        // A curved transition steepens toward the lip (~atan(1.8 lip/ramp)), then a flat
        // table-top and a landing that is steeper than the base slope.
        if (s > rampStart && s <= feature.s) h = feature.lip * ((s - rampStart) / feature.ramp) ** 1.8;
        else if (s > feature.s && s <= tableEnd) h = feature.lip;
        else if (s > tableEnd && s < tableEnd + feature.landing) h = feature.lip * (1 - smooth(tableEnd, tableEnd + feature.landing, s));
        offset += h * across;
        break;
      }
      case 'moguls': {
        if (s <= feature.from || s >= feature.to) break;
        const taper = smooth(feature.from, feature.from + feature.spacing, s) * (1 - smooth(feature.to - feature.spacing, feature.to, s)) * (1 - smooth(half - 1.2, half, Math.abs(lateral)));
        offset += feature.amplitude * Math.sin((s - feature.from) / feature.spacing * Math.PI * 2) * Math.sin(lateral / feature.spacing * Math.PI * 2 + .7) * taper;
        break;
      }
      case 'drop': {
        // A shelf builds over the approach, never climbing (at most level against the base
        // slope, so a slow rider cannot stall), then the whole width falls away at the face.
        const rise = smooth(feature.s - feature.approach, feature.s - feature.face, s);
        const level = run.featureGrades[index] * Math.max(0, s - feature.s + feature.approach) * .95;
        offset += Math.min(feature.height * rise, level) * (1 - smooth(feature.s - feature.face / 2, feature.s + feature.face / 2, s));
        break;
      }
      case 'narrows': break;
    }
  }
  return offset;
}

type Segment = {
  run: SkiRun; index: number; ax: number; az: number;
  /** Chart deltas of the segment and of its neighbours (itself at either end of the run). */
  cx: number; cz: number; px: number; pz: number; nx: number; nz: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
};
// Evaluate only segments in the query's cell, in authored order.
const CELL = 8;
const cells = new Map<number, Segment[]>();
const cellKey = (cx: number, cz: number) => cx + 64 + (cz + 128) * 256;
for (const run of SKI_RUNS) {
  for (let index = 0; index < run.samples.length - 1; index++) {
    const a = run.samples[index], b = run.samples[index + 1];
    const m = metric((a.x + b.x) / 2, (a.h + b.h) / 2);
    // Chart padding covering the widest groomed edge plus feather at this elevation.
    const reach = (run.width / 2 + RUN_FEATHER + .5) / Math.min(m.x, m.z);
    const before = run.samples[index - 1] ?? a, after = run.samples[index + 2] ?? b;
    const segment: Segment = { run, index, ax: a.x, az: a.z, cx: b.x - a.x, cz: b.z - a.z,
      px: index > 0 ? a.x - before.x : b.x - a.x, pz: index > 0 ? a.z - before.z : b.z - a.z,
      nx: index + 2 < run.samples.length ? after.x - b.x : b.x - a.x, nz: index + 2 < run.samples.length ? after.z - b.z : b.z - a.z,
      minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach, minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
    for (let cx = Math.floor(segment.minX / CELL); cx <= Math.floor(segment.maxX / CELL); cx++) {
      for (let cz = Math.floor(segment.minZ / CELL); cz <= Math.floor(segment.maxZ / CELL); cz++) {
        const key = cellKey(cx, cz), list = cells.get(key);
        if (list) list.push(segment); else cells.set(key, [segment]);
      }
    }
  }
}
const NO_SEGMENTS: readonly Segment[] = [];
function segmentsAt(x: number, z: number): readonly Segment[] {
  return cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NO_SEGMENTS;
}

/** A run sample plus its distance in the query's own latitude-scaled chart metric. Every
 * candidate of one query is measured in that single metric (per-segment elevation scales
 * would let each lower segment's end vertex win and turn the snow into a staircase), and
 * segments own the space between the bisectors at their ends, so distance along and across
 * the run stay continuous round every bend instead of jumping between segment feet. */
type Candidate = SkiRunSample & { chart: number; owned: boolean };
function sampleFor(segment: Segment, x: number, z: number, cq: number): Candidate {
  const ox = x - segment.ax, oz = (z - segment.az) * cq, dx = segment.cx, dz = segment.cz * cq;
  const length = Math.hypot(dx, dz) || 1e-12, ux = dx / length, uz = dz / length;
  const unit = (ex: number, ez: number) => { const l = Math.hypot(ex, ez) || 1; return [ex / l, ez / l]; };
  const [pxu, pzu] = unit(segment.px, segment.pz * cq), [nxu, nzu] = unit(segment.nx, segment.nz * cq);
  const [ax, az] = unit(ux + pxu, uz + pzu), [bx, bz] = unit(ux + nxu, uz + nzu);
  const qx = ox - dx, qz = oz - dz;
  const ahead = ox * ax + oz * az, behind = qx * bx + qz * bz;
  const owned = ahead >= 0 && behind <= 0;
  const t = owned ? (ahead - behind > 1e-12 ? ahead / (ahead - behind) : 0) : ahead < 0 ? 0 : 1;
  // Positive lateral is left of the downhill travel direction.
  const side = mix(ax * oz - az * ox, bx * qz - bz * qx, t);
  const chart = owned ? Math.abs(side) : t === 0 ? Math.hypot(ox, oz) : Math.hypot(qx, qz);
  const samples = segment.run.samples, a = samples[segment.index], b = samples[segment.index + 1];
  const s = mix(a.s, b.s, t), centerHeight = profileHeight(samples, segment.index, t), k = (MAP_RADIUS + centerHeight) / MAP_RADIUS;
  return { run: segment.run, index: segment.index, t, distance: chart * k, lateral: side * k, s, progress: s / segment.run.length, centerHeight, chart, owned };
}
const OUTSIDE = 1e6;
/** Cubic Hermite height between samples (central-difference slopes), so the profile is
 * smooth to the first derivative instead of kinking at every sample. */
function profileHeight(samples: readonly RunSample[], index: number, t: number) {
  const a = samples[index], b = samples[index + 1], p = samples[Math.max(0, index - 1)], q = samples[Math.min(samples.length - 1, index + 2)];
  const span = b.s - a.s || 1e-9;
  const ma = (b.h - p.h) / ((b.s - p.s) || 1e-9) * span, mb = (q.h - a.h) / ((q.s - a.s) || 1e-9) * span;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.h + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * b.h + (t3 - t2) * mb;
}
const inBounds = (segment: Segment, x: number, z: number) => x >= segment.minX && x <= segment.maxX && z >= segment.minZ && z <= segment.maxZ;

/** Nearest run centerline within groomed width + feather, or undefined. */
export function skiRunSampleAt(x: number, z: number, runId?: SkiRunId): SkiRunSample | undefined {
  const cq = Math.cos(x / MAP_RADIUS);
  let nearest: Candidate | undefined, key = Infinity, kRef = 0;
  for (const segment of segmentsAt(x, z)) {
    if ((runId && segment.run.id !== runId) || !inBounds(segment, x, z)) continue;
    const sample = sampleFor(segment, x, z, cq);
    // One edge scale per query, so ties within a run are decided by geometry alone.
    kRef ||= (MAP_RADIUS + sample.centerHeight) / MAP_RADIUS;
    // The segment that owns a point always beats neighbours measured to an end vertex.
    const score = sample.chart - sample.run.width / 2 / kRef + (sample.owned ? 0 : OUTSIDE);
    if (score < key) { nearest = sample; key = score; }
  }
  return nearest;
}

/** True on groomed snow (with a small margin for the visible edge). */
export function onGroomedRun(x: number, z: number, margin = .6): boolean {
  const sample = skiRunSampleAt(x, z);
  return !!sample && sample.distance <= runWidthAt(sample.run, sample.s) / 2 + margin && sample.s > 0 && sample.s < sample.run.length;
}

/** Groomed cross-section height at a run sample: level across, banked into turns, plus features. */
export function runSurfaceHeight(sample: SkiRunSample): number {
  const a = sample.run.samples[sample.index], b = sample.run.samples[sample.index + 1];
  const curvature = mix(a.curvature, b.curvature, sample.t);
  const maxBank = Math.tan(sample.run.bank * DEGREE);
  const half = runWidthAt(sample.run, sample.s) / 2;
  // A 10m-radius turn reaches the run's full bank; the inside of the turn is lower.
  const bank = clamp(curvature * 10, -1, 1) * maxBank;
  const lateral = clamp(sample.lateral, -half, half);
  return sample.centerHeight - bank * lateral + runFeatureOffset(sample.run, sample.s, lateral);
}

/** Carve every nearby run into the supplied natural height. */
export function skiCarveAt(x: number, z: number, natural: number): number {
  const segments = segmentsAt(x, z);
  if (segments.length === 0) return natural;
  // Closest sample per run, then blend far-to-near so the nearest groomed edge wins.
  const cq = Math.cos(x / MAP_RADIUS);
  const byRun = new Map<SkiRunId, Candidate>();
  for (const segment of segments) {
    if (!inBounds(segment, x, z)) continue;
    const sample = sampleFor(segment, x, z, cq);
    const previous = byRun.get(segment.run.id);
    if (!previous || sample.chart + (sample.owned ? 0 : OUTSIDE) < previous.chart + (previous.owned ? 0 : OUTSIDE)) byRun.set(segment.run.id, sample);
  }
  if (byRun.size === 0) return natural;
  const ordered = [...byRun.values()].sort((a, b) => (b.distance - b.run.width / 2) - (a.distance - a.run.width / 2));
  let height = natural;
  for (const sample of ordered) {
    const half = runWidthAt(sample.run, sample.s) / 2;
    if (sample.distance >= half + RUN_FEATHER) continue;
    // Do not carve beyond either end of a run; its start and finish plates own those areas.
    if ((sample.index === 0 && sample.t === 0) || (sample.index === sample.run.samples.length - 2 && sample.t === 1)) continue;
    // The last metres of a run belong to its finish plate: there the feather yields, so a
    // run's fringe never wraps round past its finish line into neighbouring ground.
    const fringe = 1 - smooth(half, half + 1, sample.distance) * (1 - smooth(2, 6, sample.run.length - sample.s));
    height = mix(height, runSurfaceHeight(sample), (1 - smooth(half, half + RUN_FEATHER, sample.distance)) * fringe);
  }
  return height;
}

/** Chart position of a run-local point (distance down the run, metres left of centre). */
export function runPointAt(run: SkiRun, s: number, lateral = 0): { x: number; z: number; tangent: { east: number; north: number } } {
  const samples = run.samples;
  let low = 0, high = samples.length - 1;
  const target = clamp(s, 0, run.length);
  while (high - low > 1) { const mid = (low + high) >> 1; if (samples[mid].s < target) low = mid; else high = mid; }
  const a = samples[low], b = samples[high], t = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
  const x = mix(a.x, b.x, t), z = mix(a.z, b.z, t), m = metric(x, mix(a.h, b.h, t));
  // Central-difference tangents at both ends, blended, so offsets turn smoothly round arcs.
  const tangentAt = (i: number) => {
    const p = samples[Math.max(0, i - 1)], q = samples[Math.min(samples.length - 1, i + 1)];
    const e = (q.x - p.x) * m.x, n = (q.z - p.z) * m.z, l = Math.hypot(e, n) || 1;
    return [e / l, n / l];
  };
  const [ea, na] = tangentAt(low), [eb, nb] = tangentAt(high);
  const east = mix(ea, eb, t), north = mix(na, nb, t), length = Math.hypot(east, north) || 1;
  const te = east / length, tn = north / length;
  // Left of travel is the tangent rotated +90 degrees in the east-north plane.
  return { x: x - tn * lateral / m.x, z: z + te * lateral / m.z, tangent: { east: te, north: tn } };
}

/** Margins (metres) around detailed feature meshes: full mask inside the first, fading to the second. */
export const FEATURE_MESH_MARGIN = { core: 1.5, outer: 2.5 } as const;
/** Features drawn with their own detailed mesh (kickers, moguls, drops). */
export const detailedFeatures = (run: SkiRun) => run.features.filter(feature => feature.kind === 'kicker' || feature.kind === 'moguls' || feature.kind === 'drop');
/** 0..1 footprint weight of detailed feature meshes, for lowering the coarse terrain beneath them. */
export function skiFeatureMaskAt(x: number, z: number): number {
  const sample = skiRunSampleAt(x, z);
  if (!sample) return 0;
  const { core, outer } = FEATURE_MESH_MARGIN;
  const across = 1 - smooth(runWidthAt(sample.run, sample.s) / 2 + core, runWidthAt(sample.run, sample.s) / 2 + outer, sample.distance);
  if (across <= 0) return 0;
  let along = 0;
  for (const feature of detailedFeatures(sample.run)) {
    const [a, b] = featureSpan(feature);
    along = Math.max(along, smooth(a - outer, a - core, sample.s) * (1 - smooth(b + core, b + outer, sample.s)));
  }
  return along * across;
}
