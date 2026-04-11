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

  test.describe('Ready to Admit queue', () => {
    test('should render the ready-to-admit queue in English', async ({ page }) => {
      await page.goto('/en/admissions/ready-to-admit');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-ready-to-admit-en.png', {
        fullPage: true,
      });
    });

    test('should render the ready-to-admit queue in Arabic', async ({ page }) => {
      await page.goto('/ar/admissions/ready-to-admit');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-ready-to-admit-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Form preview', () => {
    test('should render the form preview page in English', async ({ page }) => {
      await page.goto('/en/admissions/form-preview');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-form-preview-en.png', {
        fullPage: true,
      });
    });

    test('should render the form preview page in Arabic', async ({ page }) => {
      await page.goto('/ar/admissions/form-preview');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('admissions-form-preview-ar.png', {
        fullPage: true,
      });
    });
  });
});
