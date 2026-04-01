import { expect, test } from '@playwright/test';

const PAGE_CASES = [
  {
    path: '/en/login',
    expectedDir: 'ltr',
    expectedLang: 'en',
    snapshot: 'login-en.png',
  },
  {
    path: '/ar/login',
    expectedDir: 'rtl',
    expectedLang: 'ar',
    snapshot: 'login-ar.png',
  },
  {
    path: '/en/contact',
    expectedDir: 'ltr',
    expectedLang: 'en',
    snapshot: 'contact-en.png',
  },
  {
    path: '/ar/contact',
    expectedDir: 'rtl',
    expectedLang: 'ar',
    snapshot: 'contact-ar.png',
  },
] as const;

for (const pageCase of PAGE_CASES) {
  test(`visual smoke for ${pageCase.path}`, async ({ page }) => {
    await page.goto(pageCase.path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    await expect(page.locator('html')).toHaveAttribute('dir', pageCase.expectedDir);
    await expect(page.locator('html')).toHaveAttribute('lang', pageCase.expectedLang);

    await expect(page).toHaveScreenshot(pageCase.snapshot, {
      animations: 'disabled',
      fullPage: true,
    });
  });
}
