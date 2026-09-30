import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Focused structural checks for the bounded peninsula rebuild.
 *
 * This intentionally compiles the authored TypeScript into a disposable CommonJS
 * directory, just like check-planet.mjs. It therefore tests the real terrain,
 * cave OBBs, routes, and `moveOnSurface` implementation without requiring a
 * running browser or a built Next app.
 */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repository, '.next');
mkdirSync(artifactRoot, { recursive: true });
const output = mkdtempSync(path.join(artifactRoot, 'peninsula-route-check-'));

const passes = [];
const failures = [];
const pathGradients = [];
const cleanups = [];

function compact(value) {
  if (typeof value === 'number') return Number(value.toFixed(4));
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item)]));
  return value;
}

function problem(message, detail = {}) {
  const error = new Error(message);
  error.detail = compact(detail);
  throw error;
}

function check(name, callback) {
  try {
    const detail = callback();
    passes.push({ name, ...(detail ? { detail: compact(detail) } : {}) });
  } catch (error) {
    failures.push({ name, message: error instanceof Error ? error.message : String(error), detail: compact(error?.detail ?? {}) });
  }
}

try {
  // Compile only the data/runtime graph needed by support and collision queries.
  const modules = ['data', 'runtime'].flatMap(directory => readdirSync(path.join(repository, 'src/features/world', directory))
    .filter(file => file.endsWith('.ts'))
    .map(file => `${directory}/${file}`)).concat('scene/TownLandscape.tsx');
  for (const relative of modules) {
    const source = path.join(repository, 'src/features/world', relative);
    const result = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: source,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      reportDiagnostics: true,
    });
    const diagnostics = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
    assert.equal(diagnostics.length, 0, diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
    const target = path.join(output, relative.replace(/\.tsx?$/, '.js'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, result.outputText);
  }

  const require = createRequire(import.meta.url);
  const { Vector3, Ray } = require('three');
  const planet = require(path.join(output, 'data/planet.js'));
  const map = require(path.join(output, 'data/world-map.js'));
  const town = require(path.join(output, 'data/town-layout.js'));
  const layout = require(path.join(output, 'data/peninsula-layout.js'));
  const cliffs = require(path.join(output, 'data/peninsula-cliffs.js'));
  const caveGeometry = require(path.join(output, 'data/peninsula-cave.js'));
  const landmarks = require(path.join(output, 'data/concept-landmarks.js'));
  const surfaces = require(path.join(output, 'data/town-surfaces.js'));
  const collision = require(path.join(output, 'runtime/planet-collision.js'));
  const runtimeTypes = require(path.join(output, 'runtime/types.js'));
  // The browser registers the exact rendered portal faces on mount. Mirror
  // that here, so numerical camera checks cannot omit these clipped surfaces.
  const {makeTerrainPartition}=require(path.join(output,'scene/TownLandscape.js'));
  const terrainPartition=makeTerrainPartition(252),portal=terrainPartition.portal;
  const portalPositions=portal.getAttribute('position'),portalIndices=portal.getIndex(),portalTriangles=[];
  for(let index=0;index<portalIndices.count;index+=3)portalTriangles.push([0,1,2].map(offset=>new Vector3().fromBufferAttribute(portalPositions,portalIndices.getX(index+offset))));
  const releasePortal=caveGeometry.registerCavePortalTriangles(portal,portalTriangles);
  cleanups.push(()=>{releasePortal();for(const geometry of Object.values(terrainPartition))geometry.dispose();});

  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const vectorFinite = vector => vector && numeric(vector.x) && numeric(vector.y) && numeric(vector.z);
  const chart = direction => compact(map.mapCoordinates(direction));
  const physicalDistance = (first, second) => first.angleTo(second) * planet.RADIUS;

  function supportSnapshot(direction, hint) {
    const support = collision.supportAt(direction, hint);
    if (!numeric(support.radius) || !vectorFinite(direction)) {
      problem('non-finite support query', { chart: chart(direction), support, direction });
    }
    return support;
  }

  function playerPosition(direction, hint) {
    return direction.clone().multiplyScalar(collision.supportRadius(direction, hint) + runtimeTypes.PLAYER_CENTER_HEIGHT);
  }

  /** Walk to one chart/sphere target through the actual collision solver. */
  function walkTo(up, target, label, { allowWater = false, maxSteps = 950, support: initialSupport, expectedLayer } = {}) {
    let support = initialSupport ?? supportSnapshot(up);
    const transitions = [];
    let blocked = 0;
    let distance = 0;
    let steps = 0;
    let last = null;
    let previousHeight = support.radius - planet.RADIUS;
    let previousChart = chart(up);
    let maxGradient = { ratio: 0, verticalDelta: 0, distance: 0, from: previousChart, to: previousChart };
    while (physicalDistance(up, target) > .035) {
      if (++steps > maxSteps) {
        problem(`${label}: target was not reached`, {
          remaining: physicalDistance(up, target), chart: chart(up), target: chart(target),
          support, last,
        });
      }
      const tangent = target.clone().addScaledVector(up, -target.dot(up));
      if (tangent.lengthSq() < 1e-14) break;
      tangent.normalize();
      const remaining = physicalDistance(up, target);
      const amount = Math.min(.055, remaining);
      const before = up;
      const movement = collision.moveOnSurface(up, tangent, amount, support.radius, support.layer);
      if (!vectorFinite(movement.up) || !numeric(movement.distance) || !numeric(movement.ground)) {
        problem(`${label}: movement produced a non-finite value`, { chart: chart(before), target: chart(target), movement });
      }
      if (before.angleTo(movement.up) * planet.RADIUS > amount + 1e-5) {
        problem(`${label}: movement teleported across the surface`, { chart: chart(before), next: chart(movement.up), amount, movement });
      }
      blocked += Number(movement.blocked);
      distance += movement.distance;
      last = { blocked: movement.blocked, distance: movement.distance, ground: movement.ground, layer: movement.support.layer, contact: collision.buildingContact(playerPosition(movement.up, {footRadius:movement.ground,layer:movement.support.layer}))?.segmentId ?? null };
      if (movement.distance < 1e-7) {
        problem(`${label}: movement stopped`, { chart: chart(up), target: chart(target), support, last });
      }
      up = movement.up;
      if (movement.support.layer !== support.layer) transitions.push({at:chart(up),before:chart(before),from:support.layer,to:movement.support.layer,fromRadius:support.radius,toRadius:movement.ground});
      support = movement.support;
      if (expectedLayer && support.layer !== expectedLayer) problem(`${label}: support silently switched levels`, {expectedLayer,support,chart:chart(up),transitions});
      if (!allowWater && support.kind === 'water') {
        problem(`${label}: route entered water`, { chart: chart(up), target: chart(target), support, last });
      }
      const nextHeight = support.radius - planet.RADIUS;
      const nextChart = chart(up);
      if (movement.distance > 1e-7) {
        const verticalDelta = nextHeight - previousHeight;
        const ratio = Math.abs(verticalDelta) / movement.distance;
        if (ratio > maxGradient.ratio) {
          maxGradient = { ratio, verticalDelta, distance: movement.distance, from: previousChart, to: nextChart };
        }
      }
      previousHeight = nextHeight;
      previousChart = nextChart;
    }
    return { up, support, transitions, blocked, distance, steps, remaining: physicalDistance(up, target), maxGradient };
  }

  function tangentAt(points, index) {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const point = points[index];
    const up = map.mapDirection(point[0], point[1]);
    return map.mapDirection(after[0], after[1]).sub(map.mapDirection(before[0], before[1])).projectOnPlane(up).normalize();
  }

  /**
   * A lane is offset in metres on the sphere, not in chart degrees. Blending
   * the vertex tangents avoids a discontinuity at an authored corner.
   */
  function routeTargets(points, lane = 0, spacing = .38) {
    const tangents = points.map((_, index) => tangentAt(points, index));
    const targets = [];
    for (let segment = 0; segment < points.length - 1; segment++) {
      const a = points[segment];
      const b = points[segment + 1];
      const length = physicalDistance(map.mapDirection(a[0], a[1]), map.mapDirection(b[0], b[1]));
      const count = Math.max(1, Math.ceil(length / spacing));
      for (let step = segment === 0 ? 0 : 1; step <= count; step++) {
        const t = step / count;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const up = map.mapDirection(x, z);
        const tangent = tangents[segment].clone().multiplyScalar(1 - t).addScaledVector(tangents[segment + 1], t).projectOnPlane(up).normalize();
        const right = tangent.clone().cross(up).normalize();
        const offset = up.clone().multiplyScalar(Math.cos(lane / planet.RADIUS)).addScaledVector(right, Math.sin(lane / planet.RADIUS)).normalize();
        targets.push(offset);
      }
    }
    return targets;
  }

  function checkTrack(name, points, lane = 0, { dry = true, cave = false, initialLayer = 'upper', expectedLayer = cave ? 'tunnel' : undefined } = {}) {
    const targets = routeTargets(points, lane);
    if (targets.length < 2) problem(`${name}: route has fewer than two targets`, { points });
    let up = targets[0];
    const firstSupport = supportSnapshot(up, {layer:initialLayer});
    let support = firstSupport;
    const transitions = [];
    if (dry && firstSupport.kind === 'water') problem(`${name}: route starts in water`, { chart: chart(up), support: firstSupport });
    let blocked = 0;
    let distance = 0;
    let steps = 0;
    let maxGradient = { ratio: 0, verticalDelta: 0, distance: 0, from: chart(up), to: chart(up) };
    for (let index = 1; index < targets.length; index++) {
      const segment = walkTo(up, targets[index], `${name} @ target ${index}`, { allowWater: !dry, support, expectedLayer });
      up = segment.up;
      support = segment.support;
      transitions.push(...segment.transitions);
      blocked += segment.blocked;
      distance += segment.distance;
      steps += segment.steps;
      if (segment.maxGradient.ratio > maxGradient.ratio) maxGradient = segment.maxGradient;
      if (cave) {
        const coordinates = map.mapCoordinates(up);
        const blend = landmarks.caveBlendAt(coordinates.x, coordinates.z);
        const floor = support.radius - planet.RADIUS;
        const contact = collision.buildingContact(playerPosition(up, {footRadius:support.radius,layer:support.layer}));
        if (blend < .999 || Math.abs(floor - landmarks.CAVE_FLOOR) > 1e-5 || contact) {
          problem(`${name}: cave lane is not clear at full width`, {
            chart: coordinates, lane, blend, floor, expectedFloor: landmarks.CAVE_FLOOR, layer:support.layer,
            contact: contact?.segmentId ?? null,
          });
        }
      }
    }
    if (blocked > 0) {
      problem(`${name}: route required collision sliding/blocking`, { lane, blocked, end: chart(up), distance, steps });
    }
    const report = { name, lane, ratio: maxGradient.ratio, verticalDelta: maxGradient.verticalDelta, sampleDistance: maxGradient.distance, from: maxGradient.from, to: maxGradient.to };
    pathGradients.push(report);
    return { lane, distance, steps, end: chart(up), initialLayer:firstSupport.layer, finalLayer:support.layer, transitions, maxPathHeightGradient: report };
  }

  /** Exercise a deliberately forbidden shortcut until the real solver rejects it. */
  function walkUntilBlocked(name, points, initialLayer = 'upper') {
    const targets = routeTargets(points, 0, .28);
    let up = targets[0];
    let support=supportSnapshot(up,{layer:initialLayer});
    let distance = 0;
    let steps = 0;
    let softBlocks = 0;
    for (let index = 1; index < targets.length; index++) {
      const target = targets[index];
      while (physicalDistance(up, target) > .035) {
        if (++steps > 1600) problem(`${name}: bypass attempt did not settle`, { chart: chart(up), target: chart(target), distance, softBlocks });
        const tangent = target.clone().addScaledVector(up, -target.dot(up));
        if (tangent.lengthSq() < 1e-14) break;
        tangent.normalize();
        const amount = Math.min(.055, physicalDistance(up, target));
        const probe = collision.advanceOnSphere(up, tangent, amount).up;
        const probeRadius = Math.max(support.radius, collision.supportRadius(probe,{layer:support.layer,footRadius:support.radius}));
        const probeContact = collision.buildingContact(probe.clone().multiplyScalar(probeRadius + runtimeTypes.PLAYER_CENTER_HEIGHT));
        const movement = collision.moveOnSurface(up, tangent, amount, support.radius, support.layer);
        if (!vectorFinite(movement.up) || !numeric(movement.distance)) {
          problem(`${name}: bypass collision produced a non-finite value`, { chart: chart(up), target: chart(target), movement });
        }
        if (movement.blocked && movement.distance < 1e-7) {
          return {
            blockedAt: chart(up), target: chart(target), layer:support.layer, distance, steps, softBlocks,
            contact: probeContact ? { buildingId: probeContact.id, segmentId: probeContact.segmentId } : null,
          };
        }
        if (movement.blocked) softBlocks++;
        distance += movement.distance;
        up = movement.up;
        support=movement.support;
        if(initialLayer==='tunnel'&&support.layer!==initialLayer)problem(`${name}: forbidden shortcut silently switched levels`,{chart:chart(up),initialLayer,support});
      }
    }
    problem(`${name}: forbidden bypass reached its endpoint`, { endpoint: chart(up), distance, steps, softBlocks });
  }

  function route(id) {
    const found = town.TOWN_ROUTES.find(item => item.id === id);
    if (!found) problem(`Missing authored route: ${id}`);
    return found;
  }

  check('the authored topology places the tunnel directly under the outer-tip lighthouse', () => {
    assert.deepEqual(layout.PENINSULA_LIGHTHOUSE,{x:36,z:-32,elevation:6.2,height:12});
    const expected=[[28,-29],[31,-30.5],[34,-32],[36,-32],[37,-30],[38,-26],[38,-22],[38,-20]];
    assert.deepEqual(layout.PENINSULA_CAVE.points,expected);
    assert.equal(layout.PENINSULA_CAVE.floor,-.1);assert.equal(layout.PENINSULA_CAVE.width,3.4);assert.equal(layout.PENINSULA_CAVE.clearance,4);
    const tower=layout.PENINSULA_LIGHTHOUSE,frame=map.mapFrame(tower.x,tower.z,tower.elevation);
    const lowPoint=map.mapPoint(tower.x,tower.z,layout.PENINSULA_CAVE.floor);
    const local=lowPoint.clone().sub(frame.position).applyQuaternion(frame.quaternion.clone().invert());
    assert.ok(Math.hypot(local.x,local.z)<1e-8,'Tunnel must pass below the actual tower center, not beside its footprint');
    assert.ok(-local.y>layout.PENINSULA_CAVE.clearance+.5,'A real roof/foundation thickness must separate low tunnel from upper surface');
    const exit=expected.at(-1),cove=layout.PENINSULA_COVE;
    assert.ok(exit[1]>tower.z&&cove.z>tower.z,'Tunnel exit and cove must lie behind/north of the outer-tip lighthouse');
    return {tower,tunnelUnderFootprint:local,exit,cove,placementCriterion:'Reference topology, never town-camera framing'};
  });

  check('all peninsula surface and collider samples remain finite', () => {
    let samples = 0;
    for (let x = 15; x <= 48.00001; x += .5) for (let z = -47; z <= 30.00001; z += .5) {
      const direction = map.mapDirection(x, z);
      const natural = surfaces.naturalTerrainAt(x, z);
      const substrate = surfaces.substrateAt(x, z);
      const surface = surfaces.groundSurfaceAt(x, z);
      const support = collision.supportRadius(direction);
      const coordinates = map.mapCoordinates(direction);
      if (![natural, substrate, surface.height, support, coordinates.x, coordinates.z].every(numeric) || !vectorFinite(direction)) {
        problem('non-finite peninsula sample', { x, z, natural, substrate, surface, support, coordinates, direction });
      }
      samples++;
    }
    for (const solid of landmarks.landmarkColliders) {
      if (!vectorFinite(solid.center) || !vectorFinite(solid.half) || !numeric(solid.quaternion.x + solid.quaternion.y + solid.quaternion.z + solid.quaternion.w)) {
        problem('non-finite landmark/cave collider', { id: solid.id, center: solid.center, half: solid.half, quaternion: solid.quaternion });
      }
    }
    return { samples, colliders: landmarks.landmarkColliders.length };
  });

  check('one map direction supports two real levels under the lighthouse without implicit switching', () => {
    const tower=layout.PENINSULA_LIGHTHOUSE, cave=layout.PENINSULA_CAVE;
    const up=map.mapDirection(tower.x,tower.z);
    const upper=supportSnapshot(up,{layer:'upper'}),lower=supportSnapshot(up,{layer:'tunnel'});
    assert.equal(upper.layer,'upper');assert.equal(lower.layer,'tunnel');
    assert.ok(Math.abs(upper.radius-(planet.RADIUS+tower.elevation))<1e-7);
    assert.ok(Math.abs(lower.radius-(planet.RADIUS+cave.floor))<1e-7);
    assert.ok(upper.radius-lower.radius>cave.clearance+.5,'Tunnel roof must remain below a solid foundation');
    assert.equal(supportSnapshot(up).layer,'upper','A direction-only spawn must remain outdoors');
    assert.equal(supportSnapshot(up,{layer:'upper',footRadius:lower.radius}).layer,'upper','Low radius must not switch an upper visitor below the middle of the foundation');
    assert.equal(supportSnapshot(up,{layer:'tunnel',footRadius:upper.radius}).layer,'tunnel','Current tunnel layer must not snap onto the upper foundation');
    assert.equal(collision.buildingContact(playerPosition(up,{layer:'tunnel'})),null,'The fixed lighthouse foot must not obstruct the passage beneath it');
    assert.equal(collision.buildingContact(playerPosition(up,{layer:'upper'}))?.id,'lighthouse','The same outdoor position must still collide with the real tower');
    const section=[[34,-32],[36,-32],[37,-30]];
    const forward=checkTrack('under-foundation lower forward',section,0,{cave:true,initialLayer:'tunnel'});
    const reverse=checkTrack('under-foundation lower reverse',[...section].reverse(),0,{cave:true,initialLayer:'tunnel'});
    assert.equal(forward.transitions.length,0);assert.equal(reverse.transitions.length,0);
    return {upper,lower,radialSeparation:upper.radius-lower.radius,forward,reverse};
  });

  check('rendered lower floor and roof enclose the passage directly below the foundation', () => {
    const tower=layout.PENINSULA_LIGHTHOUSE,cave=layout.PENINSULA_CAVE;
    const up=map.mapDirection(tower.x,tower.z),origin=map.mapPoint(tower.x,tower.z,cave.floor+1);
    const floorRay=new Ray(origin,up.clone().negate()),roofRay=new Ray(origin,up);
    const intersections=(ray,vertices,triangles)=>triangles.flatMap(([a,b,c])=>{
      const point=ray.intersectTriangle(vertices[a],vertices[b],vertices[c],false,new Vector3());
      return point?[point]:[];
    });
    const floor=caveGeometry.peninsulaCaveFloor;
    for(const vertex of floor.vertices)assert.ok(vectorFinite(vertex),'Rendered cave floor must be finite');
    const floorHits=intersections(floorRay,floor.vertices,floor.triangles).sort((a,b)=>a.distanceTo(origin)-b.distanceTo(origin));
    assert.ok(floorHits.length>0,'A visible lower floor triangle must actually cross the lighthouse direction');
    const floorElevation=floorHits[0].length()-planet.RADIUS;
    if(Math.abs(floorElevation-cave.floor)>=.08)problem('Rendered floor must match runtime lower support, allowing only mesh chord tolerance',{floorElevation,expected:cave.floor,delta:floorElevation-cave.floor});
    const roofHits=caveGeometry.peninsulaCaveWedges.flatMap(wedge=>intersections(roofRay,wedge.vertices,wedge.liningTriangles)).sort((a,b)=>a.distanceTo(origin)-b.distanceTo(origin));
    assert.ok(roofHits.length>0,'An actual visible roof triangle must cap the under-lighthouse passage');
    const roofElevation=roofHits[0].length()-planet.RADIUS;
    assert.ok(roofElevation-floorElevation>=cave.clearance-.08,'Rendered passage must retain declared clear height');
    assert.ok(roofElevation<tower.elevation-.5,'Roof must remain beneath real rock and the upper lighthouse foundation');
    return {floorVertices:floor.vertices.length,floorTriangles:floor.triangles.length,floorElevation,roofElevation,clearance:roofElevation-floorElevation,rockAboveRoof:tower.elevation-roofElevation};
  });

  check('the lower visitor cannot cross a side wall or snap onto the headland', () => {
    const result=walkUntilBlocked('under-lighthouse non-portal side exit',[[36,-32],[41,-32]],'tunnel');
    assert.equal(result.layer,'tunnel');
    assert.equal(result.contact?.buildingId,'cave-rock','Visible cave lining must stop the lower-side shortcut');
    return result;
  });

  check('local cliff wedges are finite, closed, and matched to their collision OBBs', () => {
    const wedges = cliffs.peninsulaCliffWedges;
    const colliders = cliffs.peninsulaCliffColliders;
    const runtimeColliders = landmarks.landmarkColliders.filter(item => item.buildingId === 'peninsula-cliff');
    if (wedges.length < 2 || colliders.length !== wedges.length || runtimeColliders.length !== wedges.length) {
      problem('unexpected cliff wedge/collider count', { wedges: wedges.length, colliders: colliders.length, runtimeColliders: runtimeColliders.length });
    }
    let vertices = 0;
    let triangles = 0;
    let maximumContainment = 0;
    for (const wedge of wedges) {
      const { collider } = wedge;
      if (wedge.vertices.length !== 8 || wedge.triangles.length !== 12 || !vectorFinite(collider.center) || !vectorFinite(collider.half)) {
        problem('invalid cliff wedge primitive', { id: wedge.id, vertices: wedge.vertices.length, triangles: wedge.triangles.length, collider });
      }
      const edges = new Map();
      for (const vertex of wedge.vertices) {
        if (!vectorFinite(vertex)) problem('non-finite cliff wedge vertex', { id: wedge.id, vertex });
        const local = vertex.clone().sub(collider.center).applyQuaternion(collider.inverse);
        const containment = Math.max(Math.abs(local.x) / collider.half.x, Math.abs(local.y) / collider.half.y, Math.abs(local.z) / collider.half.z);
        maximumContainment = Math.max(maximumContainment, containment);
        if (containment > 1 + 1e-7) problem('cliff collider does not contain its render vertex', { id: wedge.id, local, half: collider.half, containment });
        vertices++;
      }
      for (const triangle of wedge.triangles) {
        if (triangle.length !== 3 || triangle.some(index => !Number.isInteger(index) || index < 0 || index >= wedge.vertices.length)) {
          problem('cliff triangle uses an invalid vertex index', { id: wedge.id, triangle });
        }
        const [a, b, c] = triangle;
        const normalLength = wedge.vertices[b].clone().sub(wedge.vertices[a]).cross(wedge.vertices[c].clone().sub(wedge.vertices[a])).length();
        if (!numeric(normalLength) || normalLength < 1e-8) problem('cliff triangle is degenerate', { id: wedge.id, triangle, normalLength });
        for (const [first, second] of [[a, b], [b, c], [c, a]]) {
          const edge = first < second ? `${first}:${second}` : `${second}:${first}`;
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
        triangles++;
      }
      const nonManifold = [...edges.entries()].filter(([, count]) => count !== 2);
      if (nonManifold.length) problem('cliff wedge is not a closed two-manifold', { id: wedge.id, nonManifold });
    }
    return { wedges: wedges.length, vertices, triangles, maximumContainment };
  });

  check('lighthouse trail walks from [20, 4] in both directions', () => {
    const trail = route('lighthouse-trail');
    const start = trail.points[0];
    if (Math.hypot(start[0] - 20, start[1] - 4) > .01) {
      problem('lighthouse trail must begin at the protected town handoff', { actual: start, expected: [20, 4] });
    }
    const forward = checkTrack('lighthouse forward', trail.points, 0, {expectedLayer:'upper'});
    const reverse = checkTrack('lighthouse reverse', [...trail.points].reverse(), 0, {expectedLayer:'upper'});
    // A 2.4m trail clears the .31m visitor capsule at +/- .65m. These are
    // actual movement/collision checks, not just a route-width calculation.
    const edgeLane = .65;
    const edgeClearance = trail.width / 2 - collision.VISITOR_RADIUS - edgeLane;
    const edgeReports = [];
    if (edgeClearance >= 0) {
      for (const lane of [-edgeLane, edgeLane]) {
        for (const [direction, points] of [['forward', trail.points], ['reverse', [...trail.points].reverse()]]) {
          const name = `lighthouse lane ${lane.toFixed(2)} ${direction}`;
          try {
            edgeReports.push({ name, status: 'passed', report: checkTrack(name, points, lane, {expectedLayer:'upper'}) });
          } catch (error) {
            // Keep checking the other physical edge/direction, so the persisted
            // artifact distinguishes one bad shoulder from a closed route.
            edgeReports.push({ name, status: 'failed', message: error instanceof Error ? error.message : String(error), detail: error?.detail ?? {} });
          }
        }
      }
    } else {
      edgeReports.push({ skipped: true, lane: edgeLane, availableClearance: edgeClearance });
    }
    const edgeFailures = edgeReports.filter(report => report.status === 'failed');
    if (edgeFailures.length) problem('lighthouse route edge lane is not safely walkable', { edgeLane, edgeClearance, edgeReports });
    const endpoint = map.mapDirection(...trail.points.at(-1));
    const contact = collision.buildingContact(playerPosition(endpoint));
    if (contact) problem('lighthouse trail endpoint overlaps a tower/foundation collider', { endpoint: chart(endpoint), contact: contact.segmentId });
    const townLookout=[33.1,-35.5],lookoutDirection=map.mapDirection(...townLookout);
    const lookoutSupport=supportSnapshot(lookoutDirection,{layer:'upper'});
    const lookoutContact=collision.buildingContact(playerPosition(lookoutDirection,{layer:'upper'}));
    if(lookoutSupport.kind==='water'||lookoutContact)problem('Town-facing outer terrace fixture is not a clear upper walking position',{townLookout,lookoutSupport,contact:lookoutContact?.segmentId});
    const lookoutWalk=checkTrack('upper terrace to town-facing lookout',[trail.points.at(-1),townLookout],0,{expectedLayer:'upper'});
    return { forward, reverse, edgeLane, edgeClearance, edgeReports, endpoint: chart(endpoint),townLookout,lookoutSupport,lookoutWalk };
  });

  check('cove cliff rim blocks the non-route bypass from both sides', () => {
    // This is intentionally not an authored TownRoute. It is the tempting
    // direct line across the new cove rim that must remain physically closed.
    const bypass = [[24.5, -10], [27, -8], [30, -7], [33, -11], [35, -13], [37, -15], [37, -19]];
    const forward = walkUntilBlocked('cove bypass forward', bypass);
    const reverse = walkUntilBlocked('cove bypass reverse', [...bypass].reverse());
    for (const [direction, result] of [['forward', forward], ['reverse', reverse]]) {
      if (result.contact?.buildingId !== 'peninsula-cliff') {
        problem('bypass was stopped by something other than the authored cliff rim', { direction, result });
      }
    }
    return { bypass, forward, reverse };
  });

  check('beach-east joins cave and remains walkable both ways at full width', () => {
    const beach = route('beach-east');
    const cave = route('cave');
    const beachEnd = map.mapDirection(...beach.points.at(-1));
    const caveStart = map.mapDirection(...cave.points[0]);
    const gap = physicalDistance(beachEnd, caveStart);
    if (gap > .12) problem('beach-east does not meet cave entrance', { beachEnd: beach.points.at(-1), caveStart: cave.points[0], gap });

    // First prove a visitor can complete the public chain center-to-center.
    const chain = [...beach.points, ...cave.points.slice(1)];
    const forward = checkTrack('beach-to-cave forward', chain);
    const reverse = checkTrack('beach-to-cave reverse', [...chain].reverse(), 0, {initialLayer:'tunnel'});
    assert.equal(forward.finalLayer,'tunnel','Ordinary public approach must enter the lower passage at its portal');
    assert.equal(reverse.finalLayer,'upper','Reverse passage must reconnect to ordinary public beach support');
    for (const traversal of [forward,reverse]) {
      assert.ok(traversal.transitions.length > 0,'A traversed portal must record an explicit support transition');
      for (const change of traversal.transitions) {
        const section=caveGeometry.caveSectionAt(change.at.x,change.at.z)??caveGeometry.caveSectionAt(change.before.x,change.before.z);
        // The shared geometric query includes straight portal aprons and their
        // finite ends. An obsolete radial mouth-distance check clipped their
        // outer corners; validate the actual aperture instead.
        assert.ok(section?.portal&&section.distance<=section.halfWidth+.12,`Support switched outside the two geometric portal connectors: ${JSON.stringify({change,section})}`);
        assert.ok(Math.abs(change.toRadius-change.fromRadius)<=collision.STEP_HEIGHT,'Portal transfer must not teleport between stacked levels');
      }
    }

    // Then walk clear visitor lanes close to both edges. The margin leaves the
    // capsule clear of the actual cave OBBs rather than merely sampling pixels.
    const beachLane = Math.max(.2, beach.width / 2 - collision.VISITOR_RADIUS - .22);
    const caveLane = Math.max(.2, cave.width / 2 - collision.VISITOR_RADIUS - .22);
    const laneReports = [];
    for (const lane of [-beachLane, beachLane]) {
      laneReports.push(checkTrack(`beach-east lane ${lane.toFixed(2)} forward`, beach.points, lane));
      laneReports.push(checkTrack(`beach-east lane ${lane.toFixed(2)} reverse`, [...beach.points].reverse(), lane, {initialLayer:'tunnel'}));
    }
    for (const lane of [-caveLane, 0, caveLane]) {
      laneReports.push(checkTrack(`cave lane ${lane.toFixed(2)} forward`, cave.points, lane, { cave: true, initialLayer:'tunnel' }));
      laneReports.push(checkTrack(`cave lane ${lane.toFixed(2)} reverse`, [...cave.points].reverse(), lane, { cave: true, initialLayer:'tunnel' }));
    }
    return { gap, forward, reverse, beachLane, caveLane, laneReports };
  });

  check('cove is dry sand with an actual eastward ocean opening', () => {
    const cove = layout.PENINSULA_COVE;
    const coveUp = map.mapDirection(cove.x, cove.z);
    const coveSurface = surfaces.groundSurfaceAt(cove.x, cove.z);
    const coveSupport = supportSnapshot(coveUp);
    const color = surfaces.terrainColorAt(cove.x, cove.z, coveSurface.height);
    if (coveSupport.kind === 'water' || coveSurface.height <= planet.SEA_LEVEL + .02) {
      problem('cove is not walkable dry land', { cove, surface: coveSurface, support: coveSupport });
    }
    if (!['#D7BB85', '#D8BD8B', '#BCA87B'].includes(color)) {
      problem('cove does not resolve to a sand surface', { cove, color, surface: coveSurface });
    }

    // The cave exit must genuinely lead onto the cove, instead of ending at an
    // unreachable visual pocket.
    const caveEnd = layout.PENINSULA_CAVE.points.at(-1);
    const spur = [caveEnd, [cove.x, cove.z]];
    const caveToCove = checkTrack('cave exit to cove', spur, 0, {initialLayer:'tunnel'});
    const coveToCave = checkTrack('cove to cave exit', [...spur].reverse());

    // Walk physically east from the cove. Parallel-transport the heading so
    // the opening test remains valid on the globe, not just on a flat chart.
    let up = coveUp;
    let heading = map.mapFrame(cove.x, cove.z).east.clone();
    let waterAt = null;
    let maximumDryHeight = coveSurface.height;
    for (let index = 0; index < 260; index++) {
      const move = collision.moveOnSurface(up, heading, .055);
      if (!vectorFinite(move.up) || !numeric(move.distance)) problem('cove ocean walk produced a non-finite value', { index, up: chart(up), move });
      if (move.distance < 1e-7) problem('cove ocean opening is physically blocked', { index, chart: chart(up), support: supportSnapshot(up), contact: collision.buildingContact(playerPosition(up))?.segmentId ?? null });
      heading.applyQuaternion(move.rotation).normalize();
      up = move.up;
      const support = supportSnapshot(up);
      if (support.kind === 'water') { waterAt = { index, distance: (index + 1) * .055, chart: chart(up) }; break; }
      maximumDryHeight = Math.max(maximumDryHeight, support.radius - planet.RADIUS);
    }
    if (!waterAt) problem('eastward cove walk never reaches open ocean', { cove, end: chart(up), maximumDryHeight });
    if (waterAt.distance < .4 || maximumDryHeight > .9) {
      problem('cove outlet is either flooded at its start or blocked by a high land dam', { cove, waterAt, maximumDryHeight });
    }
    return { cove, color, caveToCove, coveToCave, maximumDryHeight, waterAt };
  });

  check('normal follow camera stays clear in four cardinal cove views', () => {
    assert.ok(portalTriangles.length>0,'Camera QA must include the actual rendered portal triangle registry');
    const cove = layout.PENINSULA_COVE;
    const up = map.mapDirection(cove.x, cove.z);
    const frame = map.mapFrame(cove.x, cove.z, collision.supportRadius(up) - planet.RADIUS);
    const headings = {
      north: frame.north,
      east: frame.east,
      south: frame.north.clone().negate(),
      west: frame.east.clone().negate(),
    };
    const views = Object.entries(headings).map(([heading, forward]) => {
      const right = forward.clone().cross(up).normalize();
      const target = playerPosition(up).addScaledVector(up, .55).addScaledVector(right, .55);
      const cameraDirection = forward.clone().multiplyScalar(-runtimeTypes.CAMERA_FOLLOW_DISTANCE).addScaledVector(up, 3).normalize();
      const available = collision.cameraClearDistance(target, cameraDirection, runtimeTypes.CAMERA_FOLLOW_DISTANCE);
      return { heading, available, target: chart(target), cameraDirection: compact(cameraDirection) };
    });
    const minimum = Math.min(...views.map(view => view.available));
    if (minimum < 2.6) problem('normal cove follow camera is too collision-shortened', { cove, minimum, views });
    return { cove, minimum, views, registeredPortalTriangles:portalTriangles.length };
  });

  check('lighthouse foot is fully supported by its local foundation', () => {
    const foot = landmarks.landmarkSolids.find(solid => solid.id === 'lighthouse:foot');
    if (!foot) problem('missing lighthouse foot collider');
    const tower = layout.PENINSULA_LIGHTHOUSE;
    const centerSurface = surfaces.groundSurfaceAt(tower.x, tower.z);
    if (Math.abs(centerSurface.height - tower.elevation) > 1e-7) {
      problem('tower center does not meet its declared foundation elevation', { tower, centerSurface });
    }
    const samples = [];
    for (const [x, z] of [[0, 0], [-foot.half.x, -foot.half.z], [-foot.half.x, foot.half.z], [foot.half.x, -foot.half.z], [foot.half.x, foot.half.z]]) {
      const point = new Vector3(x, -foot.half.y, z).applyQuaternion(foot.quaternion).add(foot.center);
      const up = point.clone().normalize();
      const coordinates = map.mapCoordinates(up);
      const foundation = layout.peninsulaFoundationAt(coordinates.x, coordinates.z);
      const supportHeight = collision.supportRadius(up) - planet.RADIUS;
      const footBottomHeight = point.length() - planet.RADIUS;
      const mismatch = Math.abs(supportHeight - footBottomHeight);
      if (foundation.blend < .99 || mismatch > .09) {
        problem('tower foot leaves the foundation plane', {
          chart: coordinates, foundation, supportHeight, footBottomHeight, mismatch,
        });
      }
      samples.push({ chart: coordinates, blend: foundation.blend, mismatch });
    }
    return { tower, samples };
  });

  check('the upper headland stays within the declared lighthouse foundation envelope', () => {
    let highest = { height: -Infinity, x: 0, z: 0, blend: 0 };
    let samples = 0;
    for (let x = 15; x <= 48.00001; x += .4) for (let z = -47; z <= 30.00001; z += .4) {
      if (!layout.inPeninsulaRegion(x, z) || landmarks.caveBlendAt(x, z) > .01) continue;
      const height = surfaces.naturalTerrainAt(x, z);
      if (!numeric(height)) problem('non-finite outside-cave terrain height', { x, z, height });
      if (height > highest.height) highest = { height, x, z, blend: layout.peninsulaBlendAt(x, z) };
      samples++;
    }
    // Unlike the rejected 2.8m terrace, the source-of-truth now requires a
    // 6.2m foundation with a real 3.6m-high passage underneath. The tolerance
    // accounts for its tangent plane on the 36m globe, not a taller ridge.
    const maximumHeight=layout.PENINSULA_LIGHTHOUSE.elevation+.55;
    if (highest.height > maximumHeight) problem('headland exceeds its intended foundation envelope', {...highest,maximumHeight});
    return { samples, highest, maximumHeight };
  });
} finally {
  for(const cleanup of cleanups.reverse())cleanup();
  // Only compiled disposable modules are removed, never source or Next build
  // output. The structured result is printed immediately after this cleanup.
  if (output.startsWith(path.join(artifactRoot, 'peninsula-route-check-'))) rmSync(output, { recursive: true, force: true });
}

const maximumPathGradient = pathGradients.reduce((highest, item) => item.ratio > highest.ratio ? item : highest,
  { ratio: 0, verticalDelta: 0, sampleDistance: 0, from: null, to: null, name: null, lane: 0 });
const result = {
  script: 'check-peninsula-routes',
  status: failures.length === 0 ? 'passed' : 'failed',
  passes,
  failures,
  reports: {
    maximumPathHeightGradient: maximumPathGradient,
    pathHeightGradients: pathGradients,
  },
};
const reportPath = path.join(repository, 'docs', 'qa', 'peninsula-underpass', 'route-check.json');
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

if (failures.length) process.exitCode = 1;
