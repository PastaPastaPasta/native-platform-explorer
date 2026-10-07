import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const identityId = '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr';
const backup = {
  network: 'testnet',
  identityId,
  identityKeys: [{ id: 0, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', privateKeyWif: 'invalid-test-WIF' }],
};

test.beforeEach(async ({ page }) => {
  // Non-trusted mode initializes the actual WASM SDK locally. Every import
  // below fails on deliberately invalid credentials before an identity query.
  await page.addInitScript(() => {
    window.localStorage.setItem('npe:network', 'testnet');
    window.localStorage.setItem('npe:trusted', 'false');
  });
});

test('wallet explains unsupported extension signing and dismisses reconnect hints', async ({ page }) => {
  await page.addInitScript((id) => {
    window.sessionStorage.setItem('npe:signer-kind', JSON.stringify({ kind: 'wif', identityId: id }));
  }, identityId);
  await page.goto('wallet/');
  await expect(page.getByText(/You were previously connected via/)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByText(/You were previously connected via/)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('npe:signer-kind'))).toBeNull();
  await page.getByRole('tab', { name: 'Extension', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Extension signing is unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect extension', exact: true })).toHaveCount(0);
});

test('invalid WIF and mnemonic attempts show errors and clear credential fields', async ({ page }) => {
  await page.goto('wallet/');
  await page.getByRole('tab', { name: 'WIF', exact: true }).click();
  await page.getByRole('textbox', { name: 'Identity ID', exact: true }).fill(identityId);
  const wifInput = page.getByLabel('WIF private key', { exact: true });
  await wifInput.fill('invalid-test-WIF');
  const connectWif = page.getByRole('button', { name: 'Connect WIF', exact: true });
  await expect(connectWif).toBeEnabled({ timeout: 20_000 });
  await connectWif.click();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeVisible();
  await expect(page.getByText(/Invalid WIF: key base58 error/)).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toContainText('[object Object]');
  await expect(wifInput).toHaveValue('');
  await expect(connectWif).toBeDisabled();

  await page.getByRole('tab', { name: 'Mnemonic', exact: true }).click();
  await page.getByRole('textbox', { name: 'Identity ID', exact: true }).fill(identityId);
  const mnemonicInput = page.getByRole('textbox', { name: 'Mnemonic', exact: true });
  await mnemonicInput.fill(Array(12).fill('invalid-test-word').join(' '));
  const connectMnemonic = page.getByRole('button', { name: 'Connect mnemonic', exact: true });
  await expect(connectMnemonic).toBeEnabled();
  await connectMnemonic.click();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeVisible();
  await expect(page.getByText('That BIP-39 mnemonic is not valid.', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toContainText('[object Object]');
  await expect(mnemonicInput).toHaveValue('');
  await expect(connectMnemonic).toBeDisabled();
});

test('bridge backup previews can be discarded, mismatched networks are blocked, and failed imports clear drafts', async ({ page }) => {
  await page.goto('wallet/');
  const input = page.getByRole('textbox', { name: 'Bridge backup JSON', exact: true });
  await input.fill(JSON.stringify(backup));
  await input.blur();
  const useIdentity = page.getByRole('button', { name: 'Use this identity', exact: true });
  await expect(useIdentity).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(useIdentity).toHaveCount(0);

  await input.fill(JSON.stringify({ ...backup, network: 'mainnet' }));
  await input.blur();
  await expect(page.getByText('Network mismatch', { exact: true })).toBeVisible();
  await expect(useIdentity).toBeDisabled();

  await input.fill(JSON.stringify(backup));
  await input.blur();
  await expect(useIdentity).toBeEnabled();
  await useIdentity.click();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeVisible();
  await expect(page.getByText(/Invalid WIF: key base58 error/)).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(useIdentity).toHaveCount(0);
});

test('bridge file import supports keyboard activation and clears the selected file after failure', async ({ page }) => {
  await page.goto('wallet/');
  await page.getByRole('button', { name: /Drop backup JSON here/ }).focus();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);
  await chooser.setFiles({
    name: 'invalid-test-credentials.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const useIdentity = page.getByRole('button', { name: 'Use this identity', exact: true });
  await expect(useIdentity).toBeEnabled({ timeout: 20_000 });
  await useIdentity.click();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeVisible();
  await expect(page.getByText(/Invalid WIF: key base58 error/)).toBeVisible();
  await expect(page.getByLabel('Bridge backup file', { exact: true })).toHaveValue('');
  await expect(useIdentity).toHaveCount(0);
});
