import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    expect(pageErrors).toEqual([]);
  },
});

// These are explicit browser-local collections, not mocked SDK responses. All
// pages load the production WASM SDK; no test claims that fixture entities exist.
const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const identityId = '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6';

test('saved items filter, open their recorded network, remove and clear across reload', async ({ page }) => {
  await page.addInitScript(({ contractId, identityId }) => {
    // Seed once so reload assertions exercise real persisted mutations.
    if (sessionStorage.getItem('exploration-fixture')) return;
    sessionStorage.setItem('exploration-fixture', '1');
    localStorage.setItem('npe:savedEntities', JSON.stringify([
      { kind: 'contract', id: contractId, network: 'testnet', savedAt: 1 },
      { kind: 'identity', id: identityId, network: 'mainnet', savedAt: 2 },
      { kind: 'token', id: contractId, network: 'devnet-not-configured', savedAt: 3 },
    ]));
  }, { contractId, identityId });
  await page.goto('saved/?network=testnet');
  await expect(page.getByRole('status').filter({ hasText: '1 saved item' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Open / })).toHaveCount(1);
  await page.getByLabel('Network scope').selectOption('all');
  await expect(page.getByRole('link', { name: /^Open / })).toHaveCount(2);
  await expect(page.getByText('Configure this custom devnet in Settings before opening.')).toBeVisible();
  await page.getByLabel('Entity type').selectOption('identity');
  const savedLink = page.getByRole('link', { name: `Open identity ${identityId} on mainnet` });
  await expect(savedLink).toBeVisible();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await savedLink.click();
  await expect(page).toHaveURL(new RegExp(`identity/?\\?id=${identityId}&network=mainnet$`));
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  await page.getByRole('link', { name: 'Saved items', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved item' })).toBeVisible();
  await page.getByRole('button', { name: `Remove identity ${identityId} on mainnet` }).click();
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'No saved items' })).toBeVisible();
  await page.getByLabel('Network scope').selectOption('all');
  await expect(page.getByRole('status').filter({ hasText: '2 saved items' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all saved items' }).focus();
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clear all saved items' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('npe:savedEntities'))).toBeNull();
});

test('saved items retain a configured custom network name longer than 80 characters', async ({ page }) => {
  const network = `devnet-${'a'.repeat(74)}`;
  // A browser-local registry/bookmark fixture, not a live custom devnet or SDK
  // result. Transport is deliberately unavailable; only context is asserted.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort('failed'));
  await page.addInitScript(({ network, contractId }) => {
    if (sessionStorage.getItem('long-network-fixture')) return;
    sessionStorage.setItem('long-network-fixture', '1');
    localStorage.setItem('npe:customDevnets', JSON.stringify([
      { type: 'devnet', name: network, label: network, quorumUrl: 'https://unavailable.example' },
    ]));
    localStorage.setItem('npe:savedEntities', JSON.stringify([
      { kind: 'contract', id: contractId, network, savedAt: 1 },
    ]));
  }, { network, contractId });
  await page.goto(`saved/?network=${network}`);
  await expect(page.getByRole('status').filter({ hasText: '1 saved item' })).toBeVisible();
  const link = page.getByRole('link', { name: `Open contract ${contractId} on ${network}` });
  await expect(link).toBeVisible();
  const href = new URL((await link.getAttribute('href'))!, page.url());
  expect(href.pathname).toBe(new URL('contract/', page.url()).pathname);
  expect(href.searchParams.get('id')).toBe(contractId);
  expect(href.searchParams.get('network')).toBe(network);
  await page.reload();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`network=${network}$`));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:network'))).toBe(network);
  await page.goto(`saved/?network=${network}`);
  await page.getByRole('button', { name: `Remove contract ${contractId} on ${network}` }).click();
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'No saved items' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('npe:savedEntities'))).toBeNull();
});

test('page sharing preserves entity parameters, fragment, deployment prefix and selected network', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`contract/document/?id=${contractId}&type=domain&docId=${identityId}&network=testnet#metadata`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:network'))).toBe('testnet');
  await expect(page.getByRole('button', { name: 'Testnet', exact: true })).toBeVisible();
  const copy = page.getByRole('button', { name: 'Copy page link' });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('header').getByRole('status')).toHaveText('Link copied for testnet.');
  await expect(page.getByRole('region', { name: 'Notifications-bottom' }).getByRole('status').filter({ hasText: 'Link copied for testnet.' })).toBeVisible();
  const initial = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(initial.pathname).toBe(new URL(page.url()).pathname);
  expect(initial.searchParams.get('id')).toBe(contractId);
  expect(initial.searchParams.get('type')).toBe('domain');
  expect(initial.searchParams.get('docId')).toBe(identityId);
  expect(initial.hash).toBe('#metadata');
  await page.getByRole('button', { name: 'Testnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(page).toHaveURL(/network=mainnet/);
  await copy.click();
  await expect(page.locator('header').getByRole('status')).toHaveText('Link copied for mainnet.');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto('settings/?network=testnet');
  await expect(page.getByLabel('Active network')).toHaveValue('testnet');
  await page.goto(shared);
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('npe:network'))).toBe('mainnet');
  expect(new URL(shared).searchParams.get('docId')).toBe(identityId);
  await page.goto(`identity/?id=${identityId}&network=devnet-not-configured`);
  await expect(page.getByRole('alert').filter({ hasText: 'Unknown network' })).toBeVisible();
  await copy.click();
  const warning = page.getByRole('region', { name: 'Notifications-bottom' }).getByRole('status').filter({ hasText: 'Recipients must configure this custom devnet first.' });
  await expect(warning).toBeVisible();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get('network')).toBe('devnet-not-configured');
});

test('empty and invalid search inputs stay distinct from an unavailable network and support retry', async ({ page }) => {
  // Disclosed transport failure; the SDK's real connection/error code still runs.
  let blocked = 0;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    blocked++;
    await route.abort('failed');
  });
  await page.goto('search/?network=testnet');
  await expect(page.getByText('Enter a query to start exploring.')).toBeVisible();
  await page.goto('search/?q=%3F%3F%3F&network=testnet');
  await expect(page.getByRole('heading', { name: 'Invalid search input' })).toBeVisible();
  await page.goto('search/?q=alice.dash&network=testnet');
  await expect(page.getByRole('heading', { name: 'Search unavailable' })).toBeVisible({ timeout: 30_000 });
  expect(blocked).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'No matching entity found' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Invalid search input' })).toHaveCount(0);
  const attempts = blocked;
  await page.locator('main').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => blocked).toBeGreaterThan(attempts);
  await expect(page.getByRole('heading', { name: 'No matching entity found' })).toHaveCount(0);
});

test('clearing and revoking viewed identity history persist and work with the keyboard', async ({ page }) => {
  await page.addInitScript(({ contractId, identityId }) => {
    if (sessionStorage.getItem('history-fixture')) return;
    sessionStorage.setItem('history-fixture', '1');
    localStorage.setItem('npe:viewedIdentitiesConsent', '1');
    localStorage.setItem('npe:viewedIdentities', JSON.stringify([contractId, identityId]));
  }, { contractId, identityId });
  await page.goto('settings/?network=testnet');
  const consent = page.getByRole('checkbox', { name: 'Remember viewed identities' });
  await expect(consent).toBeChecked();
  await expect(page.getByText('2 remembered identities', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear viewed identities' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('0 remembered identities', { exact: true })).toBeVisible();
  await expect(consent).toBeChecked();
  await page.reload();
  await expect(consent).toBeChecked();
  await expect(page.getByText('0 remembered identities', { exact: true })).toBeVisible();
  // Restore an explicit nonempty history fixture to prove revocation removes
  // actual stored IDs as well as the preference, after testing Clear separately.
  await page.evaluate((identityId) => localStorage.setItem('npe:viewedIdentities', JSON.stringify([identityId])), identityId);
  await page.reload();
  await expect(page.getByText('1 remembered identity', { exact: true })).toBeVisible();
  await consent.focus();
  await page.keyboard.press('Space');
  await expect(consent).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('npe:viewedIdentitiesConsent'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('npe:viewedIdentities'))).toBeNull();
  await page.reload();
  await expect(consent).not.toBeChecked();
  await consent.focus();
  await page.keyboard.press('Space');
  await expect(consent).toBeChecked();
  await expect(page.getByText('0 remembered identities', { exact: true })).toBeVisible();
});
