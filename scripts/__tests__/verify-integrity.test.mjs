import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sri } from '../harden-export.mjs';
import { checkServedFiles, compareManifests } from '../verify-integrity.mjs';

const manifest = (overrides = {}) => ({
  commit: 'abc',
  dirty: false,
  basePath: '',
  serviceWorker: 'on',
  env: { NEXT_PUBLIC_BRIDGE_URL: 'https://bridge.dashhq.org' },
  toolchain: { node: 'v22.20.0', packageManager: 'pnpm@9.15.9', next: '16.3.8', evoSdk: '5.0.0-rc.8' },
  files: { 'index.html': 'sha256-a', 'sw.js': 'sha256-b' },
  ...overrides,
});

test('identical manifests have no problems or notes', () => {
  assert.deepEqual(compareManifests(manifest(), manifest()), { problems: [], notes: [] });
});

test('file differences are problems; settings differences explain them', () => {
  const deployed = manifest({
    commit: 'def',
    basePath: '/app',
    env: {},
    files: { 'index.html': 'sha256-z', 'extra.js': 'sha256-c' },
  });
  const { problems, notes } = compareManifests(manifest({ dirty: true }), deployed);
  assert.deepEqual(problems, ['Hash differs: index.html', 'Missing from the deployment: sw.js', 'Only in the deployment: extra.js']);
  assert.equal(notes.length, 4);
  assert.match(notes[0], /Commit differs: local abc, deployed def/);
  assert.match(notes[1], /uncommitted changes/);
  assert.match(notes[2], /Base path differs/);
  assert.match(notes[3], /NEXT_PUBLIC_BRIDGE_URL differs/);
});

test('served files are hashed as downloaded; dotfiles are skipped', async () => {
  const served = { 'https://x.test/a/index.html': 'page', 'https://x.test/a/_next/static/x%20y.js': 'changed' };
  const requested = [];
  const problems = await checkServedFiles('https://x.test/a/', {
    'index.html': sri(Buffer.from('page')),
    '_next/static/x y.js': sri(Buffer.from('original')),
    'gone.txt': 'sha256-x',
    '.nojekyll': sri(Buffer.from('')),
  }, {
    fetcher: async (url) => {
      requested.push(url);
      if (!(url in served)) throw new Error('HTTP 404');
      return Buffer.from(served[url]);
    },
  });
  assert.deepEqual(problems, ['Could not download gone.txt: HTTP 404', 'Served file differs: _next/static/x y.js']);
  assert.ok(!requested.some((url) => url.includes('.nojekyll')));
});
