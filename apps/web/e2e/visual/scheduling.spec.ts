import { test, expect } from '@playwright/test';

test.describe('Scheduling', () => {
  test.describe('Schedule View', () => {
    test('should render the schedule view in English', async ({ page }) => {
      await page.goto('/en/scheduling');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-view-en.png', {
        fullPage: true,
      });
    });

    test('should render the schedule view in Arabic', async ({ page }) => {
      await page.goto('/ar/scheduling');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-view-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Period Grid', () => {
    test('should render the period grid in English', async ({ page }) => {
      await page.goto('/en/scheduling/period-grid');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-period-grid-en.png', {
        fullPage: true,
      });
    });

    test('should render the period grid in Arabic', async ({ page }) => {
      await page.goto('/ar/scheduling/period-grid');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-period-grid-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Scheduling Dashboard', () => {
    test('should render the scheduling dashboard in English', async ({
      page,
    }) => {
      await page.goto('/en/scheduling/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-dashboard-en.png', {
        fullPage: true,
      });
    });

    test('should render the scheduling dashboard in Arabic', async ({
      page,
    }) => {
      await page.goto('/ar/scheduling/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('scheduling-dashboard-ar.png', {
        fullPage: true,
      });
    });
  });
});
