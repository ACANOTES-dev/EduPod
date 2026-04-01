import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './visual-smoke',
  snapshotDir: './visual-smoke/__snapshots__',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'e2e/playwright-report', open: 'never' }], ['list']],
  timeout: 2 * 60 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5551',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5551/en/login',
    reuseExistingServer: !process.env.CI,
  },
});
