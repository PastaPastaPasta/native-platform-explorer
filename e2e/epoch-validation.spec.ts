import { test, expect } from '@playwright/test';

test('epoch detail rejects missing, fractional, and reserved epoch indexes', async ({ page }) => {
  for (const index of ['', '42.5', '65280']) {
    await page.goto(`epoch/detail/?index=${index}&network=mainnet`);
    await expect(page.getByText('Provide a whole epoch index from 0 to 65279 as')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Epoch #/ })).toHaveCount(0);
  }
});

test('epoch history explains range limits and recovers when the range is corrected', async ({ page }) => {
  await page.goto('epoch/history/?network=mainnet');
  // Wait for preference hydration so these inputs have their React handlers.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('npe:network'))).toBe('mainnet');
  const from = page.getByRole('textbox', { name: 'Start epoch' });
  const to = page.getByRole('textbox', { name: 'End epoch' });
  await from.fill('0');
  await to.fill('200');
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a range' })).toHaveText('Choose a range of at most 200 epochs.');

  await to.fill('100');
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a range' })).toHaveCount(0);
  await from.fill('101');
  await expect(page.getByRole('alert').filter({ hasText: 'Start epoch' })).toHaveText('Start epoch must be less than or equal to the end epoch.');
  await from.fill('0.5');
  await expect(page.getByRole('alert').filter({ hasText: 'whole numbers' })).toHaveText('Epoch indexes must be whole numbers from 0 to 65279.');
});
