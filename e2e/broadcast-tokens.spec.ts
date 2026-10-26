import { test, expect } from '@playwright/test';
import { routeOffline } from './quorum-fixtures';

// Offline: the production export and SDK bootstrap with recorded quorum
// fixtures, no DAPI. These cover the token operation picker and gating; the
// executors and forms are covered by unit tests and the live testnet run.
const TOKEN_OPERATIONS = [
  ['token.mint', 'Mint tokens'],
  ['token.burn', 'Burn tokens'],
  ['token.transfer', 'Transfer tokens'],
  ['token.freeze', 'Freeze a balance'],
  ['token.unfreeze', 'Unfreeze a balance'],
  ['token.destroyFrozen', 'Destroy frozen funds'],
  ['token.emergencyAction', 'Pause or resume'],
  ['token.setPrice', 'Set the direct-purchase price'],
  ['token.directPurchase', 'Buy tokens directly'],
  ['token.claim', 'Claim a distribution'],
  ['token.configUpdate', 'Update token configuration'],
] as const;

test('the console lists every token write as signable here', async ({ page }) => {
  await routeOffline(page);
  await page.goto('broadcast/?network=testnet');
  await expect(page.getByRole('heading', { name: 'Tokens', exact: true })).toBeVisible();
  await expect(page.getByText('Mint, burn, transfer, freeze, price, buy, claim, and configure tokens.')).toBeVisible();
  for (const [, label] of TOKEN_OPERATIONS) {
    const card = page.getByRole('button', { name: new RegExp(`^${label}`) });
    await expect(card).toBeVisible();
    // Token writes sign here: no Bridge or Unavailable marker.
    await expect(card.getByText(/^(Bridge|Unavailable)$/)).toHaveCount(0);
  }
});

test('picking a token write keeps the token link and asks for a signer first', async ({ page }) => {
  await routeOffline(page);
  await page.goto('broadcast/?network=testnet&token=5DunBnakFSFb2y6rSxRvP73xqVNYTDT6fceqzLSL4Ej4');
  await page.getByRole('button', { name: /^Burn tokens/ }).click();
  await expect(page).toHaveURL(/op=token\.burn/);
  expect(new URL(page.url()).searchParams.get('token')).toBe('5DunBnakFSFb2y6rSxRvP73xqVNYTDT6fceqzLSL4Ej4');
  await expect(page.getByText('No signer connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign + broadcast', exact: true })).toHaveCount(0);
});

test('every token write is gated on a signer before any form or review', async ({ page }) => {
  await routeOffline(page);
  for (const [op] of TOKEN_OPERATIONS) {
    await page.goto(`broadcast/?network=testnet&op=${op}`);
    await expect(page.getByText('No signer connected', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Token ID', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  }
});
