import { test, expect } from '@playwright/test';

/**
 * Physical CSS class patterns that violate RTL safety.
 * These must never appear in the rendered DOM — the project uses
 * logical equivalents (ms-, me-, ps-, pe-, start-, end-, etc.).
 */
const PHYSICAL_CLASS_VIOLATIONS = [
  /\bml-\d/,
  /\bmr-\d/,
  /\bpl-\d/,
  /\bpr-\d/,
  /\bleft-\d/,
  /\bright-\d/,
  /\btext-left\b/,
  /\btext-right\b/,
  /\brounded-l-/,
  /\brounded-r-/,
  /\bborder-l-/,
  /\bborder-r-/,
  /\bscroll-ml-/,
  /\bscroll-mr-/,
  /\bscroll-pl-/,
  /\bscroll-pr-/,
];

/**
 * Scans all elements in the page for physical directional CSS classes.
 * Returns an array of violations: { selector, classes }.
 */
async function scanForPhysicalClassViolations(
  page: import('@playwright/test').Page,
): Promise<{ selector: string; classes: string[] }[]> {
  return page.evaluate((patterns: string[]) => {
    const regexes = patterns.map((p) => new RegExp(p));
    const violations: { selector: string; classes: string[] }[] = [];

    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      const classList = Array.from(el.classList);
      const offending = classList.filter((cls) =>
        regexes.some((rx) => rx.test(cls)),
      );
      if (offending.length > 0) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className
          ? `.${Array.from(el.classList).slice(0, 3).join('.')}`
          : '';
        violations.push({
          selector: `${tag}${id}${classes}`,
          classes: offending,
        });
      }
    });

    return violations;
  }, PHYSICAL_CLASS_VIOLATIONS.map((r) => r.source));
}

/** Routes to test for RTL regression. */
const RTL_ROUTES = [
  { path: '/ar/dashboard', name: 'dashboard' },
  { path: '/ar/students', name: 'students-list' },
  { path: '/ar/staff', name: 'staff-list' },
  { path: '/ar/households', name: 'households-list' },
  { path: '/ar/classes', name: 'classes-list' },
  { path: '/ar/admissions', name: 'admissions-hub' },
  { path: '/ar/admissions/applications', name: 'admissions-applications' },
  { path: '/ar/scheduling', name: 'scheduling' },
  { path: '/ar/scheduling/period-grid', name: 'scheduling-period-grid' },
  { path: '/ar/attendance', name: 'attendance' },
  { path: '/ar/gradebook', name: 'gradebook' },
  { path: '/ar/finance', name: 'finance' },
  { path: '/ar/finance/invoices', name: 'finance-invoices' },
  { path: '/ar/finance/payments', name: 'finance-payments' },
  { path: '/ar/finance/fee-structures', name: 'finance-fee-structures' },
  { path: '/ar/payroll', name: 'payroll-hub' },
  { path: '/ar/payroll/runs', name: 'payroll-runs' },
  { path: '/ar/payroll/compensation', name: 'payroll-compensation' },
  { path: '/ar/communications', name: 'communications' },
  { path: '/ar/settings/general', name: 'settings-general' },
  { path: '/ar/settings/branding', name: 'settings-branding' },
  { path: '/ar/reports', name: 'reports' },
];

test.describe('RTL Regression', () => {
  for (const route of RTL_ROUTES) {
    test.describe(route.name, () => {
      test(`should have dir="rtl" on <html> — ${route.name}`, async ({
        page,
      }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const dir = await page.locator('html').getAttribute('dir');
        expect(dir).toBe('rtl');
      });

      test(`should have no physical directional CSS classes — ${route.name}`, async ({
        page,
      }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const violations = await scanForPhysicalClassViolations(page);
        expect(violations).toEqual([]);
      });

      test(`visual snapshot — ${route.name}`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`rtl-${route.name}-ar.png`, {
          fullPage: true,
        });
      });
    });
  }

  test('should set lang="ar" on <html>', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('ar');
  });

  test('should render sidebar on the right side in RTL', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('nav, [role="navigation"], aside').first();
    if (await sidebar.isVisible()) {
      const box = await sidebar.boundingBox();
      const viewport = page.viewportSize();
      if (box && viewport) {
        // In RTL, the sidebar should be on the right (high x value)
        expect(box.x + box.width).toBeGreaterThan(viewport.width / 2);
      }
    }
  });
});
