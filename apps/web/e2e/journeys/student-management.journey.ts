/**
 * Student management journey — tests the students module with authenticated state.
 *
 * Runs in the "journeys" project which uses saved storageState from auth.setup.
 */

import { expect, test } from '@playwright/test';

test.describe('Student management journey', () => {
  test('should display students list page', async ({ page }) => {
    await page.goto('/en/students');
    await page.waitForLoadState('networkidle');

    // The students page renders a PageHeader with h1 titled "Students"
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const text = await heading.textContent();
    expect(text?.toLowerCase()).toMatch(/students/i);
  });

  test('should display student table or empty state', async ({ page }) => {
    await page.goto('/en/students');
    await page.waitForLoadState('networkidle');

    // Either a data table or an empty state should be present
    const tableOrEmpty = page
      .locator('table, [role="table"], [class*="empty"], [data-testid*="empty"]')
      .first();
    await expect(tableOrEmpty).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to new student form', async ({ page }) => {
    await page.goto('/en/students/new');
    await page.waitForLoadState('networkidle');

    // The new student page renders a PageHeader with "New Student"
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const text = await heading.textContent();
    expect(text?.toLowerCase()).toMatch(/new student|student/i);

    // A form should be present
    const form = page.locator('form').first();
    await expect(form).toBeVisible({ timeout: 15_000 });
  });

  test('should display search and filter controls', async ({ page }) => {
    await page.goto('/en/students');
    await page.waitForLoadState('networkidle');

    // The students page has a search input with placeholder "Search students..."
    const searchInput = page.getByPlaceholder(/search students/i);
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
  });

  test('should display year group filter', async ({ page }) => {
    await page.goto('/en/students');
    await page.waitForLoadState('networkidle');

    // The students page has Select components rendered as combobox trigger buttons
    // There are status, year group, and allergy filters
    const comboboxes = page.locator('button[role="combobox"], [data-radix-select-trigger]');
    await expect(comboboxes.first()).toBeVisible({ timeout: 15_000 });

    // There should be multiple filter dropdowns (status, year group, allergy)
    const count = await comboboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
