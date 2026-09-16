import { build } from 'esbuild';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const assetPattern = /\/assets\/[\w./%-]+\.(?:png|jpe?g|webp|svg|ico|woff2?|ttf|otf)(?:\?[^"'`\s)<>]*)?/gi;

export async function buildStandalone({ root = projectRoot, output } = {}) {
  const publicRoot = await realpath(path.join(root, 'public'));
  const assets = new Map();

  async function loadAsset(url) {
    const key = url.split(/[?#]/, 1)[0];
    if (assets.has(key)) return assets.get(key);
    const relativeUrl = decodeURIComponent(key).replace(/^\//, '');
    const file = await realpath(path.join(publicRoot, relativeUrl));
    const relative = path.relative(publicRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`素材越出 public 目录：${key}`);
    const type = mime[path.extname(file).toLowerCase()];
    if (!type) throw new Error(`不支持的页面素材：${key}`);
    const bytes = await readFile(file);
    const asset = { bytes, dataUrl: `data:${type};base64,${bytes.toString('base64')}` };
    assets.set(key, asset);
    return asset;
  }

  async function inlineAssets(source) {
    const urls = [...new Set(source.match(assetPattern) ?? [])].sort((a, b) => b.length - a.length);
    for (const url of urls) source = source.replaceAll(url, (await loadAsset(url)).dataUrl);
    return source;
  }

  const result = await build({
    absWorkingDir: root, entryPoints: ['src/main.js'], outfile: 'standalone.js',
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'none', sourcemap: false, metafile: true,
    loader: Object.fromEntries(Object.keys(mime).map((extension) => [extension, 'dataurl'])),
    plugins: [{ name: 'inline-page-assets', setup(builder) {
      // Vite 的 ?raw HTML 模块在独立导出中转换成内嵌字符串。
      builder.onResolve({ filter: /\?raw$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-html',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'raw-html' }, async (args) => ({
        contents: await readFile(args.path, 'utf8'), loader: 'text',
      }));
      builder.onResolve({ filter: /^(?:three(?:\/|$)|\/models\/)|\.(?:glb|gltf)$/i }, (args) => {
        throw new Error(`界面模板不应包含三维依赖：${args.path}`);
      });
      builder.onResolve({ filter: /^\/assets\// }, async (args) => {
        await loadAsset(args.path);
        return { path: args.path, namespace: 'page-asset' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'page-asset' }, async (args) => ({
        contents: (await loadAsset(args.path)).bytes, loader: 'dataurl',
      }));
    } }],
  });
  const unresolved = Object.values(result.metafile.outputs).flatMap((entry) => entry.imports ?? []).filter((entry) => entry.external);
  if (unresolved.length) throw new Error(`仍有外部依赖：${unresolved.map((entry) => entry.path).join(', ')}`);
  const entry = result.outputFiles.find((file) => file.path.endsWith('.js'));
  if (!entry) throw new Error('没有生成页面脚本，请检查 src/main.js。');
  const javascript = await inlineAssets(entry.text);
  const css = await inlineAssets(result.outputFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.text).join('\n'));
  let html = await inlineAssets(await readFile(path.join(root, 'index.html'), 'utf8'));
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:\.\/|\/)?src\/main\.js["'][^>]*>\s*<\/script>/gi, '');
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(html)) {
    throw new Error('index.html 仍包含外部脚本或样式。');
  }
  if (/@import\b|url\(\s*["']?(?:https?:|\/\/)/i.test(css)) throw new Error('样式仍包含网络资源。');
  if (/\/models\/|\.(?:glb|gltf)(?:["'`?#]|$)/i.test(javascript + css + html)) throw new Error('页面仍引用三维模型。');
  const script = javascript.replace(/<\/script/gi, '<\\/script');
  new vm.Script(script, { filename: 'dashboard-template.js' });
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) throw new Error('index.html 缺少完整 head 或 body。');
  html = html.replace(/<\/head>/i, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`);
  html = html.replace(/<\/body>/i, () => `<script>${script}</script>\n</body>`);
  const destination = output ?? path.join(root, 'exports/dashboard-template.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
  const report = { output: destination, bytes: (await stat(destination)).size, embeddedAssets: [...assets.keys()] };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildStandalone().catch((error) => { console.error(`独立 HTML 导出失败：${error.message}`); process.exitCode = 1; });
}
