import { test, expect } from '@playwright/test';

test.describe('Payroll', () => {
  test.describe('Payroll Hub', () => {
    test('should render the payroll hub in English', async ({ page }) => {
      await page.goto('/en/payroll');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-hub-en.png', {
        fullPage: true,
      });
    });

    test('should render the payroll hub in Arabic', async ({ page }) => {
      await page.goto('/ar/payroll');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-hub-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Runs', () => {
    test('should render the payroll runs in English', async ({ page }) => {
      await page.goto('/en/payroll/runs');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-runs-en.png', {
        fullPage: true,
      });
    });

    test('should render the payroll runs in Arabic', async ({ page }) => {
      await page.goto('/ar/payroll/runs');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-runs-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Compensation', () => {
    test('should render compensation management in English', async ({
      page,
    }) => {
      await page.goto('/en/payroll/compensation');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-compensation-en.png', {
        fullPage: true,
      });
    });

    test('should render compensation management in Arabic', async ({
      page,
    }) => {
      await page.goto('/ar/payroll/compensation');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('payroll-compensation-ar.png', {
        fullPage: true,
      });
    });
  });

  test('should render monetary values with correct alignment in English', async ({
    page,
  }) => {
    await page.goto('/en/payroll/runs');
    await page.waitForLoadState('networkidle');

    const moneyCell = page
      .locator('[data-testid="money-cell"], td:has-text("SAR"), td:has-text("$")')
      .first();
    if (await moneyCell.isVisible()) {
      await expect(moneyCell).toHaveScreenshot('payroll-money-cell-en.png');
    }
  });

  test('should render monetary values with correct alignment in Arabic', async ({
    page,
  }) => {
    await page.goto('/ar/payroll/runs');
    await page.waitForLoadState('networkidle');

    const moneyCell = page
      .locator('[data-testid="money-cell"], td:has-text("ر.س"), td:has-text("SAR")')
      .first();
    if (await moneyCell.isVisible()) {
      await expect(moneyCell).toHaveScreenshot('payroll-money-cell-ar.png');
    }
  });
});
