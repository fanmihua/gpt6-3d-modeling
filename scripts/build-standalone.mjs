import { build } from 'esbuild';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.json':'application/json' };
const models = new Map();
const assets = new Set();
async function inlineAssets(text) {
  const urls = [...new Set(text.match(/\.?\/assets\/[\w.-]+/g) || [])];
  for (const url of urls) {
    const bytes = await readFile(path.join(root,'public',url));
    assets.add(url);
    text = text.replaceAll(url, `data:${mime[path.extname(url)]};base64,${bytes.toString('base64')}`);
  }
  return text;
}
const result = await build({
  // 把 dashboard.js 及其依赖（包含 Three.js）打成一个浏览器脚本。
  // 用户拿到的单个 HTML，不需要从外部安装或下载这些 JS 文件。
  absWorkingDir:root, entryPoints:['src/dashboard.js'], outfile:'standalone.js',
  bundle:true, write:false, format:'iife', platform:'browser', target:'es2022',
  minify:true, legalComments:'none', sourcemap:false,
  plugins:[{name:'embed-local-content',setup(builder){
    builder.onLoad({filter:/\/src\/.*\.js$/},async({path:file})=>{
      let source=await readFile(file,'utf8');
      for(const match of source.matchAll(/(['"])(\.?\/models\/[\w.-]+)\1/g)) {
        // 找出模型地址，读取对应文件，并把加载地址替换为运行时的内嵌资产表。
        const url=match[2];
        if(!models.has(url))models.set(url,await readFile(path.join(root,'public',url)));
        source=source.replaceAll(match[0],`window.__OFFLINE_ASSETS__[${JSON.stringify(url)}]`);
      }
      return {contents:await inlineAssets(source),loader:'js',resolveDir:path.dirname(file)};
    });
    builder.onResolve({filter:/^\/assets\//},args=>({path:path.join(root,'public',args.path),namespace:'embedded-asset'}));
    builder.onLoad({filter:/.*/,namespace:'embedded-asset'},async({path:file})=>{
      assets.add('/'+path.relative(path.join(root,'public'),file));
      return {contents:await readFile(file),loader:'dataurl'};
    });
  }}],
});
// A GLB must not retain external buffers or textures in this offline package.
for(const [url,bytes] of models) {
  if(!url.endsWith('.glb'))continue;
  const length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
  for(const entry of [...(json.buffers||[]),...(json.images||[])]) {
    if(entry.uri&&!entry.uri.startsWith('data:'))throw Error(`External GLB dependency: ${entry.uri}`);
  }
}
// Base64 把二进制编码成可放进 HTML 的文字，不会把 GLB 变成建模代码。
const modelData=Object.fromEntries([...models].map(([url,bytes])=>[url,{type:mime[path.extname(url)],base64:bytes.toString('base64')}]));
// 打开 HTML 时：Base64 → 原始字节 → Blob → 临时 blob: 地址。
// GLTFLoader 仍然读取并解析同一份 GLB，只是来源从网络路径变成浏览器内存。
const bootstrap=`window.__OFFLINE_ASSETS__={};for(const [url,file] of Object.entries(${JSON.stringify(modelData)})){const binary=atob(file.base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);window.__OFFLINE_ASSETS__[url]=URL.createObjectURL(new Blob([bytes],{type:file.type}));}`;
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
let html=await inlineAssets(await readFile(path.join(root,'demo.html'),'utf8'));
html=html.replace(/\s*<script\b[^>]*src="\/src\/dashboard\.js"[^>]*><\/script>/,'');
html=html.replace('</head>',()=>`<style>${css.replaceAll('</style','<\\/style')}</style>\n</head>`);
html=html.replace('</body>',()=>`<script>${(bootstrap+'\n'+js).replaceAll('</script','<\\/script')}</script>\n</body>`);
const inlineScripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if(inlineScripts.length!==1)throw Error('Expected one inline script');
new vm.Script(inlineScripts[0][1]);
if(/<script\b[^>]+src\s*=/.test(html)||/<link\b[^>]+(?:stylesheet|modulepreload)/.test(html))throw Error('External executable dependency remains');
if(models.size < 4 || !models.has('./models/factory-campus.glb') || !models.has('./models/pump-room.glb'))throw Error('Both campus and pump-room assets are required');
if(html.includes('/src/dashboard.js'))throw Error('Development script entry remains');
const out=path.join(root,'exports','绿源净水厂-三维运营演示.html');
await mkdir(path.dirname(out),{recursive:true});
await writeFile(out,html);
console.log(JSON.stringify({output:out,bytes:(await stat(out)).size,embeddedAssets:[...assets],embeddedModels:[...models.keys()]},null,2));
