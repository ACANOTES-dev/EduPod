import { expect, test } from '@playwright/test';

test.describe('Tier 2 route guard', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !['it', 'ro'].includes(String(testInfo.project.metadata.locale)),
      'Tier 2 coverage only',
    );
  });

  test('redirects out-of-scope routes to the tenant default locale', async ({ page }, testInfo) => {
    const locale = String(testInfo.project.metadata.locale);

    await page.context().addCookies([
      {
        name: 'tenant_default_locale',
        value: 'en',
        url: 'http://localhost:5551',
      },
    ]);

    await page.goto(`/${locale}/finance/payroll`);
    await page.waitForURL('**/en/finance/payroll');

    expect(new URL(page.url()).pathname).toBe('/en/finance/payroll');
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
  });

  test('does not redirect in-scope Tier 2 public routes', async ({ page }, testInfo) => {
    const locale = String(testInfo.project.metadata.locale);

    await page.goto(`/${locale}/contact`);
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname).toBe(`/${locale}/contact`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
  });
});
