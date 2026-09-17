// Web delivery copies. Keep original GLB/Blender sources intact for editing.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, quantize, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const name of ['pump-room','factory-campus']){
 const source=`${root}public/models/${name}.glb`,target=`${root}public/models/${name}-web.glb.gz`;
 const doc=await io.read(source);
 for(const texture of doc.getRoot().listTextures()){
  if(texture.getMimeType()!=='image/jpeg')continue;
  const quality=texture.getName().includes('_nor_')?92:82;
  const data=await sharp(texture.getImage()).jpeg({quality,chromaSubsampling:'4:4:4'}).toBuffer();
  texture.setImage(data);
 }
 // No simplification or node merging: preserve selectable objects and extras.
 await doc.transform(reorder({encoder:MeshoptEncoder}),quantize({quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14,cleanup:false}),prune({propertyTypes:[PropertyType.ACCESSOR],keepLeaves:true,keepAttributes:true,keepIndices:true}));
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 await writeFile(target,gzipSync(await io.writeBinary(doc),{level:9}));
 console.log(name,(await stat(source)).size,'->',(await stat(target)).size);
}
