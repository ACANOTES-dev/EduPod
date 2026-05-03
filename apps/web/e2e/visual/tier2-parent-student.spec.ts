import { expect, test } from '@playwright/test';

const TIER2_ROUTE_EXPECTATIONS = [
  { path: '/login', snapshot: 'tier2-login' },
  { path: '/contact', snapshot: 'tier2-contact' },
] as const;

test.describe('Tier 2 public visuals', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !['it', 'ro'].includes(String(testInfo.project.metadata.locale)),
      'Tier 2 coverage only',
    );
  });

  for (const route of TIER2_ROUTE_EXPECTATIONS) {
    test(`${route.path} renders in the project locale`, async ({ page }, testInfo) => {
      const locale = String(testInfo.project.metadata.locale);
      await page.goto(`/${locale}${route.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');

      await expect(page).toHaveScreenshot(`${route.snapshot}-${testInfo.project.name}.png`, {
        animations: 'disabled',
        fullPage: true,
      });
    });
  }

  test('parent and student routes stay inside the Tier 2 locale boundary', async ({
    page,
  }, testInfo) => {
    const locale = String(testInfo.project.metadata.locale);

    for (const path of ['/dashboard/parent', '/dashboard/student', '/parent/household']) {
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState('networkidle');

      const pathname = new URL(page.url()).pathname;
      expect(pathname.startsWith(`/${locale}/`)).toBe(true);
      expect(pathname.startsWith('/en/')).toBe(false);
      await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
    }
  });
});
