import { test, expect, type Page, type Route } from '@playwright/test';

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';
const SQL = 'SELECT * FROM domain LIMIT 1';

// Exercise the production SDK and editor against an explicit HTTP outage.
// Untrusted SDK construction loads real WASM without a quorum-service fetch.
// No SDK module replacement or fabricated successful query response is used.
async function openOfflineWorkspace(page: Page, holdDapi?: (route: Route) => Promise<void>) {
  await page.addInitScript(() => localStorage.setItem('npe:trusted', 'false'));
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') await route.continue();
    else if (url.port === '1443' && holdDapi) await holdDapi(route);
    else await route.abort('failed');
  });
  await page.goto('query/?network=testnet');
  await expect(page.getByRole('status').filter({ hasText: /^Ready on testnet$/ })).toBeVisible();
}

test('saved queries persist only after saving and are scoped to network and contract', async ({ page }) => {
  await openOfflineWorkspace(page);
  const editor = page.getByLabel('SQL Query');
  const name = page.getByLabel('Query name');
  const savedQuery = page.getByRole('button', { name: 'My domains', exact: true });
  await editor.fill(SQL);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('npe:savedQueries:')))).toBe(false);
  await name.fill('My domains');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(savedQuery).toBeVisible();
  await editor.fill('SELECT COUNT(*) FROM domain');
  await savedQuery.click();
  await expect(editor).toHaveValue(SQL);
  await expect(page.getByRole('status').filter({ hasText: /^Ready on testnet$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);

  await page.getByLabel('Data Contract', { exact: true }).selectOption(DASHPAY);
  await expect(savedQuery).toHaveCount(0);
  await page.getByLabel('Data Contract', { exact: true }).selectOption(DPNS);
  await expect(savedQuery).toBeVisible();
  await page.getByRole('button', { name: 'Testnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(page.getByText('Saved queries for mainnet and the selected contract')).toBeVisible();
  await expect(savedQuery).toHaveCount(0);
  await name.fill('Mainnet domains');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await page.getByRole('button', { name: 'Clear saved queries for this contract' }).click();
  await expect(page.getByRole('button', { name: 'Mainnet domains', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Mainnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Testnet', exact: true }).click();
  await expect(savedQuery).toBeVisible();
  await page.reload();
  await expect(savedQuery).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved query My domains' }).click();
  await expect(savedQuery).toHaveCount(0);
  await page.reload();
  await expect(savedQuery).toHaveCount(0);
});

test('copied query links reproduce SQL, contract and network on the deployed route', async ({ page, context }) => {
  await openOfflineWorkspace(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sql = "SELECT * FROM domain WHERE normalizedLabel == 'private filter' LIMIT 1";
  await page.getByLabel('SQL Query').fill(sql);
  await page.getByLabel('Data Contract', { exact: true }).selectOption(DASHPAY);
  await page.getByRole('button', { name: 'Copy query link' }).click();
  await expect(page.getByText('Query link copied', { exact: true })).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.pathname).toBe(new URL(page.url()).pathname);
  expect(link.searchParams.get('q')).toBe(sql);
  expect(link.searchParams.get('contract')).toBe(DASHPAY);
  expect(link.searchParams.get('network')).toBe('testnet');
  await page.goto(link.toString());
  await expect(page.getByLabel('SQL Query')).toHaveValue(sql);
  await expect(page.getByLabel('Data Contract', { exact: true })).toHaveValue(DASHPAY);
  await expect(page.getByRole('button', { name: 'Testnet', exact: true })).toBeVisible();
});

test('unsupported SQL is rejected before issuing a document request', async ({ page }) => {
  await openOfflineWorkspace(page);
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/getDocuments')) documentRequests++;
  });
  await page.getByLabel('SQL Query').fill('SELECT label FROM domain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/Unsupported SELECT expression\. Use SELECT/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  expect(documentRequests).toBe(0);
  await page.getByLabel('SQL Query').fill('SELECT * FROM domain OFFSET 1');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/Unsupported SQL clause 'OFFSET'/)).toBeVisible();
  expect(documentRequests).toBe(0);
});

test('an unchanged SQL run can be cancelled and started again during an endpoint outage', async ({ page }) => {
  // Hold real DAPI requests, including the contract lookup required by the
  // installed SDK before document retrieval. Fail them after cancellation.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  let failures = 0;
  await openOfflineWorkspace(page, async (route) => {
    requests++;
    await held;
    await route.abort('failed');
    failures++;
  });
  const backgroundRequests = requests;
  await page.getByLabel('SQL Query').fill(SQL);
  const editor = await page.getByLabel('SQL Query').elementHandle();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel run' })).toBeVisible();
  await expect.poll(() => requests).toBeGreaterThan(backgroundRequests);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(await editor!.evaluate((element) => element.isConnected)).toBe(true);
  const firstRunRequests = requests;
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Cancelled\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(firstRunRequests);
  await expect(page.getByRole('button', { name: 'Cancel run' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  const requestsBeforeRelease = requests;
  release();
  await expect.poll(() => failures).toBeGreaterThanOrEqual(requestsBeforeRelease);
  await expect(page.getByRole('status').filter({ hasText: /^Cancelled\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
});
