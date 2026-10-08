import { expect, test } from '@playwright/test';

test('wallet bridge uses the selected network without sending keys or an unsupported action', async ({
  page,
}) => {
  await page.goto('wallet/?network=mainnet');
  const bridge = page.getByRole('link', { name: 'Create new identity →', exact: true });
  await expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=mainnet');
  await expect(bridge).toHaveAttribute('target', '_blank');
  await expect(bridge).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByText('Bridge link not configured', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Mainnet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Testnet', exact: true }).click();
  await expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=testnet');
});

test('top-up handoff explains manual entry and does not promise an automatic balance refresh', async ({
  page,
}) => {
  await page.goto('broadcast/?network=testnet&op=identity.topUp');
  const bridge = page.getByRole('link', { name: 'Open bridge →', exact: true });
  await expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=testnet');
  await expect(page.getByText(/choose Manage Identity, then Top Up Identity/)).toBeVisible();
  await expect(page.getByText(/balance will refresh automatically/)).toHaveCount(0);
});
