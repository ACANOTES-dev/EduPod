import { test, expect } from '@playwright/test';

test.describe('Staff', () => {
  test.describe('List View', () => {
    test('should render the staff list in English', async ({ page }) => {
      await page.goto('/en/staff');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('staff-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the staff list in Arabic', async ({ page }) => {
      await page.goto('/ar/staff');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('staff-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Detail View', () => {
    test('should render staff detail in English', async ({ page }) => {
      await page.goto('/en/staff');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="staff-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('staff-detail-en.png', {
          fullPage: true,
        });
      }
    });

    test('should render staff detail in Arabic', async ({ page }) => {
      await page.goto('/ar/staff');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="staff-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('staff-detail-ar.png', {
          fullPage: true,
        });
      }
    });
  });
});
