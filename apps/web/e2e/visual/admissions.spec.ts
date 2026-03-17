import { test, expect } from '@playwright/test';

test.describe('Admissions', () => {
  test.describe('Hub', () => {
    test('should render the admissions hub in English', async ({ page }) => {
      await page.goto('/en/admissions');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-hub-en.png', {
        fullPage: true,
      });
    });

    test('should render the admissions hub in Arabic', async ({ page }) => {
      await page.goto('/ar/admissions');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-hub-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Form Builder', () => {
    test('should render the form builder in English', async ({ page }) => {
      await page.goto('/en/admissions/forms');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-forms-en.png', {
        fullPage: true,
      });
    });

    test('should render the form builder in Arabic', async ({ page }) => {
      await page.goto('/ar/admissions/forms');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-forms-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Applications', () => {
    test('should render the application list in English', async ({ page }) => {
      await page.goto('/en/admissions/applications');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-applications-en.png', {
        fullPage: true,
      });
    });

    test('should render the application list in Arabic', async ({ page }) => {
      await page.goto('/ar/admissions/applications');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-applications-ar.png', {
        fullPage: true,
      });
    });
  });
});
