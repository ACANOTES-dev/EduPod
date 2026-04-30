import { expect, test } from '@playwright/test';

test.describe('Italian Tier 2 route guard', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.metadata.locale !== 'it', 'Italian Tier 2 coverage only');
  });

  test('redirects out-of-scope routes to the tenant default locale', async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'tenant_default_locale',
        value: 'en',
        url: 'http://localhost:5551',
      },
    ]);

    await page.goto('/it/finance/payroll');
    await page.waitForURL('**/en/finance/payroll');

    expect(new URL(page.url()).pathname).toBe('/en/finance/payroll');
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
  });

  test('does not redirect in-scope Italian public routes', async ({ page }) => {
    await page.goto('/it/contact');
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname).toBe('/it/contact');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
  });
});
