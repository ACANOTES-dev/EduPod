import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 7 Submissions sub-hub.
 *
 * Confirms the submissions route resolves without a 500, ?domain
 * filter is preserved on the URL, and unauthenticated traffic bounces
 * to /en/login. Detail-drawer and resubmit flows are exercised manually
 * on NHQS post-deploy.
 */

const SUBMISSIONS_ROUTE = '/en/regulatory/submissions';

test(`submissions route ${SUBMISSIONS_ROUTE} renders without 500`, async ({ page }) => {
  const response = await page.goto(SUBMISSIONS_ROUTE, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  expect(status, `GET ${SUBMISSIONS_ROUTE} status`).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  const rendered = new URL(finalUrl).pathname.startsWith(SUBMISSIONS_ROUTE);
  expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
});

test('submissions preserves ?domain query when loaded', async ({ page }) => {
  const response = await page.goto('/en/regulatory/submissions?domain=des_september_returns', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  if (!redirectedToLogin) {
    expect(finalUrl).toContain('domain=des_september_returns');
  }
});

test('RTL /ar/regulatory/submissions route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/submissions', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
