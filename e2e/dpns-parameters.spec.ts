import { test, expect } from '@playwright/test';

for (const name of ['%', '%41', 'alice.dash']) {
  test(`DPNS detail preserves the decoded name ${JSON.stringify(name)}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // This checks URL parsing and rendering without requiring DAPI availability.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort('failed'));
    await page.goto(`dpns/?name=${encodeURIComponent(name)}&network=testnet`);
    const normalized = name.endsWith('.dash') ? name : `${name}.dash`;
    await expect(page.getByRole('heading', { name: normalized, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Something went wrong.' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
