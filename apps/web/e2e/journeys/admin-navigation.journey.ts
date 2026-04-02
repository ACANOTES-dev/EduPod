/**
 * Admin navigation journey — tests sidebar navigation across major sections.
 *
 * Runs in the "journeys" project which uses saved storageState from auth.setup.
 */

import { test, expect } from '@playwright/test';

test.describe('Admin navigation journey', () => {
  test('should display the sidebar with navigation sections', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // The sidebar (aside element) should be visible on desktop viewport
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // The sidebar should contain nav links — SidebarItem renders <a> tags with hrefs
    const navLinks = sidebar.locator('a[href]');
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(3);
  });

  test('should have the dashboard link in the sidebar', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // The sidebar should have a link to the dashboard
    const dashboardLink = page.locator('aside a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to students page via sidebar', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // Click the students link in the sidebar
    const studentsLink = page.locator('aside a[href="/students"]');
    await expect(studentsLink).toBeVisible({ timeout: 15_000 });
    await studentsLink.click();

    // Wait for navigation to students
    await page.waitForURL((url) => url.pathname.includes('/students'), {
      timeout: 15_000,
    });

    // Students page should show a heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to settings via sidebar', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // Click the settings link in the sidebar
    const settingsLink = page.locator('aside a[href="/settings"]');
    await expect(settingsLink).toBeVisible({ timeout: 15_000 });
    await settingsLink.click();

    // Settings redirects to /settings/branding — wait for that
    await page.waitForURL((url) => url.pathname.includes('/settings'), {
      timeout: 15_000,
    });

    // Settings page should load with content
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to attendance via sidebar', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const attendanceLink = page.locator('aside a[href="/attendance"]');
    await expect(attendanceLink).toBeVisible({ timeout: 15_000 });
    await attendanceLink.click();

    await page.waitForURL((url) => url.pathname.includes('/attendance'), {
      timeout: 15_000,
    });

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to finance via sidebar', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const financeLink = page.locator('aside a[href="/finance"]');
    await expect(financeLink).toBeVisible({ timeout: 15_000 });
    await financeLink.click();

    await page.waitForURL((url) => url.pathname.includes('/finance'), {
      timeout: 15_000,
    });

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('should show the app name in the sidebar header', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // The sidebar header shows the app name as a text span
    const sidebar = page.locator('aside');
    const appName = sidebar.locator('span').first();
    await expect(appName).toBeVisible({ timeout: 15_000 });

    const text = await appName.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('should toggle sidebar collapse', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    // Find the collapse toggle button
    const collapseBtn = page.locator(
      'aside button[aria-label="Collapse sidebar"], aside button[aria-label="Expand sidebar"]',
    ).first();
    await expect(collapseBtn).toBeVisible({ timeout: 15_000 });

    // Click to collapse
    await collapseBtn.click();

    // After collapsing, the expand button should appear
    const expandBtn = page.locator('aside button[aria-label="Expand sidebar"]');
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });

    // Click to expand again
    await expandBtn.click();

    // The collapse button should reappear
    const collapseBtnAgain = page.locator('aside button[aria-label="Collapse sidebar"]');
    await expect(collapseBtnAgain).toBeVisible({ timeout: 5_000 });
  });
});
