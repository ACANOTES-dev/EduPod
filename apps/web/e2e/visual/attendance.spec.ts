import { test, expect } from '@playwright/test';

test.describe('Attendance', () => {
  test.describe('Marking Screen', () => {
    test('should render the attendance marking screen in English', async ({
      page,
    }) => {
      await page.goto('/en/attendance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('attendance-marking-en.png', {
        fullPage: true,
      });
    });

    test('should render the attendance marking screen in Arabic', async ({
      page,
    }) => {
      await page.goto('/ar/attendance');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('attendance-marking-ar.png', {
        fullPage: true,
      });
    });
  });

  test.describe('Exceptions', () => {
    test('should render the attendance exceptions in English', async ({
      page,
    }) => {
      await page.goto('/en/attendance/exceptions');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('attendance-exceptions-en.png', {
        fullPage: true,
      });
    });

    test('should render the attendance exceptions in Arabic', async ({
      page,
    }) => {
      await page.goto('/ar/attendance/exceptions');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('attendance-exceptions-ar.png', {
        fullPage: true,
      });
    });
  });
});
