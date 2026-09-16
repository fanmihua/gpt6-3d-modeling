import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const base = new URL('../', import.meta.url);
const source = readFileSync(new URL('reference/pump_room_demo.dxf', base));
const manifest = JSON.parse(readFileSync(new URL('public/models/pump-room.json', base)));
const binary = readFileSync(new URL('public/models/pump-room.glb', base));
const gltf = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString());
const nodes = gltf.nodes;
const parents = new Map();
nodes.forEach((n, i) => n.children?.forEach(child => parents.set(child, i)));
function transform(index) {
  const node = nodes[index];
  const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
    new Vector3(...(node.translation || [0, 0, 0])),
    new Quaternion(...(node.rotation || [0, 0, 0, 1])),
    new Vector3(...(node.scale || [1, 1, 1])),
  );
  return parents.has(index) ? transform(parents.get(index)).multiply(local) : local;
}
function bounds(index) {
  const node = nodes[index], result = new Box3();
  for (const primitive of gltf.meshes[node.mesh].primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    result.union(new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(transform(index)));
  }
  return result;
}
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < .003, `${actual} != ${expected}`);

test('export belongs to the supplied CAD and is a complete GLB', () => {
  assert.equal(binary.toString('ascii', 0, 4), 'glTF');
  assert.equal(binary.readUInt32LE(4), 2);
  assert.equal(binary.readUInt32LE(8), binary.length);
  assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'));
  assert.ok(statSync(new URL('blender/pump-room.blend', base)).size > 100000);
  assert.ok(binary.length < 8 * 1024 * 1024, 'keep the dashboard asset below 8 MB');
});

test('all four pump bases preserve CAD coordinates, millimetres-to-metres conversion and Y-up', () => {
  assert.deepEqual(manifest.pumps.map(p => p.id), ['P-01', 'P-02', 'P-03', 'P-04']);
  for (const p of manifest.pumps) {
    const node = nodes.find(n => n.name === p.id);
    assert.equal(node.extras.deviceId, p.id);
    assert.deepEqual(node.extras.cadOriginMM, p.cadOriginMM);
    const index = nodes.findIndex(n => n.name === `${p.id}__concrete`);
    assert.ok(index >= 0);
    const box = bounds(index), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
    [size.x, size.y, size.z].forEach((v, i) => approx(v, [1.3, .3, 2.4][i]));
    approx(center.x, p.cadOriginMM[0] / 1000 - 6);
    approx(center.y, .15);
    approx(center.z, 4 - (p.cadOriginMM[1] / 1000 + .7));
  }
});

test('eight independently identifiable valves point to existing pumps', () => {
  assert.equal(manifest.valves.length, 8);
  for (const valve of manifest.valves) {
    const node = nodes.find(n => n.name === valve.id);
    assert.equal(node.extras.assetId, valve.id);
    assert.equal(node.extras.deviceId, valve.pumpId);
    assert.ok(manifest.pumps.some(p => p.id === valve.pumpId));
    assert.ok(node.children.length > 0);
  }
});

test('complete walls and floor remain separate from interactive equipment', () => {
  const walls = nodes.find(n => n.name === 'UpperWalls');
  assert.equal(walls.extras.kind, 'upperWalls');
  const box = bounds(nodes.findIndex(n => n.name === 'UpperWalls__wall'));
  approx(box.max.y, 4.5);
  assert.ok(nodes.some(n => n.name === 'Floor' && n.extras.kind === 'floor'));
  assert.ok(manifest.triangles < 300000);
});

test('each pump exports a drillable assembly with real internal meshes and explosion offsets', () => {
  const components = nodes.filter(n => n.extras?.kind === 'component');
  const parts = nodes.filter(n => n.extras?.kind === 'part');
  assert.equal(components.length, 20);
  assert.equal(parts.length, 48);
  assert.equal(parts.filter(n => n.extras.internal).length, 16);
  for (const pump of manifest.pumps) {
    assert.equal(components.filter(n => n.extras.deviceId === pump.id).length, 5);
    for (const key of ['impeller', 'rotor', 'stator', 'shaft']) {
      const part = parts.find(n => n.extras.deviceId === pump.id && n.extras.partKey === key);
      assert.ok(part?.extras.internal, `${pump.id} ${key} is an internal part`);
      assert.ok(part.children.some(i => nodes[i].mesh !== undefined), `${key} contains actual geometry`);
      assert.equal(part.extras.explodeOffset.length, 3);
      assert.ok(part.extras.explodeOffset.every(Number.isFinite));
    }
  }
});
