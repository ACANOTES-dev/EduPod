/**
 * @jest-environment node
 */

// ─── Global Mocks ─────────────────────────────────────────────────────────────
// The cookie-consent module checks `typeof document` / `typeof window` at
// runtime.  In Node there is no DOM, so we polyfill the minimal surface the
// module needs: document.cookie (get/set), window.dispatchEvent, CustomEvent,
// and location.protocol.

let cookieStore = '';

// Minimal document mock — only cookie get/set
const documentMock = {
  get cookie(): string {
    return cookieStore;
  },
  set cookie(value: string) {
    const name = value.split('=')[0] ?? '';
    const existing = cookieStore
      .split('; ')
      .filter((c) => c && !c.startsWith(`${name}=`));
    existing.push(value.split(';')[0] ?? '');
    cookieStore = existing.filter(Boolean).join('; ');
  },
};

// Minimal window mock — dispatchEvent only
const dispatchEventMock = jest.fn();
const windowMock = { dispatchEvent: dispatchEventMock };

// CustomEvent polyfill for Node
class CustomEventPolyfill extends Event {
  readonly detail: unknown;
  constructor(type: string, params?: { detail?: unknown }) {
    super(type);
    this.detail = params?.detail;
  }
}

// location mock — http by default (Secure flag not added)
const locationMock = { protocol: 'http:' };

// Install globals before module import
Object.defineProperty(globalThis, 'document', { value: documentMock, writable: true, configurable: true });
Object.defineProperty(globalThis, 'window', { value: windowMock, writable: true, configurable: true });
Object.defineProperty(globalThis, 'CustomEvent', { value: CustomEventPolyfill, writable: true, configurable: true });
Object.defineProperty(globalThis, 'location', { value: locationMock, writable: true, configurable: true });

// ─── Module Under Test ────────────────────────────────────────────────────────

import {
  CONSENT_COOKIE_NAME,
  getConsent,
  hasConsentExpired,
  setConsent,
} from './cookie-consent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConsentCookie(
  categories: { essential: true; analytics: boolean },
  consentedAt: string,
): string {
  const stored = { categories, consentedAt };
  return `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(stored))}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('cookie-consent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    cookieStore = '';
    dispatchEventMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ─── getConsent ───────────────────────────────────────────────────────────

  describe('getConsent', () => {
    it('should return null when no cookie is set', () => {
      expect(getConsent()).toBeNull();
    });

    it('should parse a valid consent cookie', () => {
      const consentedAt = '2026-01-15T10:00:00.000Z';
      cookieStore = buildConsentCookie({ essential: true, analytics: true }, consentedAt);

      const result = getConsent();

      expect(result).toEqual({
        categories: { essential: true, analytics: true },
        consentedAt,
      });
    });

    it('should return null for a malformed cookie value', () => {
      cookieStore = `${CONSENT_COOKIE_NAME}=${encodeURIComponent('not-valid-json')}`;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = getConsent();

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        '[cookie-consent] Failed to parse consent cookie:',
        expect.any(SyntaxError),
      );
    });
  });

  // ─── setConsent ───────────────────────────────────────────────────────────

  describe('setConsent', () => {
    it('should write cookie and dispatch event', () => {
      jest.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));

      setConsent({ essential: true, analytics: true });

      // Verify cookie was written
      const consent = getConsent();
      expect(consent).not.toBeNull();
      expect(consent?.categories).toEqual({ essential: true, analytics: true });
      expect(consent?.consentedAt).toBe('2026-03-27T12:00:00.000Z');

      // Verify event was dispatched
      expect(dispatchEventMock).toHaveBeenCalledTimes(1);
      const event = dispatchEventMock.mock.calls[0][0] as CustomEventPolyfill;
      expect(event.type).toBe('cookie-consent-changed');
      expect(event.detail).toEqual({ essential: true, analytics: true });
    });
  });

  // ─── hasConsentExpired ────────────────────────────────────────────────────

  describe('hasConsentExpired', () => {
    it('should return true when no consent exists', () => {
      expect(hasConsentExpired()).toBe(true);
    });

    it('should return false for recent consent', () => {
      jest.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));
      // Consent given 10 days ago
      const tenDaysAgo = new Date('2026-03-17T12:00:00.000Z').toISOString();
      cookieStore = buildConsentCookie({ essential: true, analytics: false }, tenDaysAgo);

      expect(hasConsentExpired()).toBe(false);
    });

    it('should return true for consent older than 180 days', () => {
      jest.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));
      // Consent given 200 days ago
      const twoHundredDaysAgo = new Date('2025-09-08T12:00:00.000Z').toISOString();
      cookieStore = buildConsentCookie({ essential: true, analytics: true }, twoHundredDaysAgo);

      expect(hasConsentExpired()).toBe(true);
    });
  });
});
