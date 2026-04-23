import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 5 DES Returns sub-hub + leaf pages.
 *
 * Confirms every DES Returns route resolves without a 500 and that
 * unauthenticated traffic bounces to /en/login. Full readiness /
 * mapping / generation flows are exercised manually on NHQS post-deploy.
 */

const DES_ROUTES = [
  '/en/regulatory/des-returns',
  '/en/regulatory/des-returns/subject-mappings',
  '/en/regulatory/des-returns/generate',
] as const;

for (const route of DES_ROUTES) {
  test(`des-returns route ${route} renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('des-returns hub preserves ?year query when loaded', async ({ page }) => {
  const response = await page.goto('/en/regulatory/des-returns?year=2024-2025', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  if (!redirectedToLogin) {
    // When rendered, the year query must remain in the URL.
    expect(finalUrl).toContain('year=2024-2025');
  }
});

test('RTL /ar/regulatory/des-returns route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/des-returns', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
