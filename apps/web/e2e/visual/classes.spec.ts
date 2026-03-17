import { test, expect } from '@playwright/test';

test.describe('Classes', () => {
  test.describe('List View', () => {
    test('should render the class list in English', async ({ page }) => {
      await page.goto('/en/classes');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('classes-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the class list in Arabic', async ({ page }) => {
      await page.goto('/ar/classes');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('classes-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Detail View', () => {
    test('should render class detail in English', async ({ page }) => {
      await page.goto('/en/classes');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="class-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('classes-detail-en.png', {
          fullPage: true,
        });
      }
    });

    test('should render class detail in Arabic', async ({ page }) => {
      await page.goto('/ar/classes');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="class-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('classes-detail-ar.png', {
          fullPage: true,
        });
      }
    });
  });
});
