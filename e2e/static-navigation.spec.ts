import { test, expect } from '@playwright/test';

test('static export navigation retains the current document and header control', async ({ page }) => {
  const payload = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/search/index.txt'),
  );
  // Block SDK construction through an unknown selection, so this check depends
  // only on the real production Next router and its exported navigation payload.
  await page.goto('settings/?network=static-navigation-unknown');
  await expect(page.getByRole('alert').filter({ hasText: 'static-navigation-unknown' })).toBeVisible();
  const headerSearch = page.getByRole('banner').getByRole('searchbox', { name: 'Search', exact: true });
  const control = await headerSearch.elementHandle();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await headerSearch.fill('keep this navigation draft');
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
  const response = await payload;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^text\/plain(?:;|$)/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(await control!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(headerSearch).toHaveValue('keep this navigation draft');
});
