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

async function saveQuery(page: Page, name: string, sql = SQL) {
  await page.getByLabel('SQL Query').fill(sql);
  await page.getByLabel('Query name').fill(name);
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

async function persistedQueries(page: Page) {
  return page.evaluate((contractId) => {
    const key = `npe:savedQueries:v1:testnet:${encodeURIComponent(contractId)}`;
    return JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ name: string; sql: string }>;
  }, DPNS);
}

async function delaySavedQueryEvents(page: Page) {
  // Model a tab acting before queued native storage events reach its listener.
  // Storage writes and reads remain real; no event or successful SDK reply is fabricated.
  // Register before navigation so suppression precedes the application's listener.
  await page.addInitScript(() => {
    const probe = window as Window & { delayedSavedQueryEvents?: number };
    probe.delayedSavedQueryEvents = 0;
    window.addEventListener('storage', (event) => {
      if (
        event.storageArea === localStorage &&
        (event.key === null || event.key.startsWith('npe:savedQueries:'))
      ) {
        probe.delayedSavedQueryEvents!++;
        event.stopImmediatePropagation();
      }
    }, { capture: true });
  });
}

async function delayedSavedQueryEventCount(page: Page) {
  return page.evaluate(() =>
    (window as Window & { delayedSavedQueryEvents?: number }).delayedSavedQueryEvents ?? 0,
  );
}

test('two tabs propagate saved-query changes without replacing drafts or crossing scopes', async ({ page, context }) => {
  const peer = await context.newPage();
  let documentRequests = 0;
  context.on('request', (request) => {
    if (request.url().includes('/getDocuments')) documentRequests++;
  });
  await openOfflineWorkspace(page);
  await openOfflineWorkspace(peer);
  const draft = "SELECT * FROM domain WHERE label == 'unfinished filter' LIMIT 1";
  await page.getByLabel('SQL Query').fill(draft);
  await page.getByLabel('Query name').fill('Unfinished query name');

  await saveQuery(peer, 'Peer domains');
  await expect(page.getByRole('button', { name: 'Peer domains', exact: true })).toBeVisible();
  await expect(page.getByLabel('SQL Query')).toHaveValue(draft);
  await expect(page.getByLabel('Query name')).toHaveValue('Unfinished query name');
  await peer.getByRole('button', { name: 'Delete saved query Peer domains' }).click();
  await expect(page.getByRole('button', { name: 'Peer domains', exact: true })).toHaveCount(0);
  await saveQuery(peer, 'Clear from peer');
  await expect(page.getByRole('button', { name: 'Clear from peer', exact: true })).toBeVisible();
  await peer.getByRole('button', { name: 'Clear saved queries for this contract' }).click();
  await expect(page.getByRole('button', { name: 'Clear from peer', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('SQL Query')).toHaveValue(draft);
  await expect(page.getByLabel('Query name')).toHaveValue('Unfinished query name');

  await peer.getByLabel('Data Contract', { exact: true }).selectOption(DASHPAY);
  await saveQuery(peer, 'Different contract');
  await expect(page.getByRole('button', { name: 'Different contract', exact: true })).toHaveCount(0);
  await page.getByLabel('Data Contract', { exact: true }).selectOption(DASHPAY);
  await expect(page.getByRole('button', { name: 'Different contract', exact: true })).toBeVisible();
  await peer.getByRole('button', { name: 'Testnet', exact: true }).click();
  await peer.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(peer.getByText('Saved queries for mainnet and the selected contract')).toBeVisible();
  await saveQuery(peer, 'Different network');
  await expect(page.getByRole('button', { name: 'Different network', exact: true })).toHaveCount(0);
  await peer.getByRole('button', { name: 'Clear saved queries for this contract' }).click();
  await expect(page.getByRole('button', { name: 'Different contract', exact: true })).toBeVisible();
  await page.getByLabel('Data Contract', { exact: true }).selectOption(DPNS);
  await expect(page.getByRole('button', { name: 'Different contract', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('SQL Query')).toHaveValue(draft);

  for (const tab of [page, peer]) {
    expect(new URL(tab.url()).searchParams.has('q')).toBe(false);
    await expect(tab.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
    await expect(tab.getByRole('button', { name: 'Export JSON' })).toHaveCount(0);
  }
  expect(documentRequests).toBe(0);
  await peer.close();
});

test('a stale tab saves against fresh persisted peers before storage-event delivery', async ({ page, context }, testInfo) => {
  const peer = await context.newPage();
  await openOfflineWorkspace(page);
  await delaySavedQueryEvents(peer);
  await openOfflineWorkspace(peer);
  await peer.getByLabel('SQL Query').fill(SQL);
  await peer.getByLabel('Query name').fill('Second tab query');
  await saveQuery(page, 'First tab query');
  await expect.poll(() => delayedSavedQueryEventCount(peer)).toBeGreaterThan(0);
  await expect(peer.getByRole('button', { name: 'First tab query', exact: true })).toHaveCount(0);
  await peer.getByRole('button', { name: 'Save query', exact: true }).click();
  const saved = await persistedQueries(page);
  await testInfo.attach('shared-storage-after-stale-save', {
    body: JSON.stringify(saved, null, 2), contentType: 'application/json',
  });
  expect(saved).toEqual([
    { name: 'First tab query', sql: SQL },
    { name: 'Second tab query', sql: SQL },
  ]);
  await expect(page.getByRole('button', { name: 'Second tab query', exact: true })).toBeVisible();
  await expect(peer.getByRole('button', { name: 'First tab query', exact: true })).toBeVisible();
  await peer.close();
});

test('stale-tab delete and save do not resurrect queries removed or cleared by a peer', async ({ page, context }, testInfo) => {
  await openOfflineWorkspace(page);
  await saveQuery(page, 'Remove first');
  await saveQuery(page, 'Remove second');
  const peer = await context.newPage();
  await delaySavedQueryEvents(peer);
  await openOfflineWorkspace(peer);
  await expect(peer.getByRole('button', { name: 'Remove first', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved query Remove first' }).click();
  await expect.poll(() => delayedSavedQueryEventCount(peer)).toBeGreaterThan(0);
  await expect(peer.getByRole('button', { name: 'Remove first', exact: true })).toBeVisible();
  await peer.getByRole('button', { name: 'Delete saved query Remove second' }).click();
  const afterDelete = await persistedQueries(page);
  await testInfo.attach('shared-storage-after-stale-delete', {
    body: JSON.stringify(afterDelete, null, 2), contentType: 'application/json',
  });
  expect(afterDelete).toEqual([]);
  await expect(page.getByRole('button', { name: 'Remove second', exact: true })).toHaveCount(0);

  await saveQuery(peer, 'Before clear');
  await expect(page.getByRole('button', { name: 'Before clear', exact: true })).toBeVisible();
  const eventsBeforeClear = await delayedSavedQueryEventCount(peer);
  await page.getByRole('button', { name: 'Clear saved queries for this contract' }).click();
  await expect.poll(() => delayedSavedQueryEventCount(peer)).toBeGreaterThan(eventsBeforeClear);
  await expect(peer.getByRole('button', { name: 'Before clear', exact: true })).toBeVisible();
  await saveQuery(peer, 'After clear');
  expect(await persistedQueries(page)).toEqual([{ name: 'After clear', sql: SQL }]);
  await expect(page.getByRole('button', { name: 'After clear', exact: true })).toBeVisible();
  await expect(peer.getByRole('button', { name: 'Before clear', exact: true })).toHaveCount(0);
  await peer.close();
});

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
