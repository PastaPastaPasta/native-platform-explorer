import { test, expect } from '@playwright/test';

test('home page renders with navbar', async ({ page }) => {
  await page.goto('/');
  // The navbar brand mark.
  await expect(page.getByText('NPE')).toBeVisible();
});
