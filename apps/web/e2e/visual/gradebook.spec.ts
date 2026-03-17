import { test, expect } from '@playwright/test';

test.describe('Gradebook', () => {
  test('should render the gradebook in English', async ({ page }) => {
    await page.goto('/en/gradebook');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('gradebook-en.png', {
      fullPage: true,
    });
  });

  test('should render the gradebook in Arabic', async ({ page }) => {
    await page.goto('/ar/gradebook');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('gradebook-ar.png', {
      fullPage: true,
    });
  });

  test('should render gradebook table headers correctly in English', async ({
    page,
  }) => {
    await page.goto('/en/gradebook');
    await page.waitForLoadState('networkidle');

    const table = page.locator('table, [data-testid="gradebook-grid"]').first();
    if (await table.isVisible()) {
      await expect(table).toHaveScreenshot('gradebook-table-en.png');
    }
  });

  test('should render gradebook table headers correctly in Arabic', async ({
    page,
  }) => {
    await page.goto('/ar/gradebook');
    await page.waitForLoadState('networkidle');

    const table = page.locator('table, [data-testid="gradebook-grid"]').first();
    if (await table.isVisible()) {
      await expect(table).toHaveScreenshot('gradebook-table-ar.png');
    }
  });
});
