import { test, expect } from '@playwright/test';

test.describe('Communications', () => {
  test.describe('Announcement List', () => {
    test('should render the announcement list in English', async ({
      page,
    }) => {
      await page.goto('/en/communications');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('communications-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the announcement list in Arabic', async ({ page }) => {
      await page.goto('/ar/communications');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('communications-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('New Announcement', () => {
    test('should render the new announcement form in English', async ({
      page,
    }) => {
      await page.goto('/en/communications/new');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('communications-new-en.png', {
        fullPage: true,
      });
    });

    test('should render the new announcement form in Arabic', async ({
      page,
    }) => {
      await page.goto('/ar/communications/new');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('communications-new-ar.png', {
        fullPage: true,
      });
    });
  });
});
