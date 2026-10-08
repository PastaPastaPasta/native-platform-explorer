import { test, expect } from '@playwright/test';

test('mobile navigation drawer supports focus restoration and client navigation', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('about/');

  const openMenu = page.getByRole('button', { name: 'Open menu' });
  await openMenu.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(openMenu).toBeFocused();

  await openMenu.click();
  await drawer.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/search\/?$/);
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
  await expect(drawer).toBeHidden();
  expect(errors).toEqual([]);
});

test('settings modal retains controlled input and restores focus on close', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('settings/');

  const openModal = page.getByRole('button', { name: 'Add custom devnet…' });
  await openModal.click();
  const dialog = page.getByRole('dialog', { name: 'Add custom devnet' });
  await expect(dialog).toBeVisible();
  const name = dialog.getByRole('textbox', { name: /^Name/ });
  await name.fill('devnet-framework-test');
  await expect(name).toHaveValue('devnet-framework-test');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(openModal).toBeFocused();
  expect(errors).toEqual([]);
});

test('query editor preserves URL state through a client update and reload', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  // Real non-trusted SDK initialization, with an explicit endpoint outage.
  // This checks URL state without depending on a successful network query.
  await page.addInitScript(() => localStorage.setItem('npe:trusted', 'false'));
  await page.route(/^https?:\/\//, (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === '127.0.0.1' || hostname === 'localhost'
      ? route.continue()
      : route.abort('failed');
  });
  const initialSql = 'not valid SQL';
  await page.goto(`query/?network=testnet&q=${encodeURIComponent(initialSql)}`);

  const editor = page.getByRole('textbox', { name: 'SQL Query' });
  await expect(editor).toHaveValue(initialSql);
  await expect(page.getByRole('status').filter({ hasText: /^Ready on testnet$/ })).toBeVisible();
  // The workspace publishes a URL only after valid SQL starts a run.
  const updatedSql = 'SELECT COUNT(*) FROM domain';
  await editor.fill(updatedSql);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(updatedSql);

  await page.reload();
  await expect(editor).toHaveValue(updatedSql);
  await expect(page.getByRole('heading', { name: 'Query workspace', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
