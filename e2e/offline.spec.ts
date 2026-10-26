import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createExportServer } from '../scripts/serve-export.mjs';

// The offline service worker (PRD §14.3) against the real export, at the
// deployment prefix. Each test runs its own server on its own origin (so the
// worker and caches start empty) and can swap the served directory to
// simulate a deploy. External requests are aborted: these tests cover the
// app shell, not Platform data.
test.use({ serviceWorkers: 'allow' });

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const OUT = path.resolve('out');
const BUILD_META = /<meta name="npe-build" content="([^"]+)"\/>/;
const currentBuild = BUILD_META.exec(readFileSync(path.join(OUT, 'index.html'), 'utf8'))![1];
const CHUNKS = path.join(OUT, '_next/static/chunks');
// The SDK chunk (with its WASM) is by far the largest.
const SDK_CHUNK = readdirSync(CHUNKS)
  .filter((name) => name.endsWith('.js'))
  .sort((a, b) => statSync(path.join(CHUNKS, b)).size - statSync(path.join(CHUNKS, a)).size)[0]!;

async function serve() {
  const server = createExportServer({ root: OUT, basePath });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}${basePath}/` };
}

/** A copy of the export rewritten as another deploy: HTML and sw.js name
 *  `buildId`, and the worker uses its own cache version. */
function exportCopy(edit: (sw: string) => string, buildId = currentBuild) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'npe-deploy-'));
  cpSync(OUT, dir, { recursive: true });
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const file = path.join(entry.parentPath, entry.name);
    writeFileSync(file, readFileSync(file, 'utf8').replace(BUILD_META, `<meta name="npe-build" content="${buildId}"/>`));
  }
  const sw = path.join(dir, 'sw.js');
  writeFileSync(sw, edit(readFileSync(sw, 'utf8').replaceAll(`"buildId":"${currentBuild}"`, `"buildId":"${buildId}"`)));
  return dir;
}

const otherVersion = (sw: string) => sw.replace(/"version":"[^"]+"/, '"version":"e2e-previous-deploy"');

async function blockExternal(context: BrowserContext) {
  // Local requests are not intercepted at all: routed requests the worker
  // makes itself can stall under load and keep it from being replaced.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort('failed'));
}

async function controlledBy(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return page.evaluate(async () => ({
    scope: (await navigator.serviceWorker.getRegistration())?.scope,
    caches: (await caches.keys()).sort(),
  }));
}

async function cachedPaths(page: Page) {
  return page.evaluate(async () => {
    const keys = await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()));
    return keys.flat().map((request) => new URL(request.url).pathname);
  });
}

async function checkForUpdate(page: Page) {
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
}

const HEADER_SEARCH = (page: Page) => page.getByRole('banner').getByRole('searchbox', { name: 'Search', exact: true });
const PROMPT = 'A new version of the explorer is available.';
// Activating a worker waits for the old one's pending cache writes (the SDK
// chunk is ~12 MB), which takes a while on a busy machine.
const WORKER_SWITCH_MS = 15_000;

test('the app shell and visited pages load offline; other pages explain why not', async ({ page, context }) => {
  const { server, url } = await serve();
  try {
    await blockExternal(context);
    // The first page loads before the worker controls it; the page then hands
    // its HTML and the SDK chunk it fetched to the worker.
    await page.goto(`${url}about/?network=testnet`);
    const { scope, caches: cacheNames } = await controlledBy(page);
    expect(scope).toBe(url);
    expect(cacheNames.every((name) => name.startsWith(`npe:${basePath}/:`))).toBe(true);
    await expect.poll(() => cachedPaths(page), { timeout: WORKER_SWITCH_MS }).toEqual(expect.arrayContaining([
      `${basePath}/about/`,
      `${basePath}/_next/static/chunks/${SDK_CHUNK}`,
    ]));

    // setOffline takes the page offline but not the worker's own fetches, so
    // the server goes down too, as the network would.
    await context.setOffline(true);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await page.goto(url);
    await expect(HEADER_SEARCH(page)).toBeVisible();
    // The SDK itself loads from the cache; only the network is missing.
    const notice = page.getByRole('alert').filter({ hasText: 'You are offline' });
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText('Loading chunk');
    await page.goto(`${url}about/`);
    await expect(page.getByRole('heading', { name: 'Native Platform Explorer', level: 1 })).toBeVisible();
    await page.goto(`${url}query/?network=testnet`);
    await expect(page.getByRole('heading', { name: 'This page is not available offline' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`${basePath}/query/`);
    await expect(HEADER_SEARCH(page)).toBeVisible();
  } finally {
    await context.setOffline(false);
    server.close();
  }
});

test('a new deploy offers a reload that switches builds without failed loads', async ({ page, context }) => {
  const previous = exportCopy(otherVersion, 'e2e-previous');
  const { server, url } = await serve();
  try {
    server.setRoot(previous);
    await blockExternal(context);
    await page.goto(url);
    const before = await controlledBy(page);
    await expect(page.getByText(PROMPT)).toBeHidden();

    server.setRoot(OUT);
    const failures: string[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).hostname === '127.0.0.1' && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });
    page.on('pageerror', (error) => failures.push(error.message));
    await checkForUpdate(page);
    await expect(page.getByText(PROMPT)).toBeVisible({ timeout: WORKER_SWITCH_MS });

    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await reloaded;
    await expect(HEADER_SEARCH(page)).toBeVisible();
    await expect(page.locator('meta[name="npe-build"]')).toHaveAttribute('content', currentBuild);
    await expect(page.getByText(PROMPT)).toBeHidden();
    const after = await controlledBy(page);
    expect(after.caches).toHaveLength(2);
    expect(after.caches.some((name) => before.caches.includes(name))).toBe(false);
    expect(failures).toEqual([]);
  } finally {
    server.close();
    rmSync(previous, { recursive: true, force: true });
  }
});

test('a page already on the new build switches workers silently', async ({ page, context }) => {
  const previous = exportCopy(otherVersion);
  const { server, url } = await serve();
  try {
    server.setRoot(previous);
    await blockExternal(context);
    await page.goto(url);
    const before = await controlledBy(page);

    server.setRoot(OUT);
    await checkForUpdate(page);
    await expect.poll(async () => (await controlledBy(page)).caches, { timeout: WORKER_SWITCH_MS }).not.toEqual(before.caches);
    await expect(page.getByText(PROMPT)).toBeHidden();
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  } finally {
    server.close();
    rmSync(previous, { recursive: true, force: true });
  }
});

test('the kill switch worker removes the caches and registration', async ({ page, context }) => {
  const killed = exportCopy(() => readFileSync(path.resolve('scripts/sw/unregister.js'), 'utf8'));
  const { server, url } = await serve();
  try {
    await blockExternal(context);
    await page.goto(url);
    await controlledBy(page);
    // Let the worker finish caching the first visit's SDK chunk.
    await expect.poll(() => cachedPaths(page), { timeout: WORKER_SWITCH_MS })
      .toContain(`${basePath}/_next/static/chunks/${SDK_CHUNK}`);

    server.setRoot(killed);
    // Each poll repeats the update check, as further navigations would.
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update().catch(() => undefined);
      return { registered: registration !== undefined, caches: await caches.keys() };
    }), { timeout: WORKER_SWITCH_MS }).toEqual({ registered: false, caches: [] });
    await expect(HEADER_SEARCH(page)).toBeVisible();
  } finally {
    server.close();
    rmSync(killed, { recursive: true, force: true });
  }
});
