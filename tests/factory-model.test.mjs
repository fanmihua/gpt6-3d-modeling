import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZONES } from '../src/factory-data.js';

const modelFile = new URL('../public/models/factory-campus.glb', import.meta.url);
const manifestFile = new URL('../public/models/factory-campus.json', import.meta.url);
const binary = readFileSync(modelFile);
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

// Walk every GLB chunk instead of assuming a fixed JSON or BIN length.
function readChunks(buffer) {
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    assert.ok(offset + 8 <= buffer.length, 'a GLB chunk header must be complete');
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, 'GLB chunks must be aligned to four bytes');
    assert.ok(offset + 8 + length <= buffer.length, 'a GLB chunk cannot exceed the file');
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  assert.equal(offset, buffer.length);
  return chunks;
}

const chunks = readChunks(binary);
assert.equal(chunks[0]?.type, 0x4e4f534a, 'the first GLB chunk must contain JSON');
const gltf = JSON.parse(chunks[0].data.toString('utf8').trim());
const embeddedBuffer = chunks.find(chunk => chunk.type === 0x004e4942)?.data;
const nodes = gltf.nodes || [];
const meshNodes = nodes.filter(node => Number.isInteger(node.mesh));
const parents = new Map();
nodes.forEach((node, index) => node.children?.forEach(child => {
  assert.ok(nodes[child], 'scene hierarchy cannot refer to a missing node');
  assert.ok(!parents.has(child), 'a node must have only one parent');
  parents.set(child, index);
}));

function descendants(index, visiting = new Set()) {
  assert.ok(!visiting.has(index), 'the scene hierarchy cannot contain a cycle');
  const next = new Set(visiting).add(index);
  return [index, ...(nodes[index].children || []).flatMap(child => descendants(child, next))];
}

const vector3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const textureSlots = material => [
  material.pbrMetallicRoughness?.baseColorTexture,
  material.pbrMetallicRoughness?.metallicRoughnessTexture,
  material.normalTexture,
  material.occlusionTexture,
  material.emissiveTexture,
].filter(Boolean);

test('the campus is a complete GLB 2.0 with embedded buffers below the browser asset budget', () => {
  assert.equal(binary.toString('ascii', 0, 4), 'glTF');
  assert.equal(binary.readUInt32LE(4), 2);
  assert.equal(binary.readUInt32LE(8), binary.length);
  assert.equal(gltf.asset.version, '2.0');
  assert.ok(binary.length < 25 * 1024 * 1024, 'keep the complete campus asset below 25 MiB');
  assert.equal(chunks.length, 2);
  assert.ok(embeddedBuffer?.length > 0);
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.buffers[0].uri, undefined, 'GLB loading must not depend on external binary files');
  assert.ok(gltf.buffers[0].byteLength <= embeddedBuffer.length);
  assert.ok(embeddedBuffer.length - gltf.buffers[0].byteLength <= 3, 'only GLB alignment padding may follow the buffer');
  for (const view of gltf.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.ok((view.byteOffset || 0) >= 0 && view.byteLength > 0);
    assert.ok((view.byteOffset || 0) + view.byteLength <= gltf.buffers[0].byteLength);
  }
  const activeScene = gltf.scenes[gltf.scene ?? 0];
  assert.ok(activeScene?.nodes.length > 0);
  const reachable = new Set(activeScene.nodes.flatMap(index => descendants(index)));
  assert.equal(reachable.size, nodes.length, 'all exported objects must belong to the active scene');
});

test('all eight business zones have stable manifest bounds and selectable geometry under matching parents', () => {
  const expected = ZONES.map(zone => zone.id).sort();
  assert.equal(manifest.coordinateSystem, 'web-y-up');
  assert.equal(manifest.stats.zones, 8);
  assert.deepEqual(manifest.zones.map(zone => zone.id).sort(), expected);
  assert.ok(vector3(manifest.bounds.min) && vector3(manifest.bounds.max));
  const zoneParents = nodes.map((node, index) => ({ node, index }))
    .filter(({ node }) => node.mesh === undefined && node.extras?.zoneId);
  assert.deepEqual(zoneParents.map(({ node }) => node.extras.zoneId).sort(), expected);

  for (const zone of manifest.zones) {
    assert.ok(vector3(zone.center) && vector3(zone.size), `${zone.id} needs finite focus geometry`);
    zone.center.forEach((coordinate, axis) => {
      assert.ok(coordinate >= manifest.bounds.min[axis] && coordinate <= manifest.bounds.max[axis]);
      assert.ok(zone.size[axis] > 0);
    });
    const parent = zoneParents.find(({ node }) => node.extras.zoneId === zone.id);
    const children = descendants(parent.index).slice(1).map(index => nodes[index]);
    const meshes = children.filter(node => Number.isInteger(node.mesh));
    assert.ok(meshes.length > 0, `${zone.id} must contain real geometry for raycasting`);
    for (const node of meshes) {
      assert.equal(node.extras?.zoneId, zone.id, `${node.name} must be clickable as ${zone.id}`);
    }
  }
  for (const node of meshNodes) {
    assert.ok(manifest.layers.includes(node.extras?.layer), `${node.name} needs a supported visibility layer`);
    if (node.extras.zoneId) assert.ok(expected.includes(node.extras.zoneId));
  }
});

test('exported triangle primitives and mesh counts reconcile with the manifest', () => {
  assert.equal(meshNodes.length, manifest.stats.meshObjects);
  let triangles = 0;
  for (const node of meshNodes) {
    const mesh = gltf.meshes[node.mesh];
    assert.ok(mesh?.primitives.length > 0, `${node.name} cannot reference an empty mesh`);
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'interactive campus geometry must use triangle primitives');
      const position = gltf.accessors[primitive.attributes.POSITION];
      assert.equal(position?.type, 'VEC3');
      assert.ok(position.count > 0);
      assert.ok(vector3(position.min) && vector3(position.max));
      const topology = gltf.accessors[primitive.indices ?? primitive.attributes.POSITION];
      assert.equal(topology.count % 3, 0);
      triangles += topology.count / 3;
      if (primitive.indices !== undefined) {
        assert.equal(topology.type, 'SCALAR');
        assert.ok([5121, 5123, 5125].includes(topology.componentType));
        if (topology.max) assert.ok(topology.max[0] < position.count);
      }
      assert.ok(gltf.materials[primitive.material], 'every primitive must retain its material');
    }
  }
  assert.ok(triangles > 0);
  assert.equal(triangles, manifest.stats.triangles);
});

test('textured materials retain matching UVs and self-contained browser-decodable images', () => {
  assert.ok(gltf.images?.length > 0, 'the detailed campus must keep its surface textures');
  let texturedPrimitives = 0;
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const slots = textureSlots(gltf.materials[primitive.material]);
      if (!slots.length) continue;
      texturedPrimitives += 1;
      const uv = gltf.accessors[primitive.attributes.TEXCOORD_0];
      assert.equal(uv?.type, 'VEC2', 'textured geometry must export TEXCOORD_0');
      assert.equal(uv.count, gltf.accessors[primitive.attributes.POSITION].count);
      for (const slot of slots) {
        assert.equal(slot.texCoord ?? 0, 0, 'the campus viewer expects the first UV set');
        const texture = gltf.textures[slot.index];
        assert.ok(texture && gltf.images[texture.source], 'material texture references must resolve');
      }
    }
  }
  assert.ok(texturedPrimitives > 0);
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined, 'texture images must be embedded in the GLB');
    assert.ok(['image/jpeg', 'image/png'].includes(image.mimeType), 'use native browser image formats');
    const view = gltf.bufferViews[image.bufferView];
    assert.ok(view, 'embedded images need a valid buffer view');
    const bytes = embeddedBuffer.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    if (image.mimeType === 'image/jpeg') {
      assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG start marker');
      assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9, 'JPEG end marker');
    } else {
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.equal(bytes.toString('ascii', bytes.length - 8, bytes.length - 4), 'IEND');
    }
  }
});
