import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Postbuild hardening for the static export (PRD §11.11, §14.3, §15.4). Runs
// after `next build` and rewrites out/ in place:
//  1. The webpack runtime gets a sha256 map of every chunk and sets
//     `integrity` on the chunk scripts it loads (the SDK chunk included). It
//     is renamed after its new content.
//  2. Each HTML file gets `integrity` on its script, stylesheet and script
//     preload tags, and a CSP <meta> whose script-src lists the sha256 of each
//     of the page's inline scripts.
//  3. The OFL font licenses and .nojekyll are added.
//  4. sw.js: the caching service worker, or the unregistering kill switch
//     when NEXT_PUBLIC_SERVICE_WORKER=off.
//  5. integrity.json: the SRI hash of every other file plus build provenance.
// Every step is deterministic, so two builds of a commit stay identical.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const sri = (bytes) => `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

// GitHub Pages cannot send headers, so the policy ships as <meta>. A meta
// policy ignores frame-ancestors, report-uri and sandbox, so clickjacking
// protection is not available on this host. style-src needs 'unsafe-inline':
// Chakra (emotion) writes <style> elements and style attributes at runtime.
// DAPI nodes are arbitrary https hosts (e.g. https://68.67.122.1:1443), so
// connect-src allows any https origin. The SDK compiles its WASM in a blob:
// worker, which needs worker-src blob: and 'wasm-unsafe-eval'.
export function contentSecurityPolicy(inlineScriptHashes) {
  const scripts = [...new Set(inlineScriptHashes)].sort().map((hash) => `'${hash}'`);
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scripts].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** The served path of a /_next/static asset, relative to out/, or null. */
function staticAssetPath(url, basePath) {
  if (!url.startsWith(`${basePath}/_next/static/`)) return null;
  return decodeURIComponent(url.slice(basePath.length + 1).split(/[?#]/)[0]);
}

const ATTRIBUTE = (name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i');
function attribute(tag, name) {
  const match = tag.match(ATTRIBUTE(name));
  return match ? (match[1] ?? match[2] ?? match[3]).replace(/&amp;/g, '&') : null;
}

/** Add `integrity` to every script, stylesheet and script/style preload tag
 *  that loads a /_next/static file. Font preloads are left alone: the font
 *  request made by the CSS carries no integrity, so a preload with one would
 *  go unused. */
export function addIntegrityAttributes(html, hashOf, basePath = '') {
  return html.replace(/<(script|link)\b[^>]*>/gi, (tag, name) => {
    if (attribute(tag, 'integrity') !== null) throw new Error(`Tag already has integrity: ${tag}`);
    let url;
    if (name.toLowerCase() === 'script') {
      url = attribute(tag, 'src');
    } else {
      const rel = attribute(tag, 'rel')?.toLowerCase();
      const as = attribute(tag, 'as')?.toLowerCase();
      if (rel === 'stylesheet' || (rel === 'preload' && (as === 'script' || as === 'style'))) url = attribute(tag, 'href');
    }
    if (!url) return tag;
    const file = staticAssetPath(url, basePath);
    if (!file) throw new Error(`Unexpected asset outside ${basePath}/_next/static: ${url}`);
    const hash = hashOf(file);
    if (!hash) throw new Error(`Exported HTML references a missing asset: ${url}`);
    const end = tag.endsWith('/>') ? -2 : -1;
    return `${tag.slice(0, end)} integrity="${hash}"${tag.slice(end)}`;
  });
}

/** sha256 of each inline script's text, as the browser hashes it for CSP. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(`<script${attributes}>`, 'src') !== null) continue;
    // The HTML parser turns CR LF into LF before the browser hashes the text.
    if (body.includes('\r')) throw new Error('Inline script contains a carriage return');
    hashes.push(sri(Buffer.from(body, 'utf8')));
  }
  return hashes;
}

/** Insert the policy right after <meta charset>: a meta CSP only governs
 *  markup after it, and nothing before it may load or run. The build ID meta
 *  tells the page which build its HTML (and so its chunks) came from. */
export function injectHeadMeta(html, policy, buildId) {
  const charset = html.match(/<head>\s*<meta charSet="utf-8"\/>/i);
  if (!charset) throw new Error('Exported HTML has no <head><meta charSet="utf-8"/> to anchor the CSP');
  if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) throw new Error('HTML already has a CSP');
  const before = html.slice(0, charset.index);
  if (/<(script|link|style|img|iframe|object|base)\b/i.test(before)) throw new Error('Content precedes the CSP anchor');
  const at = charset.index + charset[0].length;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/><meta name="npe-build" content="${buildId}"/>`;
  return `${html.slice(0, at)}${meta}${html.slice(at)}`;
}

// The runtime's script loader, as webpack 5 minifies it in Next 16:
// `a.src=c.tu(e)` (script element, __webpack_require__, chunk URL). The loader
// also serves chunks React requests during client navigation.
const RUNTIME_SCRIPT_SRC = /([\w$]+)\.src=([\w$]+)\.tu\(([\w$]+)\)/g;

/** Make the webpack runtime set `integrity` on each chunk script it inserts.
 *  `hashes` maps served URL paths (base path included) to SRI values. */
export function patchWebpackRuntime(source, hashes) {
  const matches = [...source.matchAll(RUNTIME_SCRIPT_SRC)];
  if (matches.length !== 1) {
    throw new Error(`Expected one chunk loader in the webpack runtime, found ${matches.length}. Next or webpack changed its runtime; update scripts/harden-export.mjs.`);
  }
  const [found, script, , url] = matches[0];
  const map = JSON.stringify(Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))));
  const lookup = `(${script}.integrity=self.__NPE_SRI__[${url}.split("?")[0]]||"")`;
  return `self.__NPE_SRI__=${map};${source.replace(found, `${found},${lookup}`)}`;
}

function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(dir, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function packageVersion(name) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/** Static assets the home and offline pages load at startup. */
function shellAssets(html, basePath) {
  const assets = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const integrity = attribute(tag, 'integrity');
    const url = attribute(tag, 'src') ?? attribute(tag, 'href');
    const file = url && staticAssetPath(url, basePath);
    // Fonts are cached by the worker on first use.
    if (file && (integrity || /\.(?:woff2?|ttf)$/.test(file))) assets.push(file);
  }
  return assets;
}

export function hardenExport({ outDir = path.join(root, 'out'), nextDir = path.join(root, '.next'), env = process.env } = {}) {
  const basePath = (env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
  const read = (file) => readFileSync(path.join(outDir, file));
  const write = (file, data) => writeFileSync(path.join(outDir, file), data);
  const buildId = readFileSync(path.join(nextDir, 'BUILD_ID'), 'utf8').trim();

  // 1. Chunk hashes into the webpack runtime. Its webpack name hashes the
  //    unpatched source, so the patched file is renamed after its content:
  //    /_next/static URLs must stay immutable for browsers and the worker.
  const runtimes = listFiles(outDir).filter((file) => /^_next\/static\/chunks\/webpack-[\w-]+\.js$/.test(file));
  if (runtimes.length !== 1) throw new Error(`Expected one webpack runtime, found ${runtimes.length}`);
  const [runtime] = runtimes;
  const chunkHashes = {};
  for (const file of listFiles(outDir)) {
    if (file.startsWith('_next/static/') && file.endsWith('.js') && file !== runtime) {
      chunkHashes[`${basePath}/${file}`] = sri(read(file));
    }
  }
  const patched = patchWebpackRuntime(read(runtime).toString('utf8'), chunkHashes);
  const renamed = `_next/static/chunks/webpack-${createHash('sha256').update(patched).digest('hex').slice(0, 16)}.js`;
  rmSync(path.join(outDir, runtime));
  write(renamed, patched);
  const files = listFiles(outDir);
  const staticHashes = new Map(files.filter((file) => file.startsWith('_next/static/')).map((file) => [file, sri(read(file))]));

  // 2. Integrity attributes, the per-page CSP and the build ID meta.
  for (const file of files.filter((name) => name.endsWith('.html'))) {
    const source = read(file).toString('utf8').replaceAll(`${basePath}/${runtime}`, `${basePath}/${renamed}`);
    const html = addIntegrityAttributes(source, (asset) => staticHashes.get(asset), basePath);
    write(file, injectHeadMeta(html, contentSecurityPolicy(inlineScriptHashes(html)), buildId));
  }

  // 3. Files GitHub Pages needs next to the export.
  for (const license of ['Fraunces-OFL.txt', 'JetBrainsMono-OFL.txt']) {
    copyFileSync(path.join(root, 'src/styles/fonts', license), path.join(outDir, license));
  }
  write('.nojekyll', '');

  // 4. The service worker, versioned by everything it can serve.
  const serviceWorkerOff = env.NEXT_PUBLIC_SERVICE_WORKER === 'off';
  let serviceWorker;
  if (serviceWorkerOff) {
    serviceWorker = readFileSync(path.join(root, 'scripts/sw/unregister.js'));
  } else {
    const digest = createHash('sha256');
    for (const file of listFiles(outDir)) digest.update(`${file}\0${sri(read(file))}\n`);
    const shell = ['', 'offline/'];
    for (const page of ['index.html', 'offline/index.html']) {
      const html = read(page).toString('utf8');
      shell.push(...shellAssets(html, basePath));
    }
    const config = {
      buildId,
      version: `${buildId.slice(0, 12)}-${digest.digest('hex').slice(0, 16)}`,
      shell: [...new Set(shell)],
      assets: Object.fromEntries(staticHashes),
    };
    const template = readFileSync(path.join(root, 'scripts/sw/service-worker.js'), 'utf8');
    serviceWorker = `const CONFIG = ${JSON.stringify(config)};\n${template}`;
  }
  write('sw.js', serviceWorker);

  // 5. The manifest a user compares against their own build (see /about).
  const manifestFiles = {};
  for (const file of listFiles(outDir)) {
    if (file !== 'integrity.json') manifestFiles[file] = sri(read(file));
  }
  const publicEnv = Object.fromEntries(Object.entries(env)
    .filter(([name]) => name.startsWith('NEXT_PUBLIC_'))
    .sort(([a], [b]) => a.localeCompare(b)));
  const commit = git('rev-parse', 'HEAD');
  const manifest = {
    schema: 1,
    commit,
    // Uncommitted changes to tracked files: such a build is not reproducible from `commit`.
    dirty: commit === null ? null : git('status', '--porcelain', '--untracked-files=no') !== '',
    buildId,
    basePath,
    serviceWorker: serviceWorkerOff ? 'off' : 'on',
    env: publicEnv,
    toolchain: {
      node: process.version,
      packageManager: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).packageManager,
      next: packageVersion('next'),
      evoSdk: packageVersion('@dashevo/evo-sdk'),
    },
    files: manifestFiles,
  };
  write('integrity.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = hardenExport();
  console.log(`Hardened export: ${Object.keys(manifest.files).length} files in integrity.json, build ${manifest.buildId}, service worker ${manifest.serviceWorker}`);
}
