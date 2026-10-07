import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { checkBundleBudgets, exportedRouteFiles, initialRouteFiles, measureInitialBundles, ROUTE_BUDGETS } from '../check-bundle-budget.mjs';

function writeFixture(t, files) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'npe-bundle-budget-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }
  return directory;
}

function fixture(t, pages, assets) {
  return writeFixture(t, { 'app-build-manifest.json': JSON.stringify({ pages }), ...assets });
}

test('counts root and nested layouts once while excluding CSS and unrelated async chunks', (t) => {
  const shared = 'const shared = true;';
  const nested = 'const nested = true;';
  const page = 'const page = true;';
  const directory = fixture(t, {
    '/layout': ['shared.js', 'shell.css'],
    '/nested/layout': ['shared.js', 'nested.js'],
    '/nested/query/page': ['shared.js', 'page.js'],
  }, { 'shared.js': shared, 'nested.js': nested, 'page.js': page, 'async-sdk.js': Buffer.alloc(3 * 1024 * 1024) });
  const [result] = measureInitialBundles(directory, { '/nested/query/page': { raw: 1000, gzip: 1000 } });
  assert.equal(result.raw, shared.length + nested.length + page.length);
  assert.equal(result.gzip, [shared, nested, page].reduce((sum, text) => sum + gzipSync(text).length, 0));
  assert.equal(result.passed, true);
  assert.deepEqual(result.files.map(({ file }) => file), ['shared.js', 'nested.js', 'page.js']);
});

test('a raw-size regression fails even when repetitive content compresses under the gzip limit', (t) => {
  const directory = fixture(t, { '/layout': ['shell.js'], '/query/page': ['page.js'] }, {
    'shell.js': 'const shell = true;', 'page.js': Buffer.alloc(2 * 1024 * 1024, 'a'),
  });
  const [result] = measureInitialBundles(directory, { '/query/page': ROUTE_BUDGETS['/query/page'] });
  assert.ok(result.gzip < result.budget.gzip);
  assert.ok(result.raw > result.budget.raw);
  assert.equal(result.passed, false);
});

test('gzip-size regressions fail independently of raw size', (t) => {
  const directory = fixture(t, { '/layout': ['shell.js'], '/query/page': ['page.js'] }, {
    'shell.js': 'const shell = true;', 'page.js': 'const page = true;',
  });
  const [result] = measureInitialBundles(directory, { '/query/page': { raw: 1000, gzip: 1 } });
  assert.ok(result.raw < result.budget.raw);
  assert.equal(result.passed, false);
});

test('rejects missing routes and missing root layouts instead of silently passing', () => {
  assert.throws(() => initialRouteFiles({ '/layout': ['shell.js'] }, '/query/page'), /Missing or invalid.*\/query\/page/);
  assert.throws(() => initialRouteFiles({ '/query/page': ['page.js'] }, '/query/page'), /Missing or invalid.*\/layout/);
  assert.throws(() => initialRouteFiles({ '/layout': ['shell.js'], '/query/layout': [], '/query/page': ['page.js'] }, '/query/page'), /Missing or invalid.*\/query\/layout/);
});

test('rejects absent assets and invalid manifests', (t) => {
  const directory = fixture(t, { '/layout': ['absent.js'], '/query/page': ['page.js'] }, { 'page.js': '' });
  assert.throws(() => measureInitialBundles(directory, { '/query/page': { raw: 1000, gzip: 1000 } }), /ENOENT/);
  writeFileSync(path.join(directory, 'app-build-manifest.json'), JSON.stringify({ pages: [] }));
  assert.throws(() => measureInitialBundles(directory), /pages object/);
});

test('rejects manifest assets outside the build directory', (t) => {
  const directory = fixture(t, { '/layout': ['../outside.js'], '/query/page': ['page.js'] }, { 'page.js': '' });
  assert.throws(() => measureInitialBundles(directory, { '/query/page': { raw: 1000, gzip: 1000 } }), /escapes the build directory/);
});

test('checks every default route and reports a failing route', (t) => {
  const pages = Object.fromEntries(Object.keys(ROUTE_BUDGETS).map((route) => [route, ['page.js']]));
  const directory = fixture(t, { '/layout': ['shell.js'], ...pages }, {
    'shell.js': 'const shell = true;', 'page.js': 'const page = true;',
  });
  const output = [];
  assert.equal(checkBundleBudgets(directory, (line) => output.push(line)), true);
  assert.equal(output.length, Object.keys(ROUTE_BUDGETS).length);
  writeFileSync(path.join(directory, 'page.js'), Buffer.alloc(2 * 1024 * 1024));
  assert.equal(checkBundleBudgets(directory, () => {}), false);
});

test('CLI exits unsuccessfully when the build artifact is missing', (t) => {
  const directory = fixture(t, {}, {});
  const script = fileURLToPath(new URL('../check-bundle-budget.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, path.join(directory, 'missing')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bundle budget check failed/);
});

test('reads Next 16 exported initial scripts including layouts and polyfills with a base path', (t) => {
  const shell = 'const shell = true;';
  const page = 'const page = true;';
  const polyfill = 'const polyfill = true;';
  const directory = writeFixture(t, { 'query/index.html': `
    <script src="/native-platform-explorer/_next/static/shell.js" async></script>
    <script async src='/native-platform-explorer/_next/static/page.js?x=1&amp;y=2'></script>
    <script src="/native-platform-explorer/_next/static/shell.js"></script>
    <script src=/_next/static/polyfill.js></script>
    <script>self.__next_f.push([1, "<script src='/_next/static/async-sdk.js'>"])</script>
    <!-- <script src="/_next/static/async-sdk.js"></script> -->
    <link rel="preload" href="/_next/static/async-sdk.js" as="script">
  `,
    '_next/static/shell.js': shell,
    '_next/static/page.js': page,
    '_next/static/polyfill.js': polyfill,
    '_next/static/async-sdk.js': Buffer.alloc(3 * 1024 * 1024),
  });
  const [result] = measureInitialBundles(directory, { '/query/page': { raw: 1000, gzip: 1000 } });
  assert.equal(result.raw, shell.length + page.length + polyfill.length);
  assert.equal(result.gzip, [shell, page, polyfill].reduce((sum, text) => sum + gzipSync(text).length, 0));
  assert.equal(result.passed, true);
});

test('falls back from a Next 16 .next directory to its sibling export', (t) => {
  const directory = writeFixture(t, {
    'out/index.html': '<script src="/_next/static/shell.js"></script>',
    'out/_next/static/shell.js': 'const shell = true;',
  });
  mkdirSync(path.join(directory, '.next'));
  const [result] = measureInitialBundles(path.join(directory, '.next'), { '/page': { raw: 1000, gzip: 1000 } });
  assert.equal(result.passed, true);
});

test('fails for missing exported pages, absent startup scripts, and missing script files', (t) => {
  const directory = writeFixture(t, { 'index.html': '<script>inlineOnly()</script>' });
  assert.throws(() => measureInitialBundles(directory, { '/page': { raw: 1000, gzip: 1000 } }), /no initial script/);
  assert.throws(() => measureInitialBundles(directory, { '/query/page': { raw: 1000, gzip: 1000 } }), /ENOENT/);
  writeFileSync(path.join(directory, 'index.html'), '<script src="/_next/static/missing.js"></script>');
  assert.throws(() => measureInitialBundles(directory, { '/page': { raw: 1000, gzip: 1000 } }), /ENOENT/);
});

test('rejects traversal, remote scripts, unsupported assets, and malformed encoding', () => {
  for (const source of [
    '/_next/static/../outside.js', '/_next/static/%2e%2e/outside.js',
    '/_next/static/%2e%2e%2foutside.js', '/_next/static/%5coutside.js',
  ]) {
    assert.throws(() => exportedRouteFiles(`<script src="${source}"></script>`), /Unsafe initial script/);
  }
  assert.throws(() => exportedRouteFiles('<script src="https://cdn.example/app.js"></script>'), /remote initial script/);
  assert.throws(() => exportedRouteFiles('<script src="//cdn.example/app.js"></script>'), /remote initial script/);
  assert.throws(() => exportedRouteFiles('<script src="/app.js"></script>'), /Unsupported initial script/);
  assert.throws(() => exportedRouteFiles('<script src="_next/static/app.js"></script>'), /Unsupported initial script/);
  assert.throws(() => exportedRouteFiles('<script src="/_next/static/asset.wasm"></script>'), /Unsupported initial script/);
  assert.throws(() => exportedRouteFiles('<script src="/_next/static/%xx.js"></script>'), /URI malformed/);
});

test('ignores data-src attributes and rejects route traversal in export mode', (t) => {
  assert.throws(() => exportedRouteFiles('<script data-src="/_next/static/app.js"></script>'), /no initial script/);
  const directory = writeFixture(t, {});
  assert.throws(() => measureInitialBundles(directory, { '/../page': { raw: 1000, gzip: 1000 } }), /Unsupported route entry/);
});
