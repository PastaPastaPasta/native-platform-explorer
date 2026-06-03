import { test, expect } from '@playwright/test';

test('home page renders with brand mark', async ({ page }) => {
  await page.goto('/');
  // The Field Manual brand mark in the header (BrandRow → Logotype).
  await expect(page.getByText('native_explorer')).toBeVisible();
});
