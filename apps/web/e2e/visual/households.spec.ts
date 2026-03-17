import { test, expect } from '@playwright/test';

test.describe('Households', () => {
  test.describe('List View', () => {
    test('should render the household list in English', async ({ page }) => {
      await page.goto('/en/households');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('households-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the household list in Arabic', async ({ page }) => {
      await page.goto('/ar/households');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('households-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Detail View', () => {
    test('should render household detail in English', async ({ page }) => {
      await page.goto('/en/households');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="household-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('households-detail-en.png', {
          fullPage: true,
        });
      }
    });

    test('should render household detail in Arabic', async ({ page }) => {
      await page.goto('/ar/households');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="household-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('households-detail-ar.png', {
          fullPage: true,
        });
      }
    });
  });
});
