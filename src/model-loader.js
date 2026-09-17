import { FileLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Share downloads between the pump-room view and device detail. Parse separate
// scene trees so material changes and reparenting in one view cannot affect another.
const downloads = new Map();
export async function loadCompressedModel(url, onProgress) {
  if (!downloads.has(url)) {
    const pending = new FileLoader().setResponseType('arraybuffer').loadAsync(url, onProgress)
      .then(async bytes => {
        const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
        if (header[0] !== 31 || header[1] !== 139) return bytes;
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer();
      });
    downloads.set(url, pending);
    pending.catch(() => downloads.delete(url));
  }
  const bytes = await downloads.get(url);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
}
