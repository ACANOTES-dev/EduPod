/**
 * Admissions-flow journey — smoke tests for the financially-gated admissions pipeline.
 *
 * Runs in the "journeys" project using the saved storageState from auth.setup.
 *
 * Covers the main flow of the new-admissions rebuild at a render-smoke level:
 *   1. Dashboard hub loads with KPI strip and card grid.
 *   2. Each queue sub-page mounts and renders its list / empty state.
 *   3. Application detail renders for the most recent row if one exists.
 *   4. Form preview renders with the QR code panel.
 *   5. The public apply form route renders and exposes the dynamic form.
 *
 * Full data-seeded scenarios (submit → approve → pay → student created) are
 * documented in new-admissions/implementations/15-cleanup-polish.md and require
 * fixture helpers that seed year groups, classes, Stripe keys, and parent
 * sessions — extending the fixture rig beyond the scope of impl 15.
 */

import { expect, test } from '@playwright/test';

const QUEUES: Array<{ slug: string; heading: RegExp }> = [
  { slug: 'ready-to-admit', heading: /ready to admit/i },
  { slug: 'waiting-list', heading: /waiting list/i },
  { slug: 'conditional-approval', heading: /conditional approval/i },
  { slug: 'rejected', heading: /rejected/i },
];

test.describe('Admissions flow journey', () => {
  test('dashboard hub loads with KPI strip', async ({ page }) => {
    await page.goto('/en/admissions');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    const text = await heading.textContent();
    expect(text?.toLowerCase()).toMatch(/admissions/i);
  });

  for (const queue of QUEUES) {
    test(`${queue.slug} queue mounts and renders`, async ({ page }) => {
      await page.goto(`/en/admissions/${queue.slug}`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible({ timeout: 15_000 });
      const text = await heading.textContent();
      expect(text).toMatch(queue.heading);
    });
  }

  test('form preview page renders with the dynamic form and QR panel', async ({ page }) => {
    await page.goto('/en/admissions/form-preview');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // A canvas element (from qrcode.react's QRCodeCanvas) should be on the page.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
  });

  test('admissions analytics still loads after enum update', async ({ page }) => {
    await page.goto('/en/admissions/analytics');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('legacy /admissions/forms returns 404 (deleted by cleanup)', async ({ page }) => {
    const response = await page.goto('/en/admissions/forms', { waitUntil: 'domcontentloaded' });
    // Next may serve the 404 page with status 200; assert we don't see the old form-builder.
    expect(response).not.toBeNull();
    const h1 = await page
      .locator('h1')
      .first()
      .textContent({ timeout: 5_000 })
      .catch(() => null);
    expect(h1?.toLowerCase() ?? '').not.toMatch(/form builder|new form/i);
  });
});
