import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Read-only runtime loading: no generated source or approval artifact is changed.
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const layout = require('../src/features/world/data/peninsula-layout.ts');
const surfaces = require('../src/features/world/data/town-surfaces.ts');
const map = require('../src/features/world/data/world-map.ts');
const collision = require('../src/features/world/runtime/planet-collision.ts');
const cliffs = require('../src/features/world/data/peninsula-cliffs.ts');
const placement = require('../src/features/world/data/peninsula-frame.ts');
/** The approved cove is authored in its own chart and placed rigidly east of the cul-de-sacs. */
const place = ([x, z]) => { const point = placement.peninsulaWorldPoint(x, z); return [point.x, point.z]; };
const approval = readFileSync(new URL('../docs/design/single-cove-approval/approval-template.html', import.meta.url), 'utf8');
const approved = name => JSON.parse(approval.match(new RegExp(`const ${name} = (\\[.*?\\]);`))[1]);
assert.deepEqual(layout.PENINSULA_COAST, approved('coast'));
assert.deepEqual(layout.PENINSULA_SAND, approved('sand'));
assert.deepEqual(layout.PENINSULA_TERRACE, approved('terrace'));
assert.deepEqual(layout.PENINSULA_INNER_CLIFF, approved('innerCliff'));
assert.deepEqual(layout.PENINSULA_CAVE.points, approved('cave'));

// The former dividing rock tongue is open water, not a smoothed low causeway.
let dividerSamples = 0;
for (let x = 38; x <= 45; x += .25) for (let z = -5; z <= 1; z += .25) {
  const [wx, wz] = place([x, z]);
  assert.ok(surfaces.groundSurfaceAt(wx, wz).height < -.8, `Former divider remains at ${x},${z}`);
  dividerSamples++;
}
assert.ok(cliffs.PENINSULA_CLIFF_RIM.every(([x, z]) => z < -10 || x < 37), 'No middle cliff arm may remain');
assert.equal(surfaces.groundSurfaceAt(...place([36, -32])).height.toFixed(4), '6.2000');

const crescent = [[38, -20], [38, -16], [36, -12], [34.5, -7], [33, -1],
  [31.5, 6], [31.5, 13], [32.5, 18], [35, 22], [37, 25]].map(place);
function walk(points, initialLayer) {
  let up = map.mapDirection(...points[0]);
  let support = collision.supportAt(up, { layer: initialLayer });
  let distance = 0, steps = 0, blocked = 0;
  const transitions = [];
  for (let segment = 1; segment < points.length; segment++) {
    const a = points[segment - 1], b = points[segment];
    const count = Math.ceil(map.mapDirection(...a).angleTo(map.mapDirection(...b)) * map.MAP_RADIUS / .35);
    for (let sample = 1; sample <= count; sample++) {
      const t = sample / count;
      const target = map.mapDirection(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      let guard = 0;
      while (up.angleTo(target) * map.MAP_RADIUS > .025) {
        assert.ok(++guard < 100, `Cove route stalled at ${JSON.stringify(map.mapCoordinates(up))}`);
        const tangent = target.clone().addScaledVector(up, -target.dot(up)).normalize();
        const result = collision.moveOnSurface(up, tangent, Math.min(.045, up.angleTo(target) * map.MAP_RADIUS), support.radius, support.layer);
        assert.ok(result.distance > 0, `Cove route blocked at ${JSON.stringify(map.mapCoordinates(up))}`);
        assert.notEqual(result.support.kind, 'water', `Crescent enters water at ${JSON.stringify(map.mapCoordinates(result.up))}`);
        if (support.layer !== result.support.layer) transitions.push([support.layer, result.support.layer]);
        blocked += Number(result.blocked);
        distance += result.distance; steps++;
        up = result.up; support = result.support;
      }
    }
  }
  assert.equal(blocked, 0, 'Crescent walking must not rely on collision sliding');
  return { distance: +distance.toFixed(3), steps, transitions, finalLayer: support.layer };
}
const forward = walk(crescent, 'tunnel');
const reverse = walk([...crescent].reverse(), 'upper');
assert.equal(forward.finalLayer, 'upper');
assert.equal(reverse.finalLayer, 'tunnel');
assert.deepEqual(forward.transitions, [['tunnel', 'upper']], 'Exit handoff must not chatter between support layers');
assert.deepEqual(reverse.transitions, [['upper', 'tunnel']], 'Reverse entry must have a single support handoff');
console.log(JSON.stringify({ status: 'passed', exactApprovedPolygons: true, dividerSamples,
  continuousCrescentWalking: { forward, reverse }, lighthouseFoundation: 6.2,
  cliffWedges: cliffs.peninsulaCliffWedges.length }, null, 2));
