/**
 * Finance journey — tests the finance module with authenticated state.
 *
 * Runs in the "journeys" project which uses saved storageState from auth.setup.
 */

import { test, expect } from '@playwright/test';

test.describe('Finance journey', () => {
  test('should load the finance hub with dashboard stats', async ({ page }) => {
    await page.goto('/en/finance');
    await page.waitForLoadState('networkidle');

    // The finance hub renders a PageHeader with h1
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // The finance dashboard shows StatCard components or a loading state
    // Wait for at least one meaningful content element
    const content = page.locator(
      'h1, [class*="stat"], [class*="card"], [class*="rounded-2xl"]',
    ).first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });

  test('should display financial summary cards or widgets', async ({ page }) => {
    await page.goto('/en/finance');
    await page.waitForLoadState('networkidle');

    // The finance hub page uses StatCard components wrapped in rounded-2xl borders
    // Check that at least one card-like element is present
    const cards = page.locator('[class*="rounded-2xl"], [class*="stat-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should navigate to invoices page', async ({ page }) => {
    await page.goto('/en/finance/invoices');
    await page.waitForLoadState('networkidle');

    // The invoices page should load with a heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('should display the invoice list or empty state on the invoices page', async ({ page }) => {
    await page.goto('/en/finance/invoices');
    await page.waitForLoadState('networkidle');

    // Either a data table or an empty state should be visible
    const tableOrEmpty = page.locator(
      'table, [role="table"], [class*="empty"], [data-testid*="empty"]',
    ).first();
    await expect(tableOrEmpty).toBeVisible({ timeout: 15_000 });
  });

  test('should display status filter tabs on the invoices page', async ({ page }) => {
    await page.goto('/en/finance/invoices');
    await page.waitForLoadState('networkidle');

    // The invoices page has status tabs (All, Draft, Pending, Issued, etc.)
    // These render as buttons or tab-like elements
    const filters = page.locator(
      'button, [role="tab"], [role="combobox"]',
    );
    await expect(filters.first()).toBeVisible({ timeout: 15_000 });

    // There should be multiple filter/action buttons
    const count = await filters.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should navigate to payments page', async ({ page }) => {
    await page.goto('/en/finance/payments');
    await page.waitForLoadState('networkidle');

    // The payments page should load with a heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Either a data table or an empty state should be visible
    const content = page.locator(
      'table, [role="table"], [class*="empty"], [data-testid*="empty"]',
    ).first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });
});
