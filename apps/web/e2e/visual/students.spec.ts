import { test, expect } from '@playwright/test';

test.describe('Students', () => {
  test.describe('List View', () => {
    test('should render the student list in English', async ({ page }) => {
      await page.goto('/en/students');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('students-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the student list in Arabic', async ({ page }) => {
      await page.goto('/ar/students');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('students-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Detail View', () => {
    test('should render student detail in English', async ({ page }) => {
      // Navigate to list first, then click into a student if available
      await page.goto('/en/students');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="student-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('students-detail-en.png', {
          fullPage: true,
        });
      }
    });

    test('should render student detail in Arabic', async ({ page }) => {
      await page.goto('/ar/students');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="student-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('students-detail-ar.png', {
          fullPage: true,
        });
      }
    });
  });

  test.describe('New Student Form', () => {
    test('should render new student form in English', async ({ page }) => {
      await page.goto('/en/students/new');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('students-new-en.png', {
        fullPage: true,
      });
    });

    test('should render new student form in Arabic', async ({ page }) => {
      await page.goto('/ar/students/new');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('students-new-ar.png', {
        fullPage: true,
      });
    });
  });
});
