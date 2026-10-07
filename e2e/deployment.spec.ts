import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('the exported site serves its routes, assets and bundled fonts at the deployment prefix', async ({ page, request }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && response.status() >= 400) failures.push(url.pathname);
  });
  await page.goto('about/');
  await expect(page.getByRole('heading', { name: 'Native Platform Explorer' })).toBeVisible();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  await expect(page).toHaveURL(new RegExp(`${basePath}/about/`));
  await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  const fontUrls = resources.filter((url) => /\.(woff2?|ttf)(?:\?|$)/.test(url));
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const fontUrl of fontUrls) {
    expect(new URL(fontUrl).pathname).toMatch(new RegExp(`^${basePath}/_next/`));
    expect((await request.get(fontUrl)).ok()).toBe(true);
  }
  expect(failures).toEqual([]);
  for (const filename of ['Fraunces-OFL.txt', 'JetBrainsMono-OFL.txt']) {
    const response = await request.get(filename);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toBe(readFileSync(`src/styles/fonts/${filename}`, 'utf8'));
  }
  if (basePath) expect((await request.get(new URL('/about/', page.url()).href)).status()).toBe(404);
});
