/**
 * Household-numbers journey — smoke tests for the multi-student public apply
 * form with mode picker, household lookup, and sibling badge.
 *
 * Runs in the "journeys" project using the saved storageState from auth.setup.
 *
 * Covers the household-numbers rebuild at a render-smoke level:
 *   1. Mode picker renders with both options (new family / existing family).
 *   2. Existing-family lookup shows an error toast on invalid data.
 *   3. New-family form shows sections in the correct order.
 *   4. "Add another child" button appends a student block.
 *
 * Full data-seeded E2E (submit -> approve -> verify household number on student)
 * requires fixture helpers beyond the scope of this spec.
 */

import { expect, test } from '@playwright/test';

test.describe('Household numbers and sibling flow', () => {
  test('mode picker renders with both options', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.waitForLoadState('networkidle');

    // The mode picker title
    await expect(page.getByText(/new family or adding a child/i)).toBeVisible({ timeout: 15_000 });

    // Both option buttons
    await expect(page.getByText(/new family applying for the first time/i)).toBeVisible();
    await expect(page.getByText(/adding a child to an existing family/i)).toBeVisible();
  });

  test('existing family lookup shows error on bad data', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.waitForLoadState('networkidle');

    // Pick existing family mode
    await page.getByText(/adding a child to an existing family/i).click();

    // Fill the lookup form with known-bad data
    await page.getByLabel(/household number/i).fill('ZZZ000');
    await page.getByLabel(/parent email/i).fill('nobody@example.com');
    await page.getByRole('button', { name: /find our family/i }).click();

    // The toast/error appears after the failed API call
    await expect(page.getByText(/couldn't find a family matching/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('new family form shows correct section order', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.waitForLoadState('networkidle');

    // Pick new family mode
    await page.getByText(/new family applying for the first time/i).click();

    // Wait for the form to render
    await expect(page.getByText(/primary parent or guardian/i)).toBeVisible({ timeout: 10_000 });

    // Section headings must appear in this order:
    // parent -> address -> students -> emergency
    const headings = await page.locator('h2, h3').allTextContents();
    const parentIdx = headings.findIndex((h) => /primary parent/i.test(h));
    const addressIdx = headings.findIndex((h) => /home address/i.test(h));
    const studentsIdx = headings.findIndex((h) => /children applying/i.test(h));
    const emergencyIdx = headings.findIndex((h) => /emergency contact/i.test(h));

    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(addressIdx).toBeGreaterThan(parentIdx);
    expect(studentsIdx).toBeGreaterThan(addressIdx);
    expect(emergencyIdx).toBeGreaterThan(studentsIdx);
  });

  test('add another child button appends a new student block', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.waitForLoadState('networkidle');

    // Pick new family mode
    await page.getByText(/new family applying for the first time/i).click();

    // Wait for the students section
    await expect(page.getByText(/children applying/i)).toBeVisible({ timeout: 10_000 });

    // Count initial "Child N" blocks
    const before = await page.getByText(/^Child \d+$/i).count();

    // Click add another child
    await page.getByText(/add another child/i).click();

    // Should have one more
    const after = await page.getByText(/^Child \d+$/i).count();
    expect(after).toBe(before + 1);
  });
});
