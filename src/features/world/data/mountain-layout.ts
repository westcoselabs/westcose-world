/** Exact approved mountain revision 3, ported from docs/design/mountain-approval/proposal-data.mjs.
 * Pure layout data: no scene, movement, or mini-game dependencies.
 */
export type MountainMapPoint = readonly [number, number];
export type MountainPoint = readonly [number, number, number];
export type MountainRun = {
  id: 'ski-central' | 'ski-west' | 'ski-east'; number: 1 | 2 | 3;
  name: string; width: number; gateWidth: number; character: string;
  controls: readonly MountainPoint[]; points: readonly MountainPoint[];
};
export type MountainArea = {
  x: number; z: number; height: number; width: number; depth: number;
  feather?: number; shape?: 'oval'; treatment?: string;
};
export type MountainRouteSample = {
  run: MountainRun; distance: number; height: number; progress: number;
};
const layout = {
  status: 'Approved mountain layout — revision 3',
  radius: 36,
  seaLevel: -0.8,
  summit: { x: 0, z: 153, height: 40 },
  oldAnchors: { summit: { x: 0, z: 153, height: 32 }, resort: { x: 0, z: 115, height: 2.38 }, snowBaseZ: 127 },
  resort: { x: 1, z: 53.7, height: 2.8 },
  resortTerrace: { x: 1, z: 53.7, height: 2.8, width: 22, depth: 16, feather: 2, shape: 'oval' as const, treatment: 'compact resort immediately downhill of F, connected to the foot of the finish apron' },
  spawnPad: { x: 0, z: 151, height: 39.6, width: 6, depth: 6, feather: .8, facing: 'downhill, toward decreasing z' },
  decisionApron: { x: 0, z: 150, width: 32, depth: 12, treatment: 'gentle fan-out shoulder, not a flat summit-sized slab' },
  finishApron: { x: 1, z: 65, height: 2.8, width: 42, depth: 14, treatment: 'lower finishing area only; three separate run-out lanes, not the resort' },
  ticketHut: { x: 5.07216494845, z: 55, height: 2.8, width: 3.4, depth: 3 },
  lodge: { x: -3, z: 55, height: 2.8, width: 8, depth: 6 },
  pedestrianArrival: { x: 1, z: 50, height: 2.8, width: 10, depth: 3, treatment: 'shared forecourt at the base of F, in front of both resort buildings' },
  pedestrianLinks: [
    { id: 'resort-approach', width: 3, treatment: 'short connection from the existing forest approach to the base resort', points: [[0,45],[1,50]] as readonly MountainMapPoint[] },
    { id: 'lodge-walk', width: 2.4, points: [[1,50],[-3,52.2]] as readonly MountainMapPoint[] },
    { id: 'ticket-walk', width: 2.4, points: [[1,50],[5.07216494845,53.6]] as readonly MountainMapPoint[] },
    { id: 'finish-return', width: 2.4, treatment: 'walk from the foot of the run-out through the gap between the buildings', points: [[2.1,61],[2.1,56],[2.1,52],[1,50]] as readonly MountainMapPoint[] },
  ],
  alpineTransition: { lowerZ: 55, upperZ: 70 },
  runs: [
    {
      id: 'ski-central' as const, number: 1 as const, name: 'Central S-run', width: 6.5, gateWidth: 4.8,
      character: 'One broad, direct S sweep across the upper face, then a clean fall-line return toward F and the base resort.',
      controls: [[0,148,39],[3,138,34.5],[3.5,124,27],[-4,108,19],[-5,95,14],[-1,81,8],[0,68,3.15],[0,65,2.8],[0,64,2.8]] as readonly MountainPoint[],
    },
    {
      id: 'ski-west' as const, number: 3 as const, name: 'Western forest turns', width: 7, gateWidth: 4.8,
      character: 'Peels far west, then follows a distinct sequence of rounded forest-edge chicanes around tree islands before a separate western run-out.',
      controls: [[-5,148,38.4],[-12,143,36],[-21,134,32],[-25.5,123,27],[-21,111,20.5],[-25.5,99,15.8],[-21,87,10.2],[-15,75,5.9],[-11,68,3.15],[-11,65,2.8],[-11,64,2.8]] as readonly MountainPoint[],
    },
    {
      id: 'ski-east' as const, number: 2 as const, name: 'Eastern coastal sweep', width: 8, gateWidth: 4.8,
      character: 'One broad outer contour: sweeps right around the mountain toward the eastern coast, then makes one long lower return to F.',
      controls: [[5,148,38.4],[13,143,36.5],[22,134,32.5],[25,121,25.5],[25.5,106,18],[24.8,92,13],[21,84,9.8],[15,74,5.5],[13,68,3.15],[13,65,2.8],[13,64,2.8]] as readonly MountainPoint[],
    },
  ].map(run => ({ ...run, points: sampleRoute(run.controls) })),
  // Authored x/z outline; the snow reaches into the former upper forest.
  snowBoundary: [[0,60],[-14,63],[-24,70],[-27,85],[-30,105],[-29,130],[-25,150],[-14,160],[0,163],[12,159],[23,150],[28,128],[30,100],[27,74],[16,63]] as readonly MountainMapPoint[],
  mountainBoundary: [[0,51],[-17,55],[-27,65],[-31,88],[-31,113],[-28,142],[-24,157],[0,165],[24,157],[28,142],[31,113],[31,88],[27,65],[17,55]] as readonly MountainMapPoint[],
  gameWorkflow: [
    'Walk from the lower forest to the compact lodge and ticket hut immediately downhill of F.',
    'Interact with the ticket hut to start the future snowboard mini-game.',
    'Transfer to the small summit spawn pad; keep the timer stopped during route choice.',
    'Choose run 1, 2 or 3 at the three separate gates; countdown begins only at the selected start gate.',
    'Descend the selected unchanged route into its distinct lower section; no cross-run shortcuts or crossings.',
    'Cross that route’s finish at z68, then slow through its own run-out lane to z64.',
    'Show results at F: retry this route, return to summit to choose another, or walk down to the adjacent base-resort ticket hut.',
  ],
  notes: [
    'All widths/depths are physical metres, not x/z chart units; chart scale changes with elevation and latitude.',
    'The resort is grouped at z53.7 directly below the lower z65 finish apron F. All three run shapes and widths are unchanged.',
    'Lodge and ticket hut share one elevation and terrace, with approximately 3m of clear building-to-building space.',
    'The three racing centerlines do not meet; lodge and ticket buildings sit below the run-out, with a short finish-to-resort walking connection.',
    'Minimum intended clear shoulder between runs is about 4m below the summit fan-out; no trees, rocks or lift posts inside run widths.',
    'Groomed run widths are not the entire snow area. Keep the whole enlarged alpine bowl visibly snowy between runs.',
    'Shape-preserving cubic curves replace sharp control-point zigzags. Radial elevations never increase downhill; the final run-out is level. Preview sampling is not live movement/gameplay validation.',
    'The rear shore and ocean at z164 onward stay unchanged; the larger mountain is the same real mountain seen from the pier.',
  ],
};

/** Monotone cubic interpolation in downhill z; x turns round without overshoot. */
function sampleRoute(controls: readonly MountainPoint[], maxStep = .65): MountainPoint[] {
  const t = controls.map(point => -point[1]);
  const h = t.slice(1).map((value, index) => value - t[index]);
  function derivatives(values: number[]) {
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
    return m;
  }
  const values = [controls.map(p => p[0]), controls.map(p => p[2])];
  const slopes = values.map(derivatives);
  const result: MountainPoint[] = [];
  for (let i = 0; i < h.length; i++) {
    const count = Math.ceil(h[i] / maxStep);
    for (let j = 0; j < count; j++) {
      const u = j / count, u2 = u * u, u3 = u2 * u;
      const interpolate = (v: number[], m: number[]) => (2 * u3 - 3 * u2 + 1) * v[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * v[i + 1] + (u3 - u2) * h[i] * m[i + 1];
      result.push([interpolate(values[0], slopes[0]), -(t[i] + u * h[i]), interpolate(values[1], slopes[1])]);
    }
  }
  result.push([...controls.at(-1)!]);
  return result;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Alpine mask only; base-resort plates are applied independently after this blend. */
export function mountainBlendAt(x: number, z: number): number {
  return smooth(48, 60, z) * (1 - smooth(159, 164, z)) * (1 - smooth(30, 34, Math.abs(x)));
}

function coastAt(x: number, z: number, land: number): number {
  const forestWidth = 35 + 2 * Math.sin(z * .075) + 1.2 * Math.sin(z * .17 + .8);
  const inlandWidth = mix(34, forestWidth, smooth(10, 32, z));
  const width = mix(inlandWidth, 29, smooth(105, 140, z));
  const coastX = x - 1.6 * Math.sin(z * .05) * smooth(20, 60, z);
  const cross = 1 - smooth(width - 3, width + 4, Math.abs(coastX));
  const shoreline = -34 + 1.3 * Math.sin(x * .13) + .8 * Math.cos(x * .3);
  return -3 + (land + 3) * cross * smooth(shoreline - 2, shoreline + 3, z) * (1 - smooth(164, 171, z));
}

// The old mountain is retained only in the feather and beyond the rear shore.
function referenceMountainAt(x: number, z: number): number {
  let land = .16 + 2.22 * smooth(20, 110, z);
  if (z > 118 && z <= 153) {
    const t = clamp((z - 118) / 35);
    const spine = 2.1 * Math.sin(t * Math.PI * 2) * (1 - t);
    const ridge = Math.max(0, 1 - Math.abs(x - spine) / 28) ** 1.25;
    land = 2.38 + (32 - 2.38) * t ** 2.9 * ridge;
    const shoulder = (px: number, pz: number, peak: number, rx: number, rz: number) => 2.38 + (peak - 2.38) * Math.max(0, 1 - Math.abs((x - px) / rx) - Math.abs((z - pz) / rz));
    land = Math.max(land, shoulder(-11, 144, 24, 15, 22), shoulder(10, 147, 27, 15, 25), shoulder(-5, 136, 14, 10, 18));
  } else if (z > 153) {
    const ridge = Math.max(0, 1 - Math.abs(x) / 28) ** 1.25;
    const descent = (1 - clamp((z - 153) / 14)) ** 2;
    const originalRear = -3 + 35 * descent * ridge;
    const joinedRear = -3 + (5.38 + (32 - 2.38) * ridge) * descent;
    land = mix(joinedRear, originalRear, smooth(156, 164, z));
  }
  return coastAt(x, z, land);
}

const profile = [[55,2.8],[65,2.8],[68,3.15],[75,5.7],[87,10],[102,16],[116,23],[128,29],[139,35],[148,39],[153,40]];
function spineAt(z: number): number {
  if (z <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (z <= profile[i][0]) return mix(profile[i - 1][1], profile[i][1], (z - profile[i - 1][0]) / (profile[i][0] - profile[i - 1][0]));
  }
  return -3 + 43 * (1 - clamp((z - 153) / 14)) ** 2;
}

function broadMassifAt(x: number, z: number): number {
  // Broad lower bowl carries all three runs; only the upper summit narrows.
  // A narrow bell curve here would strand the outer runs on raised ribbons.
  const coreHalf = 26 - 22.5 * smooth(128, 153, z);
  const ridge = (1 - smooth(coreHalf, 34, Math.abs(x))) * (1 - .08 * smooth(0, coreHalf, Math.abs(x)));
  let land = 2.8 + (spineAt(z) - 2.8) * ridge;
  if (z <= 153) {
    const shoulder = (px: number, pz: number, peak: number, rx: number, rz: number) => 2.8 + (peak - 2.8) * Math.max(0, 1 - Math.hypot((x - px) / rx, (z - pz) / rz)) ** 1.2;
    land = Math.max(land, shoulder(-14, 132, 32.5, 17, 35), shoulder(16, 137, 34, 16, 35));
  } else {
    // Start the rear from the same shoulder section as the front at z153.
    // A separate -3m baseline here would create a visible radial step off-axis.
    land = -3 + (5.8 + (40 - 2.8) * ridge) * (1 - clamp((z - 153) / 14)) ** 2;
  }
  return coastAt(x, z, land);
}

type Segment = {
  a: MountainPoint; b: MountainPoint; run: MountainRun; index: number;
  k: number; kZ: number; dx: number; dz: number; lengthSq: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
};
// Keep the approved projection/8-chart-metre influence exactly, but evaluate only
// segments in the query's cell. Insertion order preserves weighted-fit parity.
const CELL = 8;
const cells = new Map<number, Segment[]>();
const cellKey = (x: number, z: number) => Math.floor(x / CELL) + 32 + (Math.floor(z / CELL) + 64) * 128;
for (const run of layout.runs) {
  for (let index = 0; index < run.points.length - 1; index++) {
    const a = run.points[index], b = run.points[index + 1];
    const k = (36 + (a[2] + b[2]) / 2) / 36;
    const kZ = Math.cos((a[0] + b[0]) / 72) * k;
    const dx = (b[0] - a[0]) * k, dz = (b[1] - a[1]) * kZ;
    const segment: Segment = { a, b, run, index, k, kZ, dx, dz, lengthSq: dx * dx + dz * dz,
      minX: Math.min(a[0], b[0]) - 8, maxX: Math.max(a[0], b[0]) + 8,
      minZ: Math.min(a[1], b[1]) - 8, maxZ: Math.max(a[1], b[1]) + 8 };
    for (let x = Math.floor(segment.minX / CELL); x <= Math.floor(segment.maxX / CELL); x++) {
      for (let z = Math.floor(segment.minZ / CELL); z <= Math.floor(segment.maxZ / CELL); z++) {
        const key = x + 32 + (z + 64) * 128;
        const list = cells.get(key);
        if (list) list.push(segment); else cells.set(key, [segment]);
      }
    }
  }
}
const NO_SEGMENTS: readonly Segment[] = [];
function segmentsAt(x: number, z: number): readonly Segment[] {
  if (x < -34 || x > 34 || z < 56 || z > 156) return NO_SEGMENTS;
  return cells.get(cellKey(x, z)) ?? NO_SEGMENTS;
}
function distanceAt(segment: Segment, x: number, z: number) {
  const { a, b, k, kZ, dx, dz, lengthSq } = segment;
  const t = clamp(((x - a[0]) * k * dx + (z - a[1]) * kZ * dz) / lengthSq);
  return { t, distance: Math.hypot((x - mix(a[0], b[0], t)) * k, (z - mix(a[1], b[1], t)) * kZ), height: mix(a[2], b[2], t) };
}
function runFitAt(x: number, z: number, natural: number): number {
  let weight = 0, sum = 0, influence = 0;
  for (const segment of segmentsAt(x, z)) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const { distance, height } = distanceAt(segment, x, z);
    if (distance < 1e-8) return height;
    const blend = 1 - smooth(segment.run.width / 2, segment.run.width / 2 + 3.5, distance);
    const w = blend / (distance * distance);
    weight += w; sum += height * w; influence = Math.max(influence, blend);
  }
  return weight ? mix(natural, sum / weight, influence * (1 - smooth(148, 150, z))) : natural;
}
/** Nearby route in physical metres; callers compare distance with run.width / 2. */
export function mountainRouteAt(x: number, z: number): MountainRouteSample | undefined {
  let nearest: MountainRouteSample | undefined;
  for (const segment of segmentsAt(x, z)) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const sample = distanceAt(segment, x, z);
    if (!nearest || sample.distance < nearest.distance) nearest = {
      run: segment.run, distance: sample.distance, height: sample.height,
      progress: (segment.index + sample.t) / (segment.run.points.length - 1),
    };
  }
  return nearest;
}

function plateauAt(x: number, z: number, area: MountainArea, height: number): number {
  const k = (36 + area.height) / 36;
  const dx = Math.abs(x - area.x) * k;
  const dz = Math.abs(z - area.z) * Math.cos(area.x / 36) * k;
  const outside = area.shape === 'oval'
    ? (Math.hypot(dx / (area.width / 2), dz / (area.depth / 2)) - 1) * Math.min(area.width, area.depth) / 2
    : Math.max(dx - area.width / 2, dz - area.depth / 2);
  return mix(height, area.height, 1 - smooth(0, area.feather ?? 2.5, outside));
}

/** Overlay the approved mountain on supplied substrate; preserve exterior and apply base plates last. */
export function mountainHeightAt(x: number, z: number, existingHeight = referenceMountainAt(x, z)): number {
  const blend = mountainBlendAt(x, z);
  // The approved rear shoulder joins continuously into the unchanged old coast.
  // Preserve that small join even when the caller supplies the legacy rear,
  // whose off-axis front/back baselines differ. Fade it laterally to untouched exterior.
  const rearJoin = z > 153 && z < 164 ? 1 - smooth(30, 34, Math.abs(x)) : 0;
  const old = rearJoin ? mix(existingHeight, referenceMountainAt(x, z), rearJoin) : existingHeight;
  let height = old;
  if (blend) {
    height = broadMassifAt(x, z);
    height = plateauAt(x, z, layout.finishApron, height);
    height = plateauAt(x, z, layout.spawnPad, height);
    height = mix(old, runFitAt(x, z, height), blend);
  }
  // A local foundation at the foot is independent of the alpine mask's fade.
  // Its compact influence stops below all three unchanged racing corridors.
  for (const area of [layout.resortTerrace, layout.ticketHut, layout.lodge, layout.pedestrianArrival]) height = plateauAt(x, z, area, height);
  return height;
}

export const MOUNTAIN_LAYOUT = layout;
export const MOUNTAIN_RUNS: readonly MountainRun[] = layout.runs;
export const MOUNTAIN_SNOW_BOUNDARY = layout.snowBoundary;
export const MOUNTAIN_BOUNDARY = layout.mountainBoundary;
export const MOUNTAIN_PEDESTRIAN_LINKS = layout.pedestrianLinks;

/** Snow is an authored alpine field, not a height threshold or just three white ribbons. */
export function mountainSnowAt(x: number, z: number): boolean {
  if (x < -30 || x > 30 || z < 60 || z > 163) return false;
  let inside = false;
  const points = layout.snowBoundary;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export default MOUNTAIN_LAYOUT;

