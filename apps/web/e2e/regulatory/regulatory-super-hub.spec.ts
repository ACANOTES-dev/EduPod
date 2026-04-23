import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 2 regulatory super-hub (/regulatory).
 *
 * Mirrors the shape of inbox-smoke.spec.ts — this is a cheap CI gate that
 * confirms the hub + every sub-module route resolves without a 500, and that
 * unauthenticated visitors bounce to /en/login. Full flow coverage (login,
 * role-gated tiles, KPI values, 375px responsive) runs manually post-deploy
 * against nhqs.edupod.app.
 */

const REGULATORY_ROUTES = [
  '/en/regulatory',
  '/en/regulatory/tusla',
  '/en/regulatory/ppod',
  '/en/regulatory/des-returns',
  '/en/regulatory/october-returns',
  '/en/regulatory/calendar',
  '/en/regulatory/submissions',
  '/en/regulatory/anti-bullying',
  '/en/regulatory/safeguarding',
  '/en/regulatory/privacy-notices',
  '/en/regulatory/ppod/cba',
  '/en/regulatory/ppod/transfers',
] as const;

for (const route of REGULATORY_ROUTES) {
  test(`regulatory route ${route} redirects or renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    // Unauthenticated: middleware should bounce us to /en/login.
    // Authenticated: we should see the page rendered. Either is OK; a 500 is
    // not. Transient hydration errors during client-side auth checks also
    // bounce to login — that's acceptable for the smoke gate.
    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('RTL /ar/regulatory route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);

  if (page.url().includes('/ar/login')) {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
