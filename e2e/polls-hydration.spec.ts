import { test, expect } from '@playwright/test';

test('vote polls hydrate with a browser clock different from the static build', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2030-02-03T12:34:56.000Z'));
  // No successful network data is needed to verify hydration and the date range.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort('failed'));
  await page.goto('governance/polls/?network=testnet');
  await expect(page.getByRole('heading', { name: 'Vote polls', exact: true })).toBeVisible();
  const start = await page.evaluate(() => new Date(Math.floor(Date.now() / 60_000) * 60_000).toLocaleString());
  await expect(page.getByText(`Querying ${start} → no upper bound`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
