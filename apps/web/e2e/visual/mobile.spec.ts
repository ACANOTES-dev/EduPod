import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe('Mobile Viewport', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
  });

  test.describe('Dashboard', () => {
    test('should render the dashboard at mobile width (English)', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-dashboard-en.png', {
        fullPage: true,
      });
    });

    test('should render the dashboard at mobile width (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-dashboard-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Student List', () => {
    test('should render the student list at mobile width (English)', async ({
      page,
    }) => {
      await page.goto('/en/students');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-students-list-en.png', {
        fullPage: true,
      });
    });

    test('should render the student list at mobile width (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/students');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-students-list-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Sidebar Collapse', () => {
    test('should collapse the sidebar at mobile width (English)', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      // At mobile width, sidebar should be collapsed or hidden
      const sidebar = page.locator('nav, [role="navigation"], aside').first();
      if (await sidebar.isVisible()) {
        const box = await sidebar.boundingBox();
        if (box) {
          // Sidebar should either be hidden off-screen or very narrow
          expect(box.width).toBeLessThan(MOBILE_VIEWPORT.width * 0.5);
        }
      }

      await expect(page).toHaveScreenshot('mobile-sidebar-collapsed-en.png', {
        fullPage: true,
      });
    });

    test('should collapse the sidebar at mobile width (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/dashboard');
      await page.waitForLoadState('networkidle');

      const sidebar = page.locator('nav, [role="navigation"], aside').first();
      if (await sidebar.isVisible()) {
        const box = await sidebar.boundingBox();
        if (box) {
          expect(box.width).toBeLessThan(MOBILE_VIEWPORT.width * 0.5);
        }
      }

      await expect(page).toHaveScreenshot('mobile-sidebar-collapsed-ar.png', {
        fullPage: true,
      });
    });

    test('should open sidebar via hamburger menu (English)', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      const hamburger = page
        .locator(
          '[data-testid="mobile-menu-toggle"], [aria-label="Toggle menu"], [aria-label="Open menu"], button:has(svg[class*="menu"])',
        )
        .first();
      if (await hamburger.isVisible()) {
        await hamburger.click();
        await page.waitForTimeout(300); // wait for animation
        await expect(page).toHaveScreenshot('mobile-sidebar-open-en.png', {
          fullPage: true,
        });
      }
    });

    test('should open sidebar via hamburger menu (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/dashboard');
      await page.waitForLoadState('networkidle');

      const hamburger = page
        .locator(
          '[data-testid="mobile-menu-toggle"], [aria-label="Toggle menu"], [aria-label="Open menu"], button:has(svg[class*="menu"])',
        )
        .first();
      if (await hamburger.isVisible()) {
        await hamburger.click();
        await page.waitForTimeout(300); // wait for animation
        await expect(page).toHaveScreenshot('mobile-sidebar-open-ar.png', {
          fullPage: true,
        });
      }
    });
  });

  test.describe('Finance Mobile', () => {
    test('should render invoices at mobile width (English)', async ({
      page,
    }) => {
      await page.goto('/en/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-invoices-en.png', {
        fullPage: true,
      });
    });

    test('should render invoices at mobile width (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-invoices-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Attendance Mobile', () => {
    test('should render attendance at mobile width (English)', async ({
      page,
    }) => {
      await page.goto('/en/attendance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-attendance-en.png', {
        fullPage: true,
      });
    });

    test('should render attendance at mobile width (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/attendance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('mobile-attendance-ar.png', {
        fullPage: true,
      });
    });
  });
});
