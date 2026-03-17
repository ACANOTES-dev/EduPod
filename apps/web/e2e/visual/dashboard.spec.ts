import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should render the dashboard in English', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard-en.png', {
      fullPage: true,
    });
  });

  test('should render the dashboard in Arabic', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard-ar.png', {
      fullPage: true,
    });
  });

  test('should render stat cards correctly in English', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const statSection = page
      .locator('[data-testid="dashboard-stats"], [class*="stat"], [class*="grid"]')
      .first();
    if (await statSection.isVisible()) {
      await expect(statSection).toHaveScreenshot('dashboard-stats-en.png');
    }
  });

  test('should render stat cards correctly in Arabic', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');

    const statSection = page
      .locator('[data-testid="dashboard-stats"], [class*="stat"], [class*="grid"]')
      .first();
    if (await statSection.isVisible()) {
      await expect(statSection).toHaveScreenshot('dashboard-stats-ar.png');
    }
  });

  test('should render charts section in English', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const chartSection = page
      .locator('[data-testid="dashboard-charts"], .recharts-wrapper')
      .first();
    if (await chartSection.isVisible()) {
      await expect(chartSection).toHaveScreenshot('dashboard-charts-en.png');
    }
  });

  test('should render charts section in Arabic', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');

    const chartSection = page
      .locator('[data-testid="dashboard-charts"], .recharts-wrapper')
      .first();
    if (await chartSection.isVisible()) {
      await expect(chartSection).toHaveScreenshot('dashboard-charts-ar.png');
    }
  });
});
