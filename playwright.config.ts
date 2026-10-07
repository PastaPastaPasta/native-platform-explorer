import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:3100${basePath}/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-export.mjs',
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
