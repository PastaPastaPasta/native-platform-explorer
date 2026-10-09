import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const loadableManifest: Record<string, { files: string[] }> = JSON.parse(
  readFileSync('.next/react-loadable-manifest.json', 'utf8'),
);
const sdkFiles = loadableManifest['sdk/SdkProvider.tsx -> @dashevo/evo-sdk']?.files ?? [];
if (!sdkFiles.length) throw new Error('SDK dynamic import is absent from the build manifest');

test('SDK reference filters remain usable while the real shared SDK chunks are held', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      await route.abort('failed');
      return;
    }
    if (sdkFiles.some((file) => url.pathname.endsWith(`/_next/${file}`))) {
      held++;
      await pending;
    }
    await route.continue();
  });
  try {
    await page.goto('sdk-reference/?network=testnet', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'SDK reference' })).toBeVisible();
    await expect.poll(() => held).toBeGreaterThan(0);
    expect(await page.evaluate(() => performance.getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('npe:sdk:')).length)).toBe(0);
    const route = page.getByLabel('Filter by page');
    const search = page.getByRole('textbox', { name: 'Search pages or SDK calls' });
    await route.selectOption('/query/');
    const query = page.getByRole('region', { name: '/query/' });
    await expect(query.getByText('documents.queryWithProof', { exact: true })).toBeVisible();
    await expect(query.getByText('getDocumentsAverage', { exact: true })).toBeVisible();
    await search.fill('getDocumentsCount');
    await expect(query.getByText('getDocumentsCount', { exact: true })).toBeVisible();
    await expect(query.getByText('documents.query', { exact: true })).toHaveCount(0);
    await search.fill('nonexistent-method');
    await expect(page.getByText('No pages or SDK calls match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await route.selectOption('/epoch/');
    const epoch = page.getByRole('region', { name: '/epoch/' });
    await expect(epoch.getByText('epoch.epochsInfoWithProof', { exact: true })).toBeVisible();
    await expect(epoch.getByText('epoch.current', { exact: true })).toHaveCount(0);
    await route.selectOption('/sdk-reference/');
    await expect(page.getByText('No page-specific SDK calls. This page uses local data, settings, or navigation.')).toBeVisible();
    await expect(page.getByText(/implemented in Stage|Stage 5\/6/)).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
