import { expect, test } from '@playwright/test';

const ITALIAN_ROUTE_EXPECTATIONS = [
  { path: '/it/login', snapshot: 'tier2-login' },
  { path: '/it/contact', snapshot: 'tier2-contact' },
] as const;

test.describe('Italian Tier 2 public visuals', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.metadata.locale !== 'it', 'Italian Tier 2 coverage only');
  });

  for (const route of ITALIAN_ROUTE_EXPECTATIONS) {
    test(`${route.path} renders in Italian`, async ({ page }, testInfo) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      await expect(page.locator('html')).toHaveAttribute('lang', 'it');
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');

      await expect(page).toHaveScreenshot(`${route.snapshot}-${testInfo.project.name}.png`, {
        animations: 'disabled',
        fullPage: true,
      });
    });
  }

  test('parent and student routes stay inside the Italian locale boundary', async ({ page }) => {
    for (const path of ['/it/dashboard/parent', '/it/dashboard/student', '/it/parent/household']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const pathname = new URL(page.url()).pathname;
      expect(pathname.startsWith('/it/')).toBe(true);
      expect(pathname.startsWith('/en/')).toBe(false);
      await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
    }
  });
});
