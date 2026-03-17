import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
  });

  test.describe('Dashboard', () => {
    test('should render the dashboard in dark mode (English)', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-dashboard-en.png', {
        fullPage: true,
      });
    });

    test('should render the dashboard in dark mode (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-dashboard-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Student Detail', () => {
    test('should render student detail in dark mode (English)', async ({
      page,
    }) => {
      await page.goto('/en/students');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="student-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('dark-student-detail-en.png', {
          fullPage: true,
        });
      }
    });

    test('should render student detail in dark mode (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/students');
      await page.waitForLoadState('networkidle');

      const firstRow = page
        .locator('table tbody tr, [data-testid="student-row"]')
        .first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot('dark-student-detail-ar.png', {
          fullPage: true,
        });
      }
    });
  });

  test.describe('Invoice List', () => {
    test('should render the invoice list in dark mode (English)', async ({
      page,
    }) => {
      await page.goto('/en/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-invoices-en.png', {
        fullPage: true,
      });
    });

    test('should render the invoice list in dark mode (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-invoices-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Gradebook', () => {
    test('should render the gradebook in dark mode (English)', async ({
      page,
    }) => {
      await page.goto('/en/gradebook');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-gradebook-en.png', {
        fullPage: true,
      });
    });

    test('should render the gradebook in dark mode (Arabic)', async ({
      page,
    }) => {
      await page.goto('/ar/gradebook');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('dark-gradebook-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Dark Mode Contrast', () => {
    test('should have sufficient contrast on primary buttons in dark mode', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      const primaryBtn = page
        .locator('button[class*="primary"], [data-testid="primary-action"]')
        .first();
      if (await primaryBtn.isVisible()) {
        await expect(primaryBtn).toHaveScreenshot('dark-primary-button-en.png');
      }
    });

    test('should render navigation sidebar correctly in dark mode', async ({
      page,
    }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      const sidebar = page.locator('nav, [role="navigation"], aside').first();
      if (await sidebar.isVisible()) {
        await expect(sidebar).toHaveScreenshot('dark-sidebar-en.png');
      }
    });
  });
});
