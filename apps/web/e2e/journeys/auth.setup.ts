/**
 * Playwright auth setup — runs before all authenticated journey tests.
 *
 * Logs in via the UI, waits for redirect to the dashboard, and saves browser
 * storage state so subsequent tests skip the login step.
 */

import { test as setup, expect } from '@playwright/test';

const EMAIL = process.env.JOURNEY_EMAIL ?? 'admin@school.test';
const PASSWORD = process.env.JOURNEY_PASSWORD ?? 'TestPassword123!';
const AUTH_STATE_PATH = '.auth/user.json';

setup('authenticate via login page', async ({ page }) => {
  // Navigate to the login page
  await page.goto('/en/login');

  // Wait for the login form to render
  await page.locator('form').waitFor({ state: 'visible', timeout: 15_000 });

  // Fill in credentials
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);

  // Submit the form
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from login — the app routes to /en/dashboard (admin),
  // /en/dashboard/teacher, /en/dashboard/parent, or /en/admin depending on role.
  // We wait for the URL to stop containing "/login".
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30_000,
  });

  // Verify we landed on an authenticated page — the sidebar or top bar should be present
  await expect(
    page.locator('aside, nav, [aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]').first(),
  ).toBeVisible({ timeout: 15_000 });

  // Save storage state for reuse by other test projects
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
