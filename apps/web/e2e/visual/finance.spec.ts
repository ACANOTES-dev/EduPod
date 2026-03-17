import { test, expect } from '@playwright/test';

test.describe('Finance', () => {
  test.describe('Finance Hub', () => {
    test('should render the finance hub in English', async ({ page }) => {
      await page.goto('/en/finance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-hub-en.png', {
        fullPage: true,
      });
    });

    test('should render the finance hub in Arabic', async ({ page }) => {
      await page.goto('/ar/finance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-hub-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Invoices', () => {
    test('should render the invoice list in English', async ({ page }) => {
      await page.goto('/en/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-invoices-en.png', {
        fullPage: true,
      });
    });

    test('should render the invoice list in Arabic', async ({ page }) => {
      await page.goto('/ar/finance/invoices');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-invoices-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Payments', () => {
    test('should render the payments list in English', async ({ page }) => {
      await page.goto('/en/finance/payments');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-payments-en.png', {
        fullPage: true,
      });
    });

    test('should render the payments list in Arabic', async ({ page }) => {
      await page.goto('/ar/finance/payments');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-payments-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Fee Structures', () => {
    test('should render the fee structures in English', async ({ page }) => {
      await page.goto('/en/finance/fee-structures');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-fee-structures-en.png', {
        fullPage: true,
      });
    });

    test('should render the fee structures in Arabic', async ({ page }) => {
      await page.goto('/ar/finance/fee-structures');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('finance-fee-structures-ar.png', {
        fullPage: true,
      });
    });
  });
});
