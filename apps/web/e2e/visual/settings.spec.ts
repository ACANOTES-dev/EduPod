import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.describe('General Settings', () => {
    test('should render general settings in English', async ({ page }) => {
      await page.goto('/en/settings/general');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('settings-general-en.png', {
        fullPage: true,
      });
    });

    test('should render general settings in Arabic', async ({ page }) => {
      await page.goto('/ar/settings/general');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('settings-general-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Branding Settings', () => {
    test('should render branding settings in English', async ({ page }) => {
      await page.goto('/en/settings/branding');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('settings-branding-en.png', {
        fullPage: true,
      });
    });

    test('should render branding settings in Arabic', async ({ page }) => {
      await page.goto('/ar/settings/branding');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('settings-branding-ar.png', {
        fullPage: true,
      });
    });
  });
});
