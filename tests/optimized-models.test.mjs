import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const name of ['pump-room','factory-campus'])test(`${name}: compressed delivery preserves selectable nodes, parts, topology and bounds`,async()=>{
 const originalBytes=await readFile(new URL(`../public/models/${name}.glb`,import.meta.url));
 const packed=await readFile(new URL(`../public/models/${name}-web.glb.gz`,import.meta.url));
 assert.ok(packed.length<originalBytes.length*.4,'transferred model must be under 40% of original size');
 const before=(await io.readBinary(originalBytes)).getRoot(),after=(await io.readBinary(gunzipSync(packed))).getRoot();
 const oldNodes=before.listNodes(),newNodes=after.listNodes();assert.equal(oldNodes.length,newNodes.length);
 const triangleCount=root=>root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
 assert.equal(triangleCount(before),triangleCount(after));
 const tolerance=name==='pump-room'?.002:.015;
 for(let i=0;i<oldNodes.length;i++){
  const a=oldNodes[i],b=newNodes[i];assert.equal(b.getName(),a.getName());assert.deepEqual(b.getExtras(),a.getExtras());
  assert.deepEqual(b.listChildren().map(n=>n.getName()),a.listChildren().map(n=>n.getName()));
  if(!a.getMesh())continue;
  const x=getBounds(a),y=getBounds(b);
  for(const side of ['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(x[side][axis]-y[side][axis])<tolerance,`${a.getName()} ${side}[${axis}] changed`);
 }
 assert.equal(after.listTextures().length,before.listTextures().length);
 for(const tex of after.listTextures())assert.ok(tex.getImage()?.length>0);
});
