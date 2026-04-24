import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 8 Anti-Bullying sub-hub.
 *
 * Confirms the route resolves without a 500 and that unauthenticated traffic
 * bounces to /en/login. The /api/v1/regulatory/anti-bullying/summary endpoint
 * and the Bí Cineálta Latin-character fix are exercised manually on NHQS
 * post-deploy.
 */

const ROUTE = '/en/regulatory/anti-bullying';

test(`anti-bullying route ${ROUTE} renders without 500`, async ({ page }) => {
  const response = await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  expect(status, `GET ${ROUTE} status`).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  const rendered = new URL(finalUrl).pathname.startsWith(ROUTE);
  expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
});

test('RTL /ar/regulatory/anti-bullying route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/anti-bullying', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
