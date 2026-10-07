import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Delay the real SDK chunks from this build, without replacing the SDK or its
// cryptography. Non-trusted startup initializes real WASM locally; endpoint
// requests are aborted so external availability cannot determine this check.
const loadableManifest: Record<string, { files: string[] }> = JSON.parse(
  readFileSync('.next/react-loadable-manifest.json', 'utf8'),
);
const sdkFiles = loadableManifest['sdk/SdkProvider.tsx -> @dashevo/evo-sdk']?.files ?? [];
if (!sdkFiles.length) throw new Error('SDK dynamic import is absent from the build manifest');

async function deferSdk(page: Page) {
  await page.addInitScript(() => localStorage.setItem('npe:trusted', 'false'));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let heldRequests = 0;
  let interactionTime = 0;
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    // Endpoint failures are intentional in this offline fixture. React
    // hydration and chunk-loader errors must still fail the startup check.
    if (message.type() === 'error' && /hydrat|chunkloaderror|loading chunk|minified react error/i.test(message.text())) {
      browserErrors.push(message.text());
    }
  });
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      await route.abort('failed');
    } else {
      if (sdkFiles.some((file) => url.pathname.endsWith(`/_next/${file}`))) {
        heldRequests++;
        await pending;
      }
      await route.continue();
    }
  });
  return {
    release,
    async expectShellReady() {
      await expect.poll(() => heldRequests).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Testnet', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: 'Mainnet', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName('npe:app-shell').length)).toBe(1);
      expect(await page.evaluate(() => performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('npe:sdk:')).length)).toBe(0);
      interactionTime = await page.evaluate(() => performance.now());
    },
    async expectSdkReady() {
      release();
      await expect.poll(() => page.evaluate(() =>
        performance.getEntriesByName('npe:sdk:connect').map((entry) => (entry as PerformanceMeasure).detail?.outcome),
      ), { timeout: 20_000 }).toContain('success');
      const measures = await page.evaluate(() => performance.getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('npe:sdk:'))
        .map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration, detail: (entry as PerformanceMeasure).detail })));
      expect(measures.map(({ name }) => name)).toEqual(['npe:sdk:module-load', 'npe:sdk:construct', 'npe:sdk:connect']);
      expect(new Set(measures.map(({ detail }) => detail.sessionId)).size).toBe(1);
      expect(measures.every(({ duration, detail }) => Number.isFinite(duration) && duration >= 0 && detail.outcome === 'success')).toBe(true);
      expect(measures[0]!.start + measures[0]!.duration).toBeGreaterThan(interactionTime);
      for (let index = 1; index < measures.length; index++) {
        expect(measures[index]!.start).toBeGreaterThanOrEqual(measures[index - 1]!.start + measures[index - 1]!.duration);
      }
      expect(await page.evaluate(() => performance.getEntriesByName('npe:app-shell').length)).toBe(1);
      expect(browserErrors).toEqual([]);
    },
  };
}

test('query controls respond before the actual SDK module finishes loading', async ({ page }) => {
  const sdk = await deferSdk(page);
  try {
    await page.goto('query/?network=testnet', { waitUntil: 'domcontentloaded' });
    const editor = page.getByLabel('SQL Query');
    await editor.fill('SELECT COUNT(*) FROM domain');
    await expect(editor).toHaveValue('SELECT COUNT(*) FROM domain');
    await page.getByLabel('Query name').fill('Startup query');
    await page.getByRole('button', { name: 'Save query', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Startup query', exact: true })).toBeVisible();
    await sdk.expectShellReady();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    await sdk.expectSdkReady();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
    await expect(editor).toHaveValue('SELECT COUNT(*) FROM domain');
  } finally {
    sdk.release();
  }
});

test('wallet controls respond before the actual SDK module finishes loading', async ({ page }) => {
  const sdk = await deferSdk(page);
  try {
    await page.goto('wallet/?network=testnet', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'WIF', exact: true }).click();
    const identity = page.getByRole('textbox', { name: 'Identity ID', exact: true });
    await identity.fill('8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr');
    await expect(identity).toHaveValue('8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr');
    await page.getByLabel('WIF private key', { exact: true }).fill('invalid-test-WIF');
    await sdk.expectShellReady();
    await expect(page.getByRole('button', { name: 'Connect WIF', exact: true })).toBeDisabled();
    await sdk.expectSdkReady();
    await expect(page.getByRole('button', { name: 'Connect WIF', exact: true })).toBeEnabled();
  } finally {
    sdk.release();
  }
});

test('broadcast operation controls respond before the actual SDK module finishes loading', async ({ page }) => {
  const sdk = await deferSdk(page);
  try {
    await page.goto('broadcast/?network=testnet', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Top up an identity/ }).click();
    const identity = page.getByRole('textbox', { name: 'Identity', exact: true });
    await identity.fill('public-identity-draft');
    await expect(identity).toHaveValue('public-identity-draft');
    await expect(page.getByText('External bridge', { exact: true })).toBeVisible();
    await sdk.expectShellReady();
    await sdk.expectSdkReady();
    await expect(page.getByRole('button', { name: 'Sign + broadcast', exact: true })).toHaveCount(0);
  } finally {
    sdk.release();
  }
});
