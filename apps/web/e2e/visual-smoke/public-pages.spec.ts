import { expect, test } from '@playwright/test';

type VisualPageCase = {
  expectedDir: 'ltr' | 'rtl';
  expectedLang: string;
  path: string;
  snapshot: string;
  viewport?: {
    height: number;
    width: number;
  };
  viewportHeight?: number;
};

const PAGE_CASES: readonly VisualPageCase[] = [
  {
    path: '/en/login',
    expectedDir: 'ltr',
    expectedLang: 'en',
    snapshot: 'login-en.png',
  },
  {
    path: '/ar/login',
    expectedDir: 'rtl',
    expectedLang: 'ar',
    snapshot: 'login-ar.png',
  },
  {
    path: '/fr/login',
    expectedDir: 'ltr',
    expectedLang: 'fr',
    snapshot: 'login-fr.png',
  },
  {
    path: '/es/login',
    expectedDir: 'ltr',
    expectedLang: 'es',
    snapshot: 'login-es.png',
  },
  {
    path: '/de/login',
    expectedDir: 'ltr',
    expectedLang: 'de',
    snapshot: 'login-de.png',
  },
  {
    path: '/de/login',
    expectedDir: 'ltr',
    expectedLang: 'de',
    snapshot: 'login-de-mobile.png',
    viewport: { height: 812, width: 375 },
  },
  {
    path: '/ga/login',
    expectedDir: 'ltr',
    expectedLang: 'ga',
    snapshot: 'login-ga.png',
  },
  {
    path: '/ga/login',
    expectedDir: 'ltr',
    expectedLang: 'ga',
    snapshot: 'login-ga-mobile.png',
    viewport: { height: 812, width: 375 },
  },
  {
    path: '/en/contact',
    expectedDir: 'ltr',
    expectedLang: 'en',
    snapshot: 'contact-en.png',
  },
  {
    path: '/ar/contact',
    expectedDir: 'rtl',
    expectedLang: 'ar',
    snapshot: 'contact-ar.png',
  },
  {
    path: '/fr/contact',
    expectedDir: 'ltr',
    expectedLang: 'fr',
    snapshot: 'contact-fr.png',
  },
  {
    path: '/es/contact',
    expectedDir: 'ltr',
    expectedLang: 'es',
    snapshot: 'contact-es.png',
    viewportHeight: 900,
  },
  {
    path: '/de/contact',
    expectedDir: 'ltr',
    expectedLang: 'de',
    snapshot: 'contact-de.png',
    viewportHeight: 900,
  },
  {
    path: '/de/contact',
    expectedDir: 'ltr',
    expectedLang: 'de',
    snapshot: 'contact-de-mobile.png',
    viewport: { height: 900, width: 375 },
  },
  {
    path: '/ga/contact',
    expectedDir: 'ltr',
    expectedLang: 'ga',
    snapshot: 'contact-ga.png',
    viewportHeight: 900,
  },
  {
    path: '/ga/contact',
    expectedDir: 'ltr',
    expectedLang: 'ga',
    snapshot: 'contact-ga-mobile.png',
    viewport: { height: 900, width: 375 },
  },
] as const;

for (const pageCase of PAGE_CASES) {
  test(`visual smoke for ${pageCase.path} (${pageCase.snapshot})`, async ({ page }) => {
    if (pageCase.viewport) {
      await page.setViewportSize(pageCase.viewport);
    }

    if (pageCase.viewportHeight) {
      await page.setViewportSize({ height: pageCase.viewportHeight, width: 1280 });
    }

    await page.goto(pageCase.path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    await expect(page.locator('html')).toHaveAttribute('dir', pageCase.expectedDir);
    await expect(page.locator('html')).toHaveAttribute('lang', pageCase.expectedLang);

    await expect(page).toHaveScreenshot(pageCase.snapshot, {
      animations: 'disabled',
      fullPage: true,
    });
  });
}
