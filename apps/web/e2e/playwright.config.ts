import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  snapshotDir: './visual/__snapshots__',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30 * 60 * 1000,
  use: {
    baseURL: 'http://localhost:5551',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'en-ltr',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
      },
      metadata: {
        locale: 'en',
        direction: 'ltr',
      },
    },
    {
      name: 'ar-rtl',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'ar-SA',
      },
      metadata: {
        locale: 'ar',
        direction: 'rtl',
      },
    },
    {
      name: 'mobile-en',
      use: {
        ...devices['iPhone 14'],
        locale: 'en-US',
      },
      metadata: {
        locale: 'en',
        direction: 'ltr',
      },
    },
    {
      name: 'mobile-ar',
      use: {
        ...devices['iPhone 14'],
        locale: 'ar-SA',
      },
      metadata: {
        locale: 'ar',
        direction: 'rtl',
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @school/web start',
    url: 'http://localhost:5551',
    reuseExistingServer: !process.env.CI,
  },
});
