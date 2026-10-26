import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
// scripts/serve-export.mjs reads the same variable.
const port = Number(process.env.NPE_PREVIEW_PORT || 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: 'retain-on-failure',
    // A worker would answer same-origin requests that page.route mocks.
    // e2e/offline.spec.ts opts back in.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node scripts/serve-export.mjs',
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
