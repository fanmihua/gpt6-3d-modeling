import { build } from 'esbuild';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageNames = [
  'avatar.png',
  'dashboard.png',
  'empty-template.png',
  'exploded.png',
  'rotor.png',
  'room.png',
  'pump-blender.png',
  'cad-plan.svg',
  'factory-photo.png',
  'factory-model.png',
  'bpy-repeat.png',
  'script-geometry.png',
  'script-material.png',
  'script-camera.png',
  'script-light.png',
  'script-wireframe.png',
  'grass-texture.jpg',
  'road-texture.jpg',
];
const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

export async function buildTutorial() {
  const images = {};
  const imageBytes = new Map();
  for (const name of imageNames) {
    const file = path.join(root, 'public/tutorial', name);
    let bytes;
    try { bytes = await readFile(file); }
    catch { throw new Error(`缺少教程图片：public/tutorial/${name}`); }
    if (name.endsWith('.svg') && /(?:href\s*=\s*["'](?!#|data:)[^"']+|url\(\s*["']?(?:https?:|\/\/))/i.test(bytes.toString('utf8'))) {
      throw new Error(`教程 SVG 仍包含外部图像引用：${name}`);
    }
    imageBytes.set(name, bytes);
    images[name] = `data:${mime[path.extname(name)]};base64,${bytes.toString('base64')}`;
  }

  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/tutorial-simple.js'],
    outfile: 'tutorial.js',
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'none', sourcemap: false, metafile: true,
    plugins: [{ name: 'tutorial-images-only', setup(builder) {
      builder.onResolve({ filter: /^(?:three(?:\/|$)|\/models\/)|\.(?:glb|gltf|dxf|blend|py)(?:\?|$)/i }, (args) => {
        throw new Error(`图文教程不应打包模型或建模源文件：${args.path}`);
      });
      builder.onResolve({ filter: /^\/tutorial\// }, (args) => {
        const name = args.path.slice('/tutorial/'.length);
        if (!imageBytes.has(name)) throw new Error(`教程引用了未列入本次图文的资源：${args.path}`);
        return { path: name, namespace: 'tutorial-image' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'tutorial-image' }, (args) => ({
        contents: imageBytes.get(args.path), loader: 'dataurl',
      }));
    } }],
  });
  const external = Object.values(result.metafile.outputs).flatMap((file) => file.imports ?? []).filter((item) => item.external);
  if (external.length) throw new Error(`教程仍有外部依赖：${external.map((item) => item.path).join(', ')}`);
  const entry = result.outputFiles.find((file) => file.path.endsWith('.js'));
  if (!entry) throw new Error('未生成教程脚本，请检查 src/tutorial-simple.js。');

  const inlineImagePaths = (source) => {
    for (const [name, data] of Object.entries(images)) source = source.replaceAll(`./tutorial/${name}`, data).replaceAll(`/tutorial/${name}`, data);
    return source;
  };
  const javascript = inlineImagePaths(entry.text);
  const css = inlineImagePaths(result.outputFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.text).join('\n'));
  const bootstrap = `window.__COURSE_IMAGES__=Object.freeze(${JSON.stringify(images)});`;
  const script = (bootstrap + '\n' + javascript).replace(/<\/script/gi, '<\\/script');
  new vm.Script(script, { filename: 'tutorial-inline.js' });

  let html = inlineImagePaths(await readFile(path.join(root, 'index.html'), 'utf8'));
  html = html.replace(/\s*<script\b[^>]*\bsrc\s*=\s*["']\/?src\/tutorial-simple\.js["'][^>]*>\s*<\/script>/gi, '');
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(html)) {
    throw new Error('教程 HTML 仍包含外部脚本或样式。');
  }
  if (/@import\b|url\(\s*["']?(?:https?:|\/\/)/i.test(css)) throw new Error('教程 CSS 仍依赖网络资源。');
  if (/<(?:img|video|audio|source|iframe)\b[^>]*\b(?:src|poster)\s*=\s*["'](?:https?:|\/\/)/i.test(html)) {
    throw new Error('教程 HTML 仍包含网络媒体资源。');
  }
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) throw new Error('tutorial.html 缺少完整 head 或 body。');
  html = html.replace(/<\/head>/i, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`);
  html = html.replace(/<\/body>/i, () => `<script>${script}</script>\n</body>`);
  const filename = path.join(root, 'exports/GPT6 3D建模测评.html');
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, html, 'utf8');
  const report = { output: filename, bytes: (await stat(filename)).size, images: imageNames, offlineImages: true };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildTutorial().catch((error) => { console.error(`教程导出失败：${error.message}`); process.exitCode = 1; });
}
