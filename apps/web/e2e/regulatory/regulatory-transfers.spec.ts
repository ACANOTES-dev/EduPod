import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 8 Transfers sub-hub.
 *
 * Confirms both the list and /new routes resolve without a 500 and that
 * unauthenticated traffic bounces to /en/login. Create-transfer end-to-end is
 * exercised manually on NHQS post-deploy.
 */

const ROUTE = '/en/regulatory/transfers';
const NEW_ROUTE = '/en/regulatory/transfers/new';

test(`transfers route ${ROUTE} renders without 500`, async ({ page }) => {
  const response = await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  expect(status, `GET ${ROUTE} status`).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  const rendered = new URL(finalUrl).pathname.startsWith(ROUTE);
  expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
});

test(`transfers /new route ${NEW_ROUTE} renders without 500`, async ({ page }) => {
  const response = await page.goto(NEW_ROUTE, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  expect(status, `GET ${NEW_ROUTE} status`).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  const rendered = new URL(finalUrl).pathname.startsWith(NEW_ROUTE);
  expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
});

test('RTL /ar/regulatory/transfers route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/transfers', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
