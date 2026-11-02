import { defineConfig, devices } from '@playwright/test';

// We drive the production single-file build through file:// so the tests cover
// the artifact people actually double-click, not just the dev server.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    headless: true,
    acceptDownloads: true,
    trace: 'retain-on-failure'
  }
});
