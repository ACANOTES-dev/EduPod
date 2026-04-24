import { expect, test, type ConsoleMessage } from '@playwright/test';

/**
 * Phase 11 — walks every /ar/regulatory/* route and fails if
 *
 *   (a) any route 500s, or
 *   (b) next-intl logs a MISSING_MESSAGE warning (missing or mis-typed key),
 *       or
 *   (c) the login page we bounce to is not actually in RTL.
 *
 * The 1247-key regulatory namespace is kept in parity by the Jest
 * translation-parity spec; this runtime walk catches code paths that
 * reference a key name that doesn't exist in either locale.
 */

const RTL_ROUTES = [
  '/ar/regulatory',
  '/ar/regulatory/tusla',
  '/ar/regulatory/tusla/sar',
  '/ar/regulatory/tusla/aar',
  '/ar/regulatory/tusla/reduced-days',
  '/ar/regulatory/tusla/mappings',
  '/ar/regulatory/ppod',
  '/ar/regulatory/ppod/students',
  '/ar/regulatory/ppod/import',
  '/ar/regulatory/ppod/export',
  '/ar/regulatory/ppod/sync-log',
  '/ar/regulatory/des-returns',
  '/ar/regulatory/des-returns/generate',
  '/ar/regulatory/des-returns/subject-mappings',
  '/ar/regulatory/october-returns',
  '/ar/regulatory/october-returns/issues',
  '/ar/regulatory/october-returns/preview',
  '/ar/regulatory/cba',
  '/ar/regulatory/transfers',
  '/ar/regulatory/transfers/new',
  '/ar/regulatory/calendar',
  '/ar/regulatory/submissions',
  '/ar/regulatory/anti-bullying',
  '/ar/regulatory/safeguarding',
  '/ar/regulatory/safeguarding/mandatory-reporting',
  '/ar/regulatory/safeguarding/annual-review',
  '/ar/regulatory/safeguarding/staff-vetting',
  '/ar/regulatory/safeguarding/dlp-register',
  '/ar/regulatory/gdpr',
  '/ar/regulatory/gdpr/dsar',
  '/ar/regulatory/gdpr/dpa-policy',
  '/ar/regulatory/gdpr/data-retention',
  '/ar/regulatory/gdpr/privacy-notices',
] as const;

for (const route of RTL_ROUTES) {
  test(`ar route ${route} renders in RTL without 500 or missing-message`, async ({ page }) => {
    const missingMessages: string[] = [];

    const consoleListener = (msg: ConsoleMessage) => {
      const text = msg.text();
      if (text.includes('MISSING_MESSAGE')) {
        missingMessages.push(text);
      }
    };
    page.on('console', consoleListener);

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    const finalUrl = page.url();
    const redirectedToLogin = /\/ar\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);

    // Whichever page we land on, it must identify itself as Arabic + RTL.
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');

    page.off('console', consoleListener);
    expect(
      missingMessages,
      `MISSING_MESSAGE warnings on ${route}:\n${missingMessages.join('\n')}`,
    ).toEqual([]);
  });
}
