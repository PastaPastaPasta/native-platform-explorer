import { test, expect, type Page } from '@playwright/test';
import { routeOffline } from './quorum-fixtures';

// These use the production export and actual SDK bootstrap. They do not
// inject signers, replace cryptography, or submit state transitions: DAPI is
// unreachable offline. Review approval and uncertain submission outcomes are
// covered in the focused OperationShell/executor tests, where writes can be
// controlled safely.

/** A signed IdentityCreditTransfer built offline with a throwaway key (never broadcast). */
const SIGNED_TRANSITION =
  '07007199f1f68404c86ecf60d9cb93ac2bdd02c0109cdbfeb759142b8ab9135f4b198bf296f9b006c8743b45ecb55d0e253f39d1c23e8865724f865dc3f7d5804b09fc000f424007000341202733b5fde2725f9d7b49618bc475aafb2d844d695793bfecbfbd44dcd672ef66542a44d2e3855f9ae3fa332cbaf9ea7d4227862db14db9df1028117e22a70786';
const SIGNED_HASH = 'ea089b7d50ec73f1a44d53d62f85e63225edd2ea061521c27f8fa7902ea8e432';

/** Wait for the trusted SDK session; reaching it resets a draft once. */
async function waitForSdk(page: Page) {
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByText('Wait for the SDK connection before reviewing.')).toHaveCount(0, {
    timeout: 20_000,
  });
}

test('the picker marks operations that take their keys in the form', async ({ page }) => {
  await page.goto('broadcast/?network=testnet');
  await expect(page.getByRole('heading', { name: 'Platform addresses', exact: true })).toBeVisible();
  const row = (label: string) =>
    page.getByRole('button').filter({ has: page.getByText(label, { exact: true }) });
  for (const label of [
    'Send between addresses',
    'Withdraw from an address',
    'Create an identity',
    'Cast a masternode vote',
    'Broadcast a signed state transition',
  ])
    await expect(row(label).getByText('Keys in form', { exact: true })).toBeVisible();
  await expect(
    row('Fund addresses from your identity').getByText('Keys in form', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(0);
});

test('form-signed writes open without a connected signer', async ({ page }) => {
  await routeOffline(page);
  for (const operation of ['addresses.transfer', 'voting.castVote', 'stateTransitions.broadcast']) {
    await page.goto(`broadcast/?network=testnet&op=${operation}`);
    await waitForSdk(page);
    await expect(page.getByText('No signer connected', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled();
  }
  // Funding addresses from an identity signs with the connected transfer key.
  await page.goto('broadcast/?network=testnet&op=addresses.transferFromIdentity');
  await expect(page.getByText('No signer connected', { exact: true })).toBeVisible();
});

test('raw broadcast decodes the pasted transition locally before review', async ({ page }) => {
  await routeOffline(page);
  await page.goto('broadcast/?network=testnet&op=stateTransitions.broadcast');
  await waitForSdk(page);
  const field = page.getByRole('textbox', {
    name: 'Signed state transition (hex or base64)',
    exact: true,
  });
  await field.fill('not a transition');
  await expect(page.getByText('Expected hex or base64.', { exact: true })).toBeVisible();
  await field.fill(SIGNED_TRANSITION);
  await expect(page.getByText(`"hash": "${SIGNED_HASH}"`)).toBeVisible();
  await expect(page.getByText('"type": "IdentityCreditTransfer"')).toBeVisible();
  await expect(page.getByText('"signaturePublicKeyId": 3')).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(
    page.getByText(
      `Broadcast the IdentityCreditTransfer transition ${SIGNED_HASH} owned by 8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText('Keys: entered in the form', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign + broadcast', exact: true })).toBeEnabled();
});

test('a contest link fills in the masternode vote', async ({ page }) => {
  await routeOffline(page);
  const contract = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
  const params = new URLSearchParams({
    network: 'testnet',
    op: 'voting.castVote',
    contract,
    docType: 'domain',
    indexName: 'parentNameAndLabel',
    indexValues: JSON.stringify(['dash', 'abc']),
  });
  await page.goto(`broadcast/?${params.toString()}`);
  await waitForSdk(page);
  await expect(page.getByRole('textbox', { name: 'Contract ID', exact: true })).toHaveValue(contract);
  await expect(page.getByRole('textbox', { name: 'Document type', exact: true })).toHaveValue('domain');
  await expect(page.getByRole('textbox', { name: 'Index values (JSON array)', exact: true })).toHaveValue(
    '["dash","abc"]',
  );
  const votingKey = page.getByLabel('Voting key (WIF)', { exact: true });
  await expect(votingKey).toHaveCSS('-webkit-text-security', 'disc');
});

test('top-up recommends the bridge without a signer and resets after a network switch', async ({
  page,
}) => {
  await routeOffline(page);
  await page.goto('broadcast/?network=testnet&op=identity.topUp');
  await waitForSdk(page);
  await expect(page.getByRole('link', { name: 'Open bridge →', exact: true })).toBeVisible();
  const identity = page.getByRole('textbox', { name: 'Identity', exact: true });
  await expect(identity).toHaveValue('');
  await identity.fill('A'.repeat(43));
  await expect(identity).toHaveValue('A'.repeat(43));
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Testnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mainnet', exact: true }).click();
  await expect(page).toHaveURL(/network=mainnet/);
  await expect(identity).toHaveValue('');
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
