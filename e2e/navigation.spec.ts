import { test as base, expect, type Page } from '@playwright/test';
import { routeOffline } from './quorum-fixtures';

// Deterministic, offline checks of navigation, landing inputs, URL state and
// titles. DAPI is unreachable here, so no assertion depends on Platform data.
const test = base.extend({
  page: async ({ page }, providePage) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await routeOffline(page);
    await providePage(page);
    expect(pageErrors).toEqual([]);
  },
});

const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const LOCAL_ID = 'Gz1ayo3EKKZTZrcgiqsoaAVMXaZUrv48YFzBVhP5jtJ6';
const TESTNET_ADDRESS = 'tdash1kqrswpc8qurswpc8qurswpc8qurswpc8qu8dr2j6';

const nav = (page: Page) => page.getByRole('complementary', { name: 'Main navigation' });

test('the sidebar links every reachable section and marks the current one', async ({ page }) => {
  await page.goto('?network=testnet');
  for (const [label, heading] of [
    ['Settings', 'Settings'],
    ['Groups', 'Groups'],
    ['Quorums', 'Active quorums'],
    ['Credits', 'Total credits on Platform'],
    ['Epoch history', 'Epoch history'],
  ] as const) {
    await nav(page).getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await expect(nav(page).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  // "Epoch" is not also marked while on Epoch history.
  await expect(nav(page).getByRole('link', { name: 'Epoch', exact: true })).not.toHaveAttribute('aria-current', 'page');
});

test('epoch detail links to its neighbours and to the history range', async ({ page }) => {
  await page.goto('epoch/detail/?index=42&network=testnet');
  await expect(page).toHaveTitle('Epoch #42 — Native Platform Explorer');
  const epochNav = page.getByRole('navigation', { name: 'Epoch navigation' });
  await epochNav.getByRole('link', { name: 'Epoch #41' }).click();
  await expect(page).toHaveURL(/epoch\/detail\/?\?index=41$/);
  await expect(page).toHaveTitle('Epoch #41 — Native Platform Explorer');
  await page.getByRole('navigation', { name: 'Epoch navigation' }).getByRole('link', { name: 'Epoch history' }).click();
  await expect(page).toHaveURL(/epoch\/history\/?\?to=41$/);
  await expect(page.getByLabel('End epoch')).toHaveValue('41');
});

test('landing inputs validate and open their pages', async ({ page }) => {
  await page.goto('state-transition/?network=testnet');
  await expect(page).toHaveTitle('State transition lookup — Native Platform Explorer');
  const hash = page.getByLabel('State transition hash');
  await hash.fill('abc');
  await expect(page.getByText('Expected a 64-character hex hash.')).toBeVisible();
  await hash.fill('A'.repeat(64));
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page).toHaveURL(new RegExp(`state-transition/?\\?hash=${'a'.repeat(64)}`));
  await expect(page.getByRole('heading', { name: 'State transition result' })).toBeVisible();

  await page.goto('address/?network=testnet');
  await page.getByLabel('Platform address').fill(TESTNET_ADDRESS.replace(/^t/, ''));
  await expect(page.getByText(/^Expected a bech32m Platform address/)).toBeVisible();
  await page.getByLabel('Platform address').fill(TESTNET_ADDRESS);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page).toHaveURL(new RegExp(`address/?\\?addr=${TESTNET_ADDRESS}`));

  await page.goto('groups/?network=testnet');
  await page.getByLabel('Contract ID').fill(CONTRACT);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`groups/?\\?contractId=${CONTRACT}`));

  await page.goto('identity/lookup/?network=testnet');
  await page.getByLabel('Public-key hash').fill('f'.repeat(40));
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`identity/lookup/?\\?pkh=${'f'.repeat(40)}`));

  await page.goto('contract/documents/?network=testnet');
  await expect(page.getByRole('heading', { name: 'Browse documents' })).toBeVisible();
  await page.getByLabel('Contract ID').fill('not-an-id');
  await expect(page.getByText('Expected a 43–44 char base58 contract ID.')).toBeVisible();
});

test('epoch history range round-trips through the URL, reload and back/forward', async ({ page }) => {
  await page.goto('epoch/history/?from=5&to=7&network=testnet');
  await expect(page.getByLabel('Start epoch')).toHaveValue('5');
  await expect(page.getByLabel('End epoch')).toHaveValue('7');
  await page.getByLabel('Start epoch').fill('10');
  await page.getByLabel('End epoch').fill('12');
  await page.getByRole('button', { name: 'Show range' }).click();
  await expect(page).toHaveURL(/[?&]from=10&to=12|[?&]to=12.*from=10/);
  await expect(page).toHaveURL(/network=testnet/);
  await page.reload();
  await expect(page.getByLabel('Start epoch')).toHaveValue('10');
  await page.goBack();
  await expect(page.getByLabel('Start epoch')).toHaveValue('5');
  await expect(page.getByLabel('End epoch')).toHaveValue('7');
  await page.goForward();
  await expect(page.getByLabel('End epoch')).toHaveValue('12');
});

test('vote poll window and saved-item filters are shareable URLs', async ({ page }) => {
  await page.goto('governance/polls/?network=testnet');
  await page.getByRole('button', { name: 'Next 7 d' }).click();
  await expect(page).toHaveURL(/window=7d/);
  await expect(page.getByRole('button', { name: 'Next 7 d' })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).not.toHaveURL(/window=/);
  await expect(page.getByRole('button', { name: 'All upcoming' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('governance/polls/?window=custom&from=2030-01-01&to=2030-02-01&network=testnet');
  await expect(page.getByLabel('Polls ending from')).toHaveValue('2030-01-01');

  await page.goto('saved/?scope=all&kind=token&network=testnet');
  await expect(page.getByLabel('Network scope')).toHaveValue('all');
  await expect(page.getByLabel('Entity type')).toHaveValue('token');
  await page.getByLabel('Entity type').selectOption('contract');
  await expect(page).toHaveURL(/kind=contract/);
  await expect(page).toHaveTitle('Saved items — Native Platform Explorer');
});

test('DPNS search keeps its prefix and page cursor in the URL', async ({ page }) => {
  await page.goto(`dpns/search/?q=alice&after=${CONTRACT}&network=testnet`);
  await expect(page.getByPlaceholder('label prefix, e.g. al')).toHaveValue('alice');
  await expect(page).toHaveTitle('DPNS names starting with “alice” — Native Platform Explorer');
  await expect(page.getByText('page 2').first()).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).first().click();
  await expect(page).not.toHaveURL(/after=/);
  await expect(page.getByText('page 1').first()).toBeVisible();
  await page.goBack();
  await expect(page.getByText('page 2').first()).toBeVisible();
});

test('a local well-known entry persists, shows its source, and names the entity', async ({ page }) => {
  await page.goto('settings/?network=testnet');
  await page.getByLabel('Identifier').fill(LOCAL_ID);
  await page.getByLabel('Kind').selectOption('contract');
  await page.getByLabel('Name').fill('Hack the planet');
  await page.getByLabel('Tags').fill('groups');
  await page.getByRole('button', { name: 'Add local entry' }).click();
  await expect(page.getByRole('button', { name: 'Remove local entry Hack the planet' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove local entry Hack the planet' })).toBeVisible();
  await page.goto('groups/?network=testnet');
  await expect(page.getByRole('link', { name: 'Hack the planet' })).toBeVisible();
  await page.goto(`contract/?id=${LOCAL_ID}&network=testnet`);
  await expect(page).toHaveTitle('Hack the planet — Native Platform Explorer');
});
