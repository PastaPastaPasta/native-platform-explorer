import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  addIntegrityAttributes,
  contentSecurityPolicy,
  hardenExport,
  injectHeadMeta,
  inlineScriptHashes,
  patchWebpackRuntime,
  sri,
} from '../harden-export.mjs';

const sha = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

function writeFixture(t, files) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'npe-harden-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }
  return directory;
}

// The shape of Next 16's minified webpack chunk loader.
const RUNTIME = '(()=>{var o={};c.l=(e,t,r,n)=>{var a;(a=document.createElement("script")).charset="utf-8",a.setAttribute("data-webpack","_N_E:"+r),a.src=c.tu(e),document.head.appendChild(a)}})();';

test('integrity attributes cover scripts, stylesheets and script preloads under the base path', () => {
  const html = [
    '<link rel="preload" href="/app/_next/static/media/a.woff2" as="font" crossorigin=""/>',
    '<link rel="stylesheet" href="/app/_next/static/css/a.css" data-precedence="next"/>',
    '<link rel="preload" as="script" fetchPriority="low" href="/app/_next/static/chunks/webpack-1.js"/>',
    '<script src="/app/_next/static/chunks/main.js" async=""></script>',
    '<script>self.__next_f.push([0])</script>',
  ].join('');
  const hashes = { '_next/static/css/a.css': 'sha256-css', '_next/static/chunks/webpack-1.js': 'sha256-rt', '_next/static/chunks/main.js': 'sha256-main' };
  const out = addIntegrityAttributes(html, (file) => hashes[file], '/app');
  assert.match(out, /<link rel="preload" href="\/app\/_next\/static\/media\/a.woff2" as="font" crossorigin=""\/>/);
  assert.match(out, /data-precedence="next" integrity="sha256-css"\/>/);
  assert.match(out, /webpack-1.js" integrity="sha256-rt"\/>/);
  assert.match(out, /<script src="\/app\/_next\/static\/chunks\/main.js" async="" integrity="sha256-main"><\/script>/);
  assert.match(out, /<script>self.__next_f.push\(\[0\]\)<\/script>/);
});

test('integrity attributes reject missing and foreign assets', () => {
  assert.throws(() => addIntegrityAttributes('<script src="/_next/static/chunks/gone.js"></script>', () => undefined), /missing asset/);
  assert.throws(() => addIntegrityAttributes('<script src="https://cdn.example/x.js"></script>', () => 'sha256-x'), /outside/);
  assert.throws(() => addIntegrityAttributes('<script src="/_next/static/chunks/x.js"></script>', () => 'sha256-x', '/app'), /outside \/app/);
});

test('inline script hashes match the script text the browser hashes', () => {
  const html = '<script id="chakra-script">!(function(){})()</script><script src="/_next/static/a.js" async=""></script><script>self.__next_f.push([1,"\\u003c"])</script>';
  assert.deepEqual(inlineScriptHashes(html), [sha('!(function(){})()'), sha('self.__next_f.push([1,"\\u003c"])')]);
  assert.throws(() => inlineScriptHashes('<script>a\r\nb</script>'), /carriage return/);
});

test('the policy allows only self scripts plus the listed inline hashes', () => {
  const policy = contentSecurityPolicy(['sha256-b', 'sha256-a', 'sha256-a']);
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval' 'sha256-a' 'sha256-b';/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "img-src 'self' data:", "connect-src 'self' https:", "worker-src 'self' blob:"]) {
    assert.ok(policy.includes(directive), directive);
  }
});

test('the CSP and build meta go right after the charset, before any script', () => {
  const html = '<!DOCTYPE html><html><head><meta charSet="utf-8"/><script src="/_next/static/a.js"></script></head></html>';
  const out = injectHeadMeta(html, "default-src 'self'", 'abc');
  assert.equal(out, `<!DOCTYPE html><html><head><meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'self'"/><meta name="npe-build" content="abc"/><script src="/_next/static/a.js"></script></head></html>`);
  assert.throws(() => injectHeadMeta(out, 'x', 'abc'), /already has a CSP/);
  assert.throws(() => injectHeadMeta('<html><head><title>x</title></head>', 'x', 'abc'), /no <head>/);
});

test('the patched webpack runtime sets integrity on the chunk scripts it inserts', () => {
  const patched = patchWebpackRuntime(RUNTIME, { '/app/_next/static/chunks/sdk.js': 'sha256-sdk' });
  const appended = [];
  const self = {};
  const element = () => ({ setAttribute() {}, set src(value) { this._src = value; } });
  const c = { tu: (url) => url };
  vm.runInNewContext(`${patched};c.l("/app/_next/static/chunks/sdk.js?v=1");c.l("/app/_next/static/chunks/other.js")`, {
    self, c, document: { createElement: element, head: { appendChild: (node) => appended.push(node) } },
  });
  assert.equal(appended[0].integrity, 'sha256-sdk');
  assert.equal(appended[1].integrity, '');
  assert.throws(() => patchWebpackRuntime('(()=>{})()', {}), /found 0/);
});

test('hardenExport writes SRI, CSP, the service worker and a complete integrity manifest', (t) => {
  const page = (body) => `<!DOCTYPE html><html><head><meta charSet="utf-8"/><link rel="stylesheet" href="/app/_next/static/css/a.css"/><script src="/app/_next/static/chunks/webpack-1.js" async=""></script><script>${body}</script></head><body></body></html>`;
  const dir = writeFixture(t, {
    'next/BUILD_ID': 'build-1',
    'out/index.html': page('home'),
    'out/offline/index.html': page('offline'),
    'out/query/index.html': page('query'),
    'out/_next/static/css/a.css': 'body{}',
    'out/_next/static/chunks/webpack-1.js': RUNTIME,
    'out/_next/static/chunks/sdk.js': 'sdk()',
    'out/_next/static/media/a.woff2': 'font',
  });
  const outDir = path.join(dir, 'out');
  const env = { NEXT_PUBLIC_BASE_PATH: '/app', NEXT_PUBLIC_BRIDGE_URL: 'https://bridge.example', OTHER: 'secret' };
  const manifest = hardenExport({ outDir, nextDir: path.join(dir, 'next'), env });
  const read = (file) => readFileSync(path.join(outDir, file), 'utf8');

  const runtime = Object.keys(manifest.files).find((file) => file.includes('/webpack-'));
  const patched = read(runtime);
  assert.equal(runtime, `_next/static/chunks/webpack-${createHash('sha256').update(patched).digest('hex').slice(0, 16)}.js`);
  assert.ok(!('_next/static/chunks/webpack-1.js' in manifest.files));
  assert.match(patched, /^self\.__NPE_SRI__=\{"\/app\/_next\/static\/chunks\/sdk\.js":"sha256-/);
  const query = read('query/index.html');
  assert.ok(query.includes(`<script src="/app/${runtime}" async="" integrity="${sri(patched)}">`));
  assert.ok(query.includes(`'${sha('query')}'`));
  assert.ok(query.includes('<meta name="npe-build" content="build-1"/>'));

  const config = JSON.parse(read('sw.js').match(/^const CONFIG = (.*);$/m)[1]);
  assert.equal(config.buildId, 'build-1');
  assert.deepEqual(config.shell, ['', 'offline/', '_next/static/css/a.css', runtime]);
  assert.equal(config.assets['_next/static/chunks/sdk.js'], sri('sdk()'));
  assert.equal(config.assets[runtime], sri(patched));
  assert.ok(!config.shell.includes('_next/static/chunks/sdk.js'));

  assert.equal(manifest.buildId, 'build-1');
  assert.equal(manifest.basePath, '/app');
  assert.deepEqual(manifest.env, { NEXT_PUBLIC_BASE_PATH: '/app', NEXT_PUBLIC_BRIDGE_URL: 'https://bridge.example' });
  assert.ok(!('integrity.json' in manifest.files));
  for (const file of ['sw.js', '.nojekyll', 'Fraunces-OFL.txt', 'JetBrainsMono-OFL.txt', 'index.html', '_next/static/chunks/sdk.js']) {
    assert.equal(manifest.files[file], sri(readFileSync(path.join(outDir, file))), file);
  }
  assert.deepEqual(JSON.parse(read('integrity.json')), manifest);
});

test('NEXT_PUBLIC_SERVICE_WORKER=off ships the unregistering worker', (t) => {
  const page = '<!DOCTYPE html><html><head><meta charSet="utf-8"/></head></html>';
  const dir = writeFixture(t, {
    'next/BUILD_ID': 'b',
    'out/index.html': page,
    'out/offline/index.html': page,
    'out/_next/static/chunks/webpack-1.js': RUNTIME,
  });
  const manifest = hardenExport({ outDir: path.join(dir, 'out'), nextDir: path.join(dir, 'next'), env: { NEXT_PUBLIC_SERVICE_WORKER: 'off' } });
  assert.equal(manifest.serviceWorker, 'off');
  const worker = readFileSync(path.join(dir, 'out/sw.js'), 'utf8');
  assert.match(worker, /registration\.unregister\(\)/);
  assert.doesNotMatch(worker, /CONFIG/);
});
