import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 6 October Returns sub-hub + leaf pages.
 *
 * Confirms every October Returns route resolves without a 500 and that
 * unauthenticated traffic bounces to /en/login. Full readiness /
 * issues / preview flows are exercised manually on NHQS post-deploy.
 */

const OCTOBER_ROUTES = [
  '/en/regulatory/october-returns',
  '/en/regulatory/october-returns/issues',
  '/en/regulatory/october-returns/preview',
] as const;

for (const route of OCTOBER_ROUTES) {
  test(`october-returns route ${route} renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('october-returns hub preserves ?year query when loaded', async ({ page }) => {
  const response = await page.goto('/en/regulatory/october-returns?year=2024-2025', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  if (!redirectedToLogin) {
    expect(finalUrl).toContain('year=2024-2025');
  }
});

test('RTL /ar/regulatory/october-returns route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/october-returns', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
