import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateSdkReference, referenceText } from '../generate-sdk-reference.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(files, run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'npe-sdk-reference-'));
  try {
    symlinkSync(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@dashevo/evo-sdk': '4.0.0-rc.2' } }));
    writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['./src/*'] } },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    }));
    for (const [name, source] of Object.entries(files)) {
      const output = path.join(root, name);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, source);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('follows selected hooks and aliased re-exports without pulling unused or type-only queries', () => {
  fixture({
    'src/app/identity/page.tsx': `import { selected as useSelected } from '@/barrel';
      import type { unused } from '@/hooks';
      export default function Page() { useSelected(); return null; }`,
    'src/barrel.ts': `export { selected } from './hooks';`,
    'src/hooks.ts': `import type { EvoSDK } from '@dashevo/evo-sdk';
      declare const client: EvoSDK;
      export function selected() {
        type UnusedSignature = ReturnType<typeof unused>;
        const sdk = { invented: () => null }; sdk.invented();
        const example = 'sdk.tokens.totalSupply()';
        void example;
        return [client.identities.fetch('id'), client.identities.fetchWithProof('id')];
      }
      export function unused() { return client.tokens.totalSupply('token'); }`,
    'src/app/layout.tsx': `import { unused } from '@/hooks'; export default function Layout() { unused(); return null; }`,
  }, (root) => {
    const map = generateSdkReference(root);
    assert.equal(map.pages.length, 1);
    assert.equal(map.pages[0].route, '/identity/');
    assert.deepEqual(map.pages[0].calls.map((call) => call.method), ['identities.fetch', 'identities.fetchWithProof']);
    assert.equal(map.pages[0].calls[0].sources[0].file, 'src/hooks.ts');
    assert.equal(map.pages[0].calls[0].sources[0].owner, 'selected');
    assert.ok(map.pages[0].calls[0].sources[0].line > 1);
  });
});

test('walks JSX components, dynamic local imports and cycles while distinguishing direct WASM and utilities', () => {
  fixture({
    'src/app/page.tsx': `import { Component } from '@/component'; export default function Page() { return <Component />; }`,
    'src/app/local/page.tsx': `export default function Page() { return <div>Local</div>; }`,
    'src/component.tsx': `import { cycle } from '@/cycle'; export function Component() {
      async function handle() {
        cycle();
        const { query: run } = await import('@/reads'); await run();
        const module = await import('@/namespace'); await module.lookup();
      }
      return <button onClick={handle}>Read</button>;
    }`,
    'src/cycle.ts': `import { Component } from './component'; export function cycle() { return Component; }`,
    'src/reads.ts': `import type { EvoSDK } from '@dashevo/evo-sdk'; declare const client: EvoSDK;
      export async function query() {
        const wasm = await client.getWasmSdkConnected();
        return wasm.getDocumentsCount({});
      }
      export async function unused() { return client.tokens.totalSupply('token'); }`,
    'src/namespace.ts': `import type { EvoSDK } from '@dashevo/evo-sdk'; declare const client: EvoSDK | null;
      export async function lookup() {
        if (!client) return;
        const module = await import('@dashevo/evo-sdk'); await module.ensureInitialized();
        const { wallet } = await import('@dashevo/evo-sdk'); await wallet.validateMnemonic('words');
        return client.contracts.fetch('contract');
      }`,
  }, (root) => {
    const map = generateSdkReference(root);
    assert.deepEqual(map.pages.find((page) => page.route === '/').calls.map(({ method, kind }) => [kind, method]), [
      ['facade', 'contracts.fetch'], ['facade', 'getWasmSdkConnected'],
      ['utility', 'ensureInitialized'], ['utility', 'wallet.validateMnemonic'], ['wasm', 'getDocumentsCount'],
    ]);
    assert.deepEqual(map.pages.find((page) => page.route === '/local/').calls, []);
    assert.equal(referenceText(root), referenceText(root));
  });
});

test('the shipped generated map binds actual epoch, aggregate, signer and no-call reference routes', () => {
  const map = JSON.parse(readFileSync(path.join(project, 'src/data/sdk-reference.json'), 'utf8'));
  const methods = (route) => map.pages.find((page) => page.route === route).calls.map((call) => call.method);
  assert.deepEqual(methods('/sdk-reference/'), []);
  assert.ok(methods('/epoch/').includes('epoch.epochsInfoWithProof'));
  assert.ok(!methods('/epoch/').includes('epoch.current'));
  assert.ok(methods('/query/').includes('getDocumentsCount'));
  assert.ok(methods('/wallet/').includes('wallet.deriveKeyFromSeedWithPath'));
  assert.ok(methods('/broadcast/').includes('documents.replace'));
  assert.ok(!methods('/broadcast/').includes('identities.topUp'));
});
