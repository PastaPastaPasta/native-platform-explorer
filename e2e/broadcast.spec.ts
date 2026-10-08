import { test, expect } from '@playwright/test';

// These use the production export and actual SDK bootstrap. They do not
// inject signers, replace cryptography, or submit state transitions. Review
// approval and uncertain submission outcomes are covered in the focused
// OperationShell/executor tests, where writes can be controlled safely.
test('unsupported writes are identified before signer connection or review', async ({ page }) => {
  for (const operation of ['stateTransitions.broadcast', 'voting.castVote']) {
    await page.goto(`broadcast/?network=testnet&op=${operation}`);
    await expect(page.getByText('Unsupported', { exact: true })).toBeVisible();
    await expect(page.getByText('No signer connected', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign + broadcast', exact: true })).toHaveCount(
      0,
    );
  }
});

test('top-up accepts an identity without a signer and resets it after a network switch', async ({
  page,
}) => {
  // Settle the real SDK session before editing. A later SDK/session change
  // correctly resets the draft, independently of the network-switch check.
  await page.addInitScript(() => localStorage.setItem('npe:trusted', 'false'));
  await page.route(/^https?:\/\//, (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === '127.0.0.1' || hostname === 'localhost'
      ? route.continue()
      : route.abort('failed');
  });
  await page.goto('broadcast/?network=testnet&op=identity.topUp');
  await page.locator('footer').getByRole('button').click();
  const inspector = page.getByRole('dialog', { name: 'Query Inspector', exact: true });
  await expect(inspector.getByText('Current SDK: testnet · untrusted · ready', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Close query inspector' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:network'))).toBe('testnet');
  await expect(page.getByText('External bridge', { exact: true })).toBeVisible();
  const identity = page.getByRole('textbox', { name: 'Identity', exact: true });
  await expect(identity).toHaveValue('');
  await identity.fill('A'.repeat(43));
  await expect(identity).toHaveValue('A'.repeat(43));
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign + broadcast', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Testnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(page).toHaveURL(/network=mainnet/);
  await expect(identity).toHaveValue('');
  await expect(page.getByText('External bridge', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('op')).toBe('identity.topUp');
});

test('available writes direct disconnected users to their signer before showing a form', async ({
  page,
}) => {
  await page.goto('broadcast/?network=testnet&op=identity.creditTransfer');
  await expect(page.getByText('No signer connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '/wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'WIF', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Identity ID', exact: true })).toBeVisible();
  // Malformed identities are blocked locally without invoking the SDK or
  // making a private-key import look successfully connected.
  await page.getByRole('textbox', { name: 'Identity ID', exact: true }).fill('not-an-identity');
  await page.getByLabel('WIF private key', { exact: true }).fill('not-a-private-key');
  await expect(page.getByRole('button', { name: 'Connect WIF', exact: true })).toBeDisabled();
});
