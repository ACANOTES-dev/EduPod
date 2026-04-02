/**
 * Login journey — tests the full login flow from an unauthenticated state.
 *
 * This test runs in the "unauthenticated" project (no storageState).
 */

import { test, expect } from '@playwright/test';

const EMAIL = process.env.JOURNEY_EMAIL ?? 'admin@school.test';
const PASSWORD = process.env.JOURNEY_PASSWORD ?? 'TestPassword123!';

test.describe('Login journey', () => {
  test('should display the login form with email and password fields', async ({ page }) => {
    await page.goto('/en/login');

    // The form should be visible
    await expect(page.locator('form')).toBeVisible();

    // Email and password fields should exist
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // Submit button should be present
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should reject invalid credentials with an error message', async ({ page }) => {
    await page.goto('/en/login');
    await page.locator('form').waitFor({ state: 'visible' });

    await page.locator('#email').fill('nobody@invalid.test');
    await page.locator('#password').fill('WrongPassword999!');
    await page.locator('button[type="submit"]').click();

    // An error message should appear within the form
    const errorBanner = page.locator('[class*="danger"], [role="alert"]').first();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  });

  test('should log in successfully and redirect to dashboard', async ({ page }) => {
    await page.goto('/en/login');
    await page.locator('form').waitFor({ state: 'visible' });

    // Fill credentials
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });

    // Verify the dashboard or an authenticated shell loaded
    // The sidebar (desktop) should be present on desktop viewport
    const sidebarOrNav = page.locator(
      'aside, [aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]',
    ).first();
    await expect(sidebarOrNav).toBeVisible({ timeout: 15_000 });
  });

  test('should show the user name in the user menu after login', async ({ page }) => {
    await page.goto('/en/login');
    await page.locator('form').waitFor({ state: 'visible' });

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Wait for authenticated state
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });

    // The user menu trigger shows the user's display name (hidden on mobile, visible on sm+)
    // On Desktop Chrome viewport the text should be visible
    const userMenuText = page.locator('button[aria-label] p, [class*="truncate"]').first();
    await expect(userMenuText).toBeVisible({ timeout: 15_000 });

    // The user name should not be empty
    const nameText = await userMenuText.textContent();
    expect(nameText?.trim().length).toBeGreaterThan(0);
  });
});
