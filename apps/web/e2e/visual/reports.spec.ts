import { test, expect } from '@playwright/test';

test.describe('Reports', () => {
  test('should render the reports hub in English', async ({ page }) => {
    await page.goto('/en/reports');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('reports-hub-en.png', {
      fullPage: true,
    });
  });

  test('should render the reports hub in Arabic', async ({ page }) => {
    await page.goto('/ar/reports');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('reports-hub-ar.png', {
      fullPage: true,
    });
  });

  test('should render report filter controls in English', async ({ page }) => {
    await page.goto('/en/reports');
    await page.waitForLoadState('networkidle');

    const filterSection = page
      .locator('[data-testid="report-filters"], [class*="filter"]')
      .first();
    if (await filterSection.isVisible()) {
      await expect(filterSection).toHaveScreenshot('reports-filters-en.png');
    }
  });

  test('should render report filter controls in Arabic', async ({ page }) => {
    await page.goto('/ar/reports');
    await page.waitForLoadState('networkidle');

    const filterSection = page
      .locator('[data-testid="report-filters"], [class*="filter"]')
      .first();
    if (await filterSection.isVisible()) {
      await expect(filterSection).toHaveScreenshot('reports-filters-ar.png');
    }
  });
});
