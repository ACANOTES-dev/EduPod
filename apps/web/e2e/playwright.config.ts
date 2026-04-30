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
      name: 'fr-ltr',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'fr-FR',
      },
      metadata: {
        locale: 'fr',
        direction: 'ltr',
      },
    },
    {
      name: 'es-ltr',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'es-ES',
      },
      metadata: {
        locale: 'es',
        direction: 'ltr',
      },
    },
    {
      name: 'de-ltr',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'de-DE',
      },
      metadata: {
        locale: 'de',
        direction: 'ltr',
      },
    },
    {
      name: 'ga-ltr',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'ga-IE',
      },
      metadata: {
        locale: 'ga',
        direction: 'ltr',
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
    {
      name: 'fr-mobile',
      use: {
        ...devices['iPhone 14'],
        locale: 'fr-FR',
      },
      metadata: {
        locale: 'fr',
        direction: 'ltr',
      },
    },
    {
      name: 'es-mobile',
      use: {
        ...devices['iPhone 14'],
        locale: 'es-ES',
      },
      metadata: {
        locale: 'es',
        direction: 'ltr',
      },
    },
    {
      name: 'de-mobile',
      use: {
        ...devices['iPhone 14'],
        locale: 'de-DE',
      },
      metadata: {
        locale: 'de',
        direction: 'ltr',
      },
    },
    {
      name: 'ga-mobile',
      use: {
        ...devices['iPhone 14'],
        locale: 'ga-IE',
      },
      metadata: {
        locale: 'ga',
        direction: 'ltr',
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @school/web start',
    url: 'http://localhost:5551',
    reuseExistingServer: !process.env.CI,
  },
});
