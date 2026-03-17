import { test, expect } from '@playwright/test';

test.describe('App Shell', () => {
  test('should render the app shell in English (LTR)', async ({ page }) => {
    await page.goto('/en/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app-shell-en.png', {
      fullPage: true,
    });
  });

  test('should render the app shell in Arabic (RTL)', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app-shell-ar.png', {
      fullPage: true,
    });
  });

  test('should have correct dir attribute for English', async ({ page }) => {
    await page.goto('/en/dashboard');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });

  test('should have correct dir attribute for Arabic', async ({ page }) => {
    await page.goto('/ar/dashboard');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });
});
