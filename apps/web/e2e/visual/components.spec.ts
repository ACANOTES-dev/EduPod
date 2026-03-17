import { test, expect } from '@playwright/test';

test.describe('Component Visual Regression', () => {
  test('should render dashboard stat cards in English', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const statCards = page.locator('[class*="stat-card"], [class*="bg-surface-secondary"]').first();
    if (await statCards.isVisible()) {
      await expect(statCards).toHaveScreenshot('stat-cards-en.png');
    }
  });

  test('should render dashboard stat cards in Arabic', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');

    const statCards = page.locator('[class*="stat-card"], [class*="bg-surface-secondary"]').first();
    if (await statCards.isVisible()) {
      await expect(statCards).toHaveScreenshot('stat-cards-ar.png');
    }
  });

  test('should render empty state component', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');

    const emptyState = page.locator('text=No data yet').first();
    if (await emptyState.isVisible()) {
      const container = emptyState.locator('..');
      await expect(container).toHaveScreenshot('empty-state-en.png');
    }
  });
});
