import { test, expect } from '@playwright/test';

test('diagnostics shortcut is on by default and follows Settings changes across reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort('failed'));
  await page.goto('settings/?network=testnet');
  await expect(page.getByText('SDK status: error', { exact: true })).toBeVisible();
  const preference = page.getByRole('checkbox', { name: 'Diagnostics log', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Diagnostics', exact: true });
  const shortcut = async () => {
    await page.getByRole('button', { name: 'Reconnect', exact: true }).focus();
    await page.keyboard.press('Control+/');
  };
  await expect(preference).toBeChecked();
  await shortcut();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await preference.focus();
  await page.keyboard.press('Space');
  await expect(preference).not.toBeChecked();
  await shortcut();
  await expect(drawer).toBeHidden();
  await page.reload();
  await expect(page.getByText('SDK status: error', { exact: true })).toBeVisible();
  await expect(preference).not.toBeChecked();
  await shortcut();
  await expect(drawer).toBeHidden();
  expect(errors).toEqual([]);
});
