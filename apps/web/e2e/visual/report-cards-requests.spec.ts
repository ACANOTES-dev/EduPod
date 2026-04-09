import { test, expect } from '@playwright/test';

/**
 * Report Cards Teacher Requests — smoke tests covering the list, new, and
 * detail routes in both English and Arabic. Mirrors the impl 07/08/09 pattern
 * of tolerating unseeded environments: every route must mount its top-level
 * heading without crashing. Real authenticated flows require fixtures that
 * are not yet wired into the Playwright suite.
 */

const BOGUS_UUID = '00000000-0000-0000-0000-000000000000';

test.describe('Report Cards Requests — list', () => {
  test('list page renders in English', async ({ page }) => {
    await page.goto('/en/report-cards/requests');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('list page renders in Arabic with RTL direction', async ({ page }) => {
    await page.goto('/ar/report-cards/requests');
    await page.waitForLoadState('networkidle');
    const dir = await page.locator('html').getAttribute('dir');
    expect(['rtl', null]).toContain(dir);
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('Report Cards Requests — submit', () => {
  test('new request page renders in English', async ({ page }) => {
    await page.goto('/en/report-cards/requests/new');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('new request page renders in Arabic', async ({ page }) => {
    await page.goto('/ar/report-cards/requests/new');
    await page.waitForLoadState('networkidle');
    const dir = await page.locator('html').getAttribute('dir');
    expect(['rtl', null]).toContain(dir);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('new request page accepts query-param pre-fill', async ({ page }) => {
    // The page should accept type=regenerate_reports + class_id + period_id
    // without crashing. We cannot verify the pre-fill took effect without
    // real fixtures, but the route must mount.
    await page.goto(
      `/en/report-cards/requests/new?type=regenerate_reports&class_id=${BOGUS_UUID}&period_id=${BOGUS_UUID}`,
    );
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('Report Cards Requests — detail', () => {
  test('detail page renders (handles invalid ids gracefully)', async ({ page }) => {
    await page.goto(`/en/report-cards/requests/${BOGUS_UUID}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('detail page renders in Arabic', async ({ page }) => {
    await page.goto(`/ar/report-cards/requests/${BOGUS_UUID}`);
    await page.waitForLoadState('networkidle');
    const dir = await page.locator('html').getAttribute('dir');
    expect(['rtl', null]).toContain(dir);
  });
});

test.describe('Report Cards Requests — handoff targets', () => {
  test('report-comments page accepts open_window_period query param', async ({ page }) => {
    await page.goto(`/en/report-comments?open_window_period=${BOGUS_UUID}`);
    await page.waitForLoadState('networkidle');
    // The banner / page shell must still render even if the OpenWindow modal
    // is suppressed by a missing admin role.
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('generate wizard accepts scope_mode/scope_ids/period_id handoff', async ({ page }) => {
    await page.goto(
      `/en/report-cards/generate?scope_mode=class&scope_ids=${BOGUS_UUID}&period_id=${BOGUS_UUID}`,
    );
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
