import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the Phase 7 Calendar sub-hub.
 *
 * Confirms the calendar route resolves without a 500 and that
 * unauthenticated traffic bounces to /en/login. Full create-event,
 * seed-defaults, and detail-dialog flows are exercised manually on
 * NHQS post-deploy.
 */

const CALENDAR_ROUTE = '/en/regulatory/calendar';

test(`calendar route ${CALENDAR_ROUTE} renders without 500`, async ({ page }) => {
  const response = await page.goto(CALENDAR_ROUTE, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  expect(status, `GET ${CALENDAR_ROUTE} status`).toBeLessThan(500);

  const finalUrl = page.url();
  const redirectedToLogin = /\/en\/login/.test(finalUrl);
  const rendered = new URL(finalUrl).pathname.startsWith(CALENDAR_ROUTE);
  expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
});

test('RTL /ar/regulatory/calendar route bounces or renders cleanly', async ({ page }) => {
  const response = await page.goto('/ar/regulatory/calendar', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);

  const html = page.locator('html');
  if (page.url().includes('/ar/login')) {
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  }
});
