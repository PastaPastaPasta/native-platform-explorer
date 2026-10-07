import { test, expect, type Page } from '@playwright/test';

// These tests use the ordinary production export and real SDK. Blocking
// external HTTP deliberately exercises an unavailable connection; it supplies
// neither SDK response fixtures nor successful cryptographic verification.
test.beforeEach(async ({ page, baseURL }) => {
  // Choose ordinary user preferences, independent of deployment defaults.
  // Leave capture preferences untouched so the reload test checks persistence.
  await page.addInitScript(() => {
    localStorage.setItem('npe:network', 'testnet');
    localStorage.setItem('npe:trusted', 'true');
  });
  const localOrigin = new URL(baseURL!).origin;
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === localOrigin) return route.continue();
    return route.abort('failed');
  });
});

async function openDuringConnectionOutage(page: Page, path: string) {
  await page.goto(path);
  // The real provider's connection error confirms hydration and handler setup.
  await expect(page.getByRole('alert')).toBeVisible();
}

test('empty inspector explains provenance and disables evidence actions', async ({ page }) => {
  await openDuringConnectionOutage(page, 'about/');
  const open = page.getByRole('button', { name: 'Open Query Inspector', exact: true });
  const openBounds = await open.boundingBox();
  expect(openBounds?.height).toBeGreaterThanOrEqual(44);
  expect(openBounds?.width).toBeGreaterThanOrEqual(44);
  await open.click();
  const drawer = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('0 SDK verified · 0 proofs captured')).toBeVisible();
  await expect(drawer.getByText(/No queries captured yet/)).toBeVisible();
  await expect(drawer.getByText(/browser does not independently validate Dash Core consensus/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Export all evidence JSON' })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: 'Copy all evidence JSON' })).toBeDisabled();

  for (const control of [drawer.getByRole('button', { name: 'Close query inspector' }), drawer.getByRole('button', { name: 'Clear', exact: true })]) {
    const bounds = await control.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await drawer.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(drawer.getByText(/No queries captured yet/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Close query inspector' }).click();
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();
});

test('keyboard shortcut opens and closes a focused, labeled inspector', async ({ page }) => {
  await openDuringConnectionOutage(page, 'about/');
  const open = page.getByRole('button', { name: 'Open Query Inspector', exact: true });
  await open.focus();
  await page.keyboard.press('Control+Shift+P');
  const drawer = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
  const close = drawer.getByRole('button', { name: 'Close query inspector' });
  await expect(drawer).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();

  await page.keyboard.press('Control+Shift+P');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  await expect(drawer).toBeHidden();
});

test('inspector shortcut leaves an editable query input alone', async ({ page }) => {
  await openDuringConnectionOutage(page, 'network/credits/');
  const input = page.getByPlaceholder('Identity ID', { exact: true });
  await input.fill('unsent identity lookup');
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Query Inspector', exact: true })).toBeHidden();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('unsent identity lookup');

  await page.getByRole('button', { name: 'Open Query Inspector', exact: true }).focus();
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Query Inspector', exact: true })).toBeVisible();
});

test('capture preference works by keyboard and remains disabled after reload', async ({ page }) => {
  await openDuringConnectionOutage(page, 'settings/');
  await expect(page.getByText(/^SDK status: (connecting|ready|error)$/)).toBeVisible();
  const capture = page.getByRole('heading', { name: 'Query Inspector', exact: true })
    .locator('..').getByRole('checkbox');
  await expect(capture).toBeChecked();
  await capture.focus();
  await page.keyboard.press('Space');
  await expect(capture).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:queryInspector'))).toBe('false');
  await expect(page.getByRole('button', { name: 'Open Query Inspector', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).focus();
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Query Inspector', exact: true })).toBeHidden();

  await page.reload();
  await expect(capture).not.toBeChecked();
  await capture.focus();
  await page.keyboard.press('Space');
  await expect(capture).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:queryInspector'))).toBe('true');
  await page.getByRole('button', { name: 'Open Query Inspector', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Query Inspector', exact: true })).toBeVisible();
});

test('a real SDK connection outage can be retried while the inspector stays usable', async ({ page }) => {
  let quorumRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).hostname.startsWith('quorums.')) quorumRequests++;
  });
  await openDuringConnectionOutage(page, 'settings/');
  const sdkStatus = page.getByText(/^SDK status: (connecting|ready|error)$/);
  await expect(sdkStatus).toHaveText('SDK status: error');
  const connectionAlert = page.getByRole('alert').filter({ hasText: 'Failed to prefetch quorums' });
  await expect(connectionAlert).toBeVisible();
  await expect(connectionAlert).not.toContainText('[object Object]');
  await expect.poll(() => quorumRequests).toBeGreaterThan(0);
  const beforeRetry = quorumRequests;
  // Capture even a brief visible transition, so old SDK background traffic
  // cannot make this pass if the user's reconnect action does nothing.
  const transitions = await sdkStatus.evaluateHandle((node) => {
    const states: string[] = [];
    const observer = new MutationObserver(() => states.push(node.textContent ?? ''));
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return { states, observer };
  });
  try {
    await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
    await expect.poll(() => transitions.evaluate(({ states }) => states)).toContain('SDK status: connecting');
    await expect.poll(() => quorumRequests).toBeGreaterThan(beforeRetry);
    await expect(sdkStatus).toHaveText('SDK status: error');
  } finally {
    await transitions.evaluate(({ observer }) => observer.disconnect());
    await transitions.dispose();
  }

  await page.getByRole('button', { name: 'Open Query Inspector', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/Current SDK: testnet · trusted · error/)).toBeVisible();
  await expect(drawer.getByText('0 SDK verified · 0 proofs captured')).toBeVisible();
});
