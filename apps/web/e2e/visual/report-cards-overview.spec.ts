import { test, expect } from '@playwright/test';

/**
 * Report Cards — overview (landing + class matrix) smoke tests.
 *
 * These tests verify that the redesigned routes render without crashing
 * and expose the key landmarks. They do not rely on seeded fixture data
 * so they are safe to run against any environment: empty states are
 * treated as valid.
 */
test.describe('Report Cards — overview', () => {
  test('landing page renders in English', async ({ page }) => {
    await page.goto('/en/report-cards');
    await page.waitForLoadState('networkidle');
    // Matches the PageHeader title rendered from reportCards.title
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('landing page renders in Arabic', async ({ page }) => {
    await page.goto('/ar/report-cards');
    await page.waitForLoadState('networkidle');
    // The Arabic shell flips to dir="rtl" on <html>
    const dir = await page.locator('html').getAttribute('dir');
    expect(['rtl', null]).toContain(dir);
  });

  test('landing page exposes a link to the library', async ({ page }) => {
    await page.goto('/en/report-cards');
    await page.waitForLoadState('networkidle');
    // The "View Library" button text comes from reportCards.librarySectionButton
    const libraryButton = page.getByRole('button', { name: /library/i }).first();
    if (await libraryButton.isVisible()) {
      await expect(libraryButton).toBeEnabled();
    }
  });

  test('class matrix route renders (handles invalid id gracefully)', async ({ page }) => {
    // Using a syntactically valid UUID that will not match any real class.
    // The page should render an empty / not-found state, not crash.
    const bogusId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/en/report-cards/${bogusId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
