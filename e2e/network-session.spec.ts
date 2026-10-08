import { test, expect } from '@playwright/test';

// These exercise the real Next router and provider without requiring live DAPI
// success. Session cancellation and delayed responses are covered in unit tests.
test('a network switch with an existing link parameter survives search and reload', async ({ page }) => {
  await page.goto('settings/?network=testnet');
  await expect(page.getByText(/^SDK status: (connecting|ready|error)$/)).toBeVisible();
  const networkSelect = page.locator('main select').first();
  await expect(networkSelect).toHaveValue('testnet');
  await networkSelect.selectOption('mainnet');
  await expect(page).toHaveURL(/network=mainnet/);
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill('42');
  await search.press('Enter');
  await expect(page).toHaveURL(/search\/?\?q=42&network=mainnet/);
  await expect(page.getByRole('link', { name: 'Open Epoch 42 on mainnet' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Epoch 42 on mainnet' }).click();
  await expect(page).toHaveURL(/epoch\/detail\/?\?index=42&network=mainnet/);
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('npe:network'))).toBe('mainnet');
});

test('operation navigation preserves the network selected through the header', async ({ page }) => {
  await page.goto('broadcast/?network=testnet');
  // Wait for the client provider to hydrate before using its network menu.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:network'))).toBe('testnet');
  await page.getByRole('button', { name: 'Testnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(page).toHaveURL(/network=mainnet/);
  await page.getByRole('button', { name: /^Transfer credits/ }).click();
  await expect(page).toHaveURL(/op=identity.creditTransfer/);
  expect(new URL(page.url()).searchParams.get('network')).toBe('mainnet');
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← All operations' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('op')).toBeNull();
  expect(new URL(page.url()).searchParams.get('network')).toBe('mainnet');
});

test('invalid network links fail clearly and recover through the configured picker', async ({ page }) => {
  await page.goto('settings/?network=missing-browser-fixture');
  await expect(page.getByRole('alert').filter({ hasText: 'missing-browser-fixture' }))
    .toContainText('Unknown network "missing-browser-fixture"');
  await expect(page.getByText('SDK status: error', { exact: true })).toBeVisible();
  await page.locator('main select').first().selectOption('mainnet');
  await expect(page).toHaveURL(/network=mainnet/);
  await expect(page.getByRole('alert').filter({ hasText: 'missing-browser-fixture' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
});

test('client navigation to a network link updates the mounted SDK provider', async ({ page }) => {
  await page.goto('settings/?network=testnet');
  await expect(page.getByText(/^SDK status: (connecting|ready|error)$/)).toBeVisible();
  await expect(page.locator('main select').first()).toHaveValue('testnet');
  const originalSelect = await page.locator('main select').first().elementHandle();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  // Native history is Next's supported client-side path used by copied query
  // and entity links. It must update useSearchParams without a document reload.
  await page.evaluate(() => {
    const link = new URL(location.href);
    link.searchParams.set('network', 'mainnet');
    history.pushState(null, '', link);
  });
  await expect(page.locator('main select').first()).toHaveValue('mainnet');
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(await originalSelect!.evaluate((element) => element.isConnected)).toBe(true);
});
