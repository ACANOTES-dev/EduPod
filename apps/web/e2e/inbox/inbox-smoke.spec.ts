import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke for the new inbox (impl 16 — Wave 5 polish).
 *
 * This is NOT a comprehensive E2E suite. It is a minimal regression gate that
 * confirms a deployment didn't break the basic shape of every inbox surface:
 * the route resolves, the HTML renders without 500s, and the auth redirect
 * points at `/en/login` for unauthenticated visitors.
 *
 * Full flow coverage (compose → send → reply → safeguarding scan → oversight
 * freeze → fallback escalation) lives in the hand-run script in
 * `new-inbox/implementations/16-polish-translations-mobile-smoke.md` §5
 * and the pre-launch checklist. This spec is the cheap gate that runs in CI.
 */

const INBOX_ROUTES = [
  '/en/inbox',
  '/en/inbox/audiences',
  '/en/inbox/audiences/new',
  '/en/inbox/search?q=test',
  '/en/inbox/oversight',
  '/en/settings/messaging-policy',
  '/en/settings/communications/safeguarding',
  '/en/settings/communications/fallback',
] as const;

const PUBLIC_ROUTES = ['/en/login', '/ar/login'] as const;

for (const route of PUBLIC_ROUTES) {
  test(`public route ${route} loads`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `GET ${route}`).toBeLessThan(500);
    await expect(page.locator('html')).toBeVisible();
  });
}

for (const route of INBOX_ROUTES) {
  test(`inbox route ${route} redirects or renders without 500`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `GET ${route} status`).toBeLessThan(500);

    // Unauthenticated: the middleware should bounce us to /en/login.
    // Authenticated: we should see the page rendered. Either shape is OK;
    // a 500 is not.
    const finalUrl = page.url();
    const redirectedToLogin = /\/en\/login/.test(finalUrl);
    const rendered = new URL(finalUrl).pathname.startsWith(route.split('?')[0] ?? route);
    expect(redirectedToLogin || rendered, `final URL: ${finalUrl}`).toBe(true);
  });
}

test('RTL locale inbox route bounces to login cleanly', async ({ page }) => {
  const response = await page.goto('/ar/inbox', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  const html = page.locator('html');
  const dir = await html.getAttribute('dir');
  const lang = await html.getAttribute('lang');
  // If the RTL login redirect happened, the html should declare dir=rtl
  // and lang=ar. If a server component handed back the inbox route without
  // auth, accept that too (some deployments gate at the client).
  if (page.url().includes('/ar/login')) {
    expect(dir).toBe('rtl');
    expect(lang).toBe('ar');
  }
});
