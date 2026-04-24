import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 9 Safeguarding sub-hub.
 *
 * Confirms each route resolves without a 500 and bounces to /en/login when
 * unauthenticated. Live data, DLP dialogs, and vetting-expiry warnings are
 * exercised manually on NHQS post-deploy.
 */

const ROUTES = [
  '/en/regulatory/safeguarding',
  '/en/regulatory/safeguarding/mandatory-reporting',
  '/en/regulatory/safeguarding/staff-vetting',
  '/en/regulatory/safeguarding/annual-review',
  '/en/regulatory/safeguarding/dlp-register',
];

for (const route of ROUTES) {
  test(`safeguarding route ${route} renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('RTL /ar/regulatory/safeguarding renders without 500', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/safeguarding', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
