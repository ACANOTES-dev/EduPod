import { expect, test } from '@playwright/test';

const COMMON_ENGLISH = [
  'Save',
  'Cancel',
  'Edit',
  'Delete',
  'Settings',
  'Profile',
  'Logout',
  'Welcome',
  'Submit',
  'Continue',
  'Back',
] as const;

const ALLOWED_PROPER_NOUNS = ['EduPod', 'NHQS', 'Stripe', 'Twilio', 'WhatsApp'] as const;

const FR_PUBLIC_PATHS = ['/fr/login', '/fr/contact'] as const;
const ES_PUBLIC_PATHS = ['/es/login', '/es/contact'] as const;
const DE_PUBLIC_PATHS = ['/de/login', '/de/contact'] as const;
const GA_PUBLIC_PATHS = ['/ga/login', '/ga/contact'] as const;

test.describe('@locale-leak fr', () => {
  for (const path of FR_PUBLIC_PATHS) {
    test(`${path} contains no common untranslated English UI words`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const text = await page.locator('body').innerText();
      expect(text).toBeTruthy();

      const cleaned = ALLOWED_PROPER_NOUNS.reduce(
        (current, noun) => current.replaceAll(noun, ''),
        text ?? '',
      );

      for (const word of COMMON_ENGLISH) {
        const re = new RegExp(`\\b${word}\\b`, 'i');
        expect(re.test(cleaned), `Found leaked English word "${word}" on ${path}`).toBe(false);
      }
    });
  }
});

test.describe('@locale-leak es', () => {
  for (const path of ES_PUBLIC_PATHS) {
    test(`${path} contains no common untranslated English UI words`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const text = await page.locator('body').innerText();
      expect(text).toBeTruthy();

      const cleaned = ALLOWED_PROPER_NOUNS.reduce(
        (current, noun) => current.replaceAll(noun, ''),
        text ?? '',
      );

      for (const word of COMMON_ENGLISH) {
        const re = new RegExp(`\\b${word}\\b`, 'i');
        expect(re.test(cleaned), `Found leaked English word "${word}" on ${path}`).toBe(false);
      }
    });
  }
});

test.describe('@locale-leak de', () => {
  for (const path of DE_PUBLIC_PATHS) {
    test(`${path} contains no common untranslated English UI words`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const text = await page.locator('body').innerText();
      expect(text).toBeTruthy();

      const cleaned = ALLOWED_PROPER_NOUNS.reduce(
        (current, noun) => current.replaceAll(noun, ''),
        text ?? '',
      );

      for (const word of COMMON_ENGLISH) {
        const re = new RegExp(`\\b${word}\\b`, 'i');
        expect(re.test(cleaned), `Found leaked English word "${word}" on ${path}`).toBe(false);
      }
    });
  }
});

test.describe('@locale-leak ga', () => {
  for (const path of GA_PUBLIC_PATHS) {
    test(`${path} contains no common untranslated English UI words`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const text = await page.locator('body').innerText();
      expect(text).toBeTruthy();

      const cleaned = ALLOWED_PROPER_NOUNS.reduce(
        (current, noun) => current.replaceAll(noun, ''),
        text ?? '',
      );

      for (const word of COMMON_ENGLISH) {
        const re = new RegExp(`\\b${word}\\b`, 'i');
        expect(re.test(cleaned), `Found leaked English word "${word}" on ${path}`).toBe(false);
      }
    });
  }
});
