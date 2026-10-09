import { test, expect, type Page } from '@playwright/test';

const INSPECTOR_OPEN_NAME = /^\d+ quer(?:y|ies) — Open Query Inspector$/;

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
  await expect(page.getByRole('alert').filter({ hasText: 'Failed to prefetch quorums' })).toBeVisible();
}

test('empty inspector explains provenance and disables evidence actions', async ({ page }) => {
  await openDuringConnectionOutage(page, 'about/');
  const open = page.getByRole('button', { name: INSPECTOR_OPEN_NAME });
  await expect(open).toHaveText('0 queries');
  await expect(open).toHaveAccessibleName('0 queries — Open Query Inspector');
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
  const open = page.getByRole('button', { name: INSPECTOR_OPEN_NAME });
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

  await page.getByRole('button', { name: INSPECTOR_OPEN_NAME }).focus();
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
  await expect(page.getByRole('button', { name: INSPECTOR_OPEN_NAME })).toBeHidden();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).focus();
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Query Inspector', exact: true })).toBeHidden();

  await page.reload();
  await expect(capture).not.toBeChecked();
  await capture.focus();
  await page.keyboard.press('Space');
  await expect(capture).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:queryInspector'))).toBe('true');
  await page.getByRole('button', { name: INSPECTOR_OPEN_NAME }).click();
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

  await page.getByRole('button', { name: INSPECTOR_OPEN_NAME }).click();
  const drawer = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/Current SDK: testnet · trusted · error/)).toBeVisible();
  await expect(drawer.getByText('0 SDK verified · 0 proofs captured')).toBeVisible();
});

test('inspector name includes its visible zero, singular, and plural query counts', async ({ page, baseURL }) => {
  await openDuringConnectionOutage(page, 'settings/');
  const open = page.locator('footer').getByRole('button');
  await expect(open).toHaveText('0 queries');
  await expect(open).toHaveAccessibleName('0 queries — Open Query Inspector');

  // Ordinary mode constructs the real SDK without the failed quorum prefetch.
  // Fail one actual SDK request path first, then the others. No successful
  // responses or cryptographic outcomes are supplied by this test.
  await page.unroute('**/*');
  const localOrigin = new URL(baseURL!).origin;
  let firstPath: string | undefined;
  let releaseOthers!: () => void;
  const othersReleased = new Promise<void>((resolve) => { releaseOthers = resolve; });
  let holdDapiCompletions = false;
  let releaseCompletions!: () => void;
  const completionsReleased = new Promise<void>((resolve) => { releaseCompletions = resolve; });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin) return route.continue();
    if (!url.pathname.includes('/org.dash.platform.dapi.v0.Platform/')) return route.abort('failed');
    firstPath ??= url.pathname;
    if (url.pathname !== firstPath) await othersReleased;
    if (holdDapiCompletions) await completionsReleased;
    await route.abort('failed');
  });
  try {
    page.once('dialog', (dialog) => { void dialog.accept(); });
    await page.getByRole('heading', { name: 'Trusted mode', exact: true })
      .locator('..').getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(page.getByText('SDK status: ready', { exact: true })).toBeVisible();
    await expect(open).toHaveText('1 query', { timeout: 15_000 });
    await expect(open).toHaveAccessibleName('1 query — Open Query Inspector');

    releaseOthers();
    await expect(open).toHaveText('3 queries', { timeout: 15_000 });
    await expect(open).toHaveAccessibleName('3 queries — Open Query Inspector');
    // Capture remains on. Hold subsequent real retry failures while checking
    // Clear: completed new queries would correctly repopulate the inspector.
    holdDapiCompletions = true;
    await expect(page.getByRole('heading', { name: 'Query Inspector', exact: true })
      .locator('..').getByRole('checkbox')).toBeChecked();
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('0 SDK verified · 0 proofs captured')).toBeVisible();
    await drawer.getByRole('button', { name: 'Clear', exact: true }).click();
    await drawer.getByRole('button', { name: 'Close query inspector' }).click();
    await expect(open).toHaveText('0 queries');
    await expect(open).toHaveAccessibleName('0 queries — Open Query Inspector');
    await expect(open).toBeFocused();
  } finally {
    releaseOthers();
    releaseCompletions();
  }
});
