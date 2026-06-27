import { test, expect } from '@playwright/test';

test('home page renders with brand mark', async ({ page }) => {
  await page.goto('/');
  // The Field Manual brand mark in the header (BrandRow → Logotype).
  await expect(page.getByText('native_explorer')).toBeVisible();
});

test('desktop sidebar exposes core deterministic routes', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  const searchLink = page.getByRole('link', { name: 'Search', exact: true });
  await expect(searchLink).toBeVisible();

  await searchLink.click();
  await expect(page).toHaveURL(/\/search\/?$/);
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
});

test('search shows an empty deterministic result for unclassified input', async ({ page }) => {
  await page.goto('/search/?q=%3F%3F%3F');

  await expect(page.getByText('Classified as: nothing recognisable')).toBeVisible();
  await expect(page.getByText('No matches')).toBeVisible();
});

test('search redirects single static epoch matches without live SDK data', async ({ page }) => {
  await page.goto('/search/?q=42');

  await expect(page).toHaveURL(/\/epoch\/detail\/\?index=42$/);
});

test('settings persist network preference in localStorage', async ({ page }) => {
  await page.goto('/settings/');

  const settingsNetworkSelect = page.locator('main select').first();
  await settingsNetworkSelect.selectOption('mainnet');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('npe:network')))
    .toBe('mainnet');

  await page.reload();
  await expect(page.locator('main select').first()).toHaveValue('mainnet');
});

test('mobile viewport renders the primary app chrome without desktop sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/about/');

  await expect(page.getByText('native_explorer')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Native Platform Explorer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeHidden();
});
