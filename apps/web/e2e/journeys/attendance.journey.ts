/**
 * Attendance journey — tests the attendance module with authenticated state.
 *
 * Runs in the "journeys" project which uses saved storageState from auth.setup.
 */

import { test, expect } from '@playwright/test';

test.describe('Attendance journey', () => {
  test('should load the attendance page with a heading', async ({ page }) => {
    await page.goto('/en/attendance');

    // Wait for the page to finish loading (auth redirect, data fetch)
    await page.waitForLoadState('networkidle');

    // The page should have a heading (h1) — the PageHeader component renders one
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Heading text should relate to attendance
    const text = await heading.textContent();
    expect(text?.toLowerCase()).toMatch(/attendance|sessions|marking/i);
  });

  test('should display the sessions table or an empty state', async ({ page }) => {
    await page.goto('/en/attendance');
    await page.waitForLoadState('networkidle');

    // Either a data table with rows OR an empty state should be present
    const table = page.locator('table, [role="table"]').first();
    const emptyState = page.locator('[class*="empty"], [data-testid*="empty"]').first();

    // Wait for one of them to appear
    await expect(
      page.locator('table, [role="table"], [class*="empty"], [data-testid*="empty"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    const hasTable = await table.isVisible();
    const hasEmpty = await emptyState.isVisible();
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('should display class filter controls', async ({ page }) => {
    await page.goto('/en/attendance');
    await page.waitForLoadState('networkidle');

    // The attendance page has class filter and status filter selects
    // The Select component from @school/ui renders a trigger button
    const filterArea = page.locator('button[role="combobox"], select, [data-radix-select-trigger]');
    await expect(filterArea.first()).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to attendance marking when a session row is clicked', async ({ page }) => {
    await page.goto('/en/attendance');
    await page.waitForLoadState('networkidle');

    // Check if there are any table rows to click
    const rows = page.locator('table tbody tr, [role="table"] [role="row"]');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Click the first data row
      await rows.first().click();

      // Should navigate to a mark page or session detail
      await page.waitForURL((url) => url.pathname.includes('/attendance/'), {
        timeout: 10_000,
      });
    }
    // If no rows exist, the test passes — we cannot test click navigation without data
  });
});
