/**
 * Playwright config for authenticated journey tests.
 *
 * These tests exercise real user flows (login, navigation, CRUD) against a running
 * dev server with a seeded database. They require valid credentials.
 *
 * Run:
 *   pnpm --filter @school/web exec playwright test --config e2e/playwright.journeys.config.ts
 *
 * Environment variables (with test-account fallbacks):
 *   JOURNEY_EMAIL     — login email
 *   JOURNEY_PASSWORD  — login password
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './journeys',
  outputDir: './test-results/journeys',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e/playwright-report/journeys', open: 'never' }], ['list']],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:5551',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'journeys',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'unauthenticated',
      testMatch: /login\.journey\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // No storageState — tests login from scratch
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @school/web start',
    url: 'http://localhost:5551',
    reuseExistingServer: !process.env.CI,
  },
});
