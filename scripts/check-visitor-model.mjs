import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Guards the visitor GLB the walker loads (docs/design/character-v1/README.md): one skinned mesh
 * inside the triangle budget, the five clips the blend tree names, all on one skeleton, and a
 * download small enough for phones. Run: npm run test:visitor */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(repository, 'public/world/models/visitor.glb');
const data = readFileSync(file);
assert.equal(data.toString('latin1', 0, 4), 'glTF', 'visitor.glb is a binary glTF');
const jsonLength = data.readUInt32LE(12);
const gltf = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));

const size = statSync(file).size;
assert.ok(size <= 1.5e6, `visitor.glb is ${(size / 1e6).toFixed(2)} MB; the budget is 1.5 MB`);
assert.equal(gltf.meshes.length, 1, 'One mesh');
assert.equal(gltf.meshes[0].primitives.length, 1, 'One primitive, so one draw call');
const primitive = gltf.meshes[0].primitives[0];
const triangles = gltf.accessors[primitive.indices].count / 3;
assert.ok(triangles <= 15000, `${triangles} triangles; the budget is 15k`);
for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) assert.ok(attribute in primitive.attributes, `${attribute} present`);
assert.equal(gltf.skins.length, 1, 'One skin');
const joints = gltf.skins[0].joints.map(j => gltf.nodes[j].name);
for (const bone of ['Hips', 'Spine02', 'Head', 'LeftFoot', 'RightFoot']) assert.ok(joints.includes(bone), `${bone} bone present`);

// visitor-model.ts blends these by name; every clip must drive the visitor's own joints.
const clips = Object.fromEntries(gltf.animations.map(a => [a.name, a]));
for (const name of ['Idle', 'Jog', 'Run', 'Swim', 'Tread']) {
  assert.ok(clips[name], `${name} clip present`);
  const targets = new Set(clips[name].channels.map(c => c.target.node));
  assert.ok([...targets].every(node => gltf.skins[0].joints.includes(node)), `${name} only animates skin joints`);
  assert.ok(gltf.skins[0].joints.every(node => targets.has(node)), `${name} drives every joint`);
}
// Height: the bind-pose mesh stands about 1.85 m from its feet.
const bounds = gltf.accessors[primitive.attributes.POSITION];
assert.ok(Math.abs(bounds.max[1] - bounds.min[1] - 1.85) < 0.05, `visitor stands ${(bounds.max[1] - bounds.min[1]).toFixed(2)} m tall`);
assert.ok(Math.abs(bounds.min[1]) < 0.02, 'feet at the origin');
console.log(`visitor.glb ok: ${(size / 1e6).toFixed(2)} MB, ${triangles} triangles, clips ${Object.keys(clips).join(', ')}`);
