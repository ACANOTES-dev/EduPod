import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 3 Tusla sub-hub + leaf pages.
 *
 * Like regulatory-super-hub.spec.ts — a cheap CI gate confirming every
 * Tusla route resolves without a 500 and that unauthenticated traffic
 * bounces to /en/login. Wizard CSV download, SAR/AAR persistence, and
 * mappings CRUD are exercised manually on NHQS post-deploy.
 */

const TUSLA_ROUTES = [
  '/en/regulatory/tusla',
  '/en/regulatory/tusla/sar',
  '/en/regulatory/tusla/aar',
  '/en/regulatory/tusla/reduced-days',
  '/en/regulatory/tusla/mappings',
] as const;

for (const route of TUSLA_ROUTES) {
  test(`tusla route ${route} redirects or renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('RTL /ar/regulatory/tusla route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/tusla', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);

  if (page.url().includes('/ar/login')) {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
