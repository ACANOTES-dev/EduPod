import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 10 GDPR / Privacy sub-hub.
 *
 * Confirms each route resolves without a 500 and bounces to /en/login when
 * unauthenticated. The four legacy redirects (compliance, dpa,
 * data-retention, privacy-notices) are also exercised to prove next.config
 * still routes bookmarks into the new tree.
 */

const SUB_HUB_ROUTES = [
  '/en/regulatory/gdpr',
  '/en/regulatory/gdpr/dsar',
  '/en/regulatory/gdpr/dpa-policy',
  '/en/regulatory/gdpr/data-retention',
  '/en/regulatory/gdpr/privacy-notices',
];

for (const route of SUB_HUB_ROUTES) {
  test(`gdpr route ${route} renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

const LEGACY_REDIRECTS: Array<{ from: string; toPrefix: string }> = [
  { from: '/en/regulatory/compliance', toPrefix: '/en/regulatory/gdpr/dsar' },
  { from: '/en/regulatory/dpa', toPrefix: '/en/regulatory/gdpr/dpa-policy' },
  { from: '/en/regulatory/data-retention', toPrefix: '/en/regulatory/gdpr/data-retention' },
  { from: '/en/regulatory/privacy-notices', toPrefix: '/en/regulatory/gdpr/privacy-notices' },
];

for (const { from, toPrefix } of LEGACY_REDIRECTS) {
  test(`legacy ${from} redirects into the gdpr sub-hub`, async ({ page }) => {
    await page.goto(from, { waitUntil: 'domcontentloaded' });
    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const redirectedToNewTree = new URL(finalUrl).pathname.startsWith(toPrefix);
    expect(redirectedToLogin || redirectedToNewTree, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('RTL /ar/regulatory/gdpr renders without 500', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/gdpr', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
