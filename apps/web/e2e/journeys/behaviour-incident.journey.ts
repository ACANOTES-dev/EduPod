/**
 * Behaviour incident journey — tests the behaviour module with authenticated state.
 *
 * Runs in the "journeys" project which uses saved storageState from auth.setup.
 */

import { expect, test } from '@playwright/test';

test.describe('Behaviour incident journey', () => {
  test('should display behaviour dashboard', async ({ page }) => {
    await page.goto('/en/behaviour');
    await page.waitForLoadState('networkidle');

    // The behaviour dashboard renders a PageHeader with h1
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // The heading should be non-empty
    const text = await heading.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('should display incidents list or empty state', async ({ page }) => {
    await page.goto('/en/behaviour/incidents');
    await page.waitForLoadState('networkidle');

    // The incidents page renders a PageHeader with h1
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Either a data table, incident cards, or an empty state should be present
    const content = page
      .locator(
        'table, [role="table"], [class*="empty"], [data-testid*="empty"], [class*="rounded-xl"]',
      )
      .first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to new incident form', async ({ page }) => {
    await page.goto('/en/behaviour/incidents/new');
    await page.waitForLoadState('networkidle');

    // The new incident page should render a heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const text = await heading.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('should display behaviour navigation tabs on incidents page', async ({ page }) => {
    await page.goto('/en/behaviour/incidents');
    await page.waitForLoadState('networkidle');

    // The incidents list page has filter tabs: All, Positive, Negative, Pending, Escalated, My
    // These render as plain <button type="button"> elements in a tab-like row
    const tabs = page.locator('button[type="button"]');
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });

    // There should be multiple tab/action buttons
    const count = await tabs.count();
    expect(count).toBeGreaterThan(1);
  });
});
