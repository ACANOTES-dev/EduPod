import { expect, test } from '@playwright/test';

const platformBaseUrl = process.env.STEALTH_PLATFORM_BASE_URL ?? 'http://dua.localhost:5551';
const tenantBaseUrl = process.env.STEALTH_TENANT_BASE_URL ?? 'http://nhqs.localhost:5551';
const platformEmail = process.env.STEALTH_PLATFORM_EMAIL ?? 'admin@edupod.app';
const tenantEmail = process.env.STEALTH_TENANT_EMAIL ?? 'owner@nhqs.test';
const password = process.env.STEALTH_E2E_PASSWORD ?? 'Password123!';

test.describe('stealth platform subdomain', () => {
  test('returns 404 for unauthenticated platform root, random paths, and admin', async ({
    page,
  }) => {
    for (const path of ['/', '/random-path', '/en/admin']) {
      const response = await page.goto(`${platformBaseUrl}${path}`);
      expect(response?.status(), path).toBe(404);
    }
  });

  test('renders the platform login form without public navigation', async ({ page }) => {
    await page.goto(`${platformBaseUrl}/en/login`);

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Platform Dashboard');
  });

  test('rejects tenant credentials on the platform host', async ({ page }) => {
    await page.goto(`${platformBaseUrl}/en/login`);
    await page.getByLabel('Email').fill(tenantEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('allows platform credentials on the platform host', async ({ page }) => {
    await page.goto(`${platformBaseUrl}/en/login`);
    await page.getByLabel('Email').fill(platformEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/en/admin');
    await expect(page.getByText('Platform Dashboard')).toBeVisible();
  });

  test('retires tenant-host admin routes', async ({ page }) => {
    const response = await page.goto(`${tenantBaseUrl}/en/admin`);
    expect(response?.status()).toBe(404);
  });
});
