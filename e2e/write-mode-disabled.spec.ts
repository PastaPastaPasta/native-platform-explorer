import { test as base, expect } from '@playwright/test';
import { routeOffline } from './quorum-fixtures';

// Runs only against an export built with NEXT_PUBLIC_DISABLE_WRITE_MODE=true;
// CI builds once with write mode on, so it skips there. To run it:
//   NEXT_PUBLIC_DISABLE_WRITE_MODE=true NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org pnpm build
//   NPE_EXPECT_WRITE_MODE_DISABLED=1 pnpm e2e e2e/write-mode-disabled.spec.ts
// The unit tests in src/components/broadcast/__tests__/write-mode-disabled.test.tsx
// cover the same entry points (including owner, token and vote links) in CI.
const test = base.extend({
  page: async ({ page }, providePage) => {
    await routeOffline(page);
    await providePage(page);
  },
});

test.skip(process.env.NPE_EXPECT_WRITE_MODE_DISABLED !== '1', 'needs an export built with write mode disabled');

const writeLinks = 'a[href*="/broadcast"], a[href*="/wallet"]';

test('a read-only build links nowhere into write mode', async ({ page }) => {
  await page.goto('?network=testnet');
  const nav = page.getByRole('complementary', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Query', exact: true })).toBeVisible();
  await expect(nav.locator(writeLinks)).toHaveCount(0);
  await expect(nav.getByText('Write', { exact: true })).toHaveCount(0);

  await page.goto('contract/?network=testnet');
  await expect(page.getByRole('textbox', { name: 'Contract ID' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Well-known system contracts' })).toBeVisible();
  await expect(page.locator(writeLinks)).toHaveCount(0);

  await page.goto('sdk-reference/?network=testnet');
  await expect(page.getByRole('heading', { name: '/broadcast/' })).toBeVisible();
  await expect(page.locator(writeLinks)).toHaveCount(0);
});

test('the write pages themselves show the disabled notice', async ({ page }) => {
  for (const route of ['broadcast/', 'wallet/']) {
    await page.goto(`${route}?network=testnet`);
    await expect(page.getByRole('heading', { name: 'Write mode is disabled' })).toBeVisible();
  }
});
