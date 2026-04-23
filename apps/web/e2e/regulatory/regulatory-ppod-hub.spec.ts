import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 4 P-POD sub-hub + leaf pages.
 *
 * Like regulatory-tusla-hub.spec.ts — a cheap CI gate confirming every
 * PPOD route resolves without a 500 and that unauthenticated traffic
 * bounces to /en/login. The redirect entries added in Phase 4 (CBA and
 * Transfers moving out of /regulatory/ppod) are also verified here.
 * Full sync / import / export flows are exercised manually on NHQS
 * post-deploy.
 */

const PPOD_ROUTES = [
  '/en/regulatory/ppod',
  '/en/regulatory/ppod/students',
  '/en/regulatory/ppod/sync-log',
  '/en/regulatory/ppod/import',
  '/en/regulatory/ppod/export',
  '/en/regulatory/cba',
  '/en/regulatory/transfers',
  '/en/regulatory/transfers/new',
] as const;

for (const route of PPOD_ROUTES) {
  test(`ppod route ${route} redirects or renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

// Legacy paths should 308-redirect to the promoted locations.
const LEGACY_REDIRECTS: Array<[string, string]> = [
  ['/en/regulatory/ppod/cba', '/en/regulatory/cba'],
  ['/en/regulatory/ppod/transfers', '/en/regulatory/transfers'],
];

for (const [legacy, target] of LEGACY_REDIRECTS) {
  test(`legacy path ${legacy} redirects to ${target}`, async ({ page }) => {
    const response = await page.goto(legacy, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    const finalPath = new URL(page.url()).pathname;
    const redirectedToLogin = /\/en\/login/.test(finalPath);
    // Redirects run edge-side before the auth gate, so we expect the
    // target path either rendered directly or bounced to login.
    expect(
      redirectedToLogin || finalPath === target || finalPath.startsWith(target + '/'),
      `final path: ${finalPath}`,
    ).toBe(true);
  });
}

test('RTL /ar/regulatory/ppod route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/ppod', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);

  if (page.url().includes('/ar/login')) {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
