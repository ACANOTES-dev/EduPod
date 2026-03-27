// ─── Cookie Consent Utility ───────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

export const CONSENT_COOKIE_NAME = 'cookie_consent';
export const CONSENT_EXPIRY_DAYS = 180;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsentCategories {
  /** Always true — required for site functionality */
  essential: true;
  /** Sentry replay, analytics — toggleable, default false */
  analytics: boolean;
}

export interface StoredConsent {
  categories: ConsentCategories;
  /** ISO 8601 timestamp of when consent was given */
  consentedAt: string;
}

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

function parseCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split('=').slice(1).join('='));
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `expires=${expires.toUTCString()}`,
    'path=/',
    'SameSite=Lax',
  ].join('; ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads current consent state from the cookie.
 * Returns null if no consent cookie exists or if it cannot be parsed.
 */
export function getConsent(): StoredConsent | null {
  const raw = parseCookie(CONSENT_COOKIE_NAME);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'categories' in parsed &&
      'consentedAt' in parsed
    ) {
      return parsed as StoredConsent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes consent cookie and dispatches `cookie-consent-changed` custom event.
 */
export function setConsent(categories: ConsentCategories): void {
  const stored: StoredConsent = {
    categories,
    consentedAt: new Date().toISOString(),
  };
  writeCookie(CONSENT_COOKIE_NAME, JSON.stringify(stored), CONSENT_EXPIRY_DAYS);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cookie-consent-changed', { detail: categories }),
    );
  }
}

/**
 * Checks whether the stored consent is older than CONSENT_EXPIRY_DAYS.
 * Returns true if expired or if no consent exists.
 */
export function hasConsentExpired(): boolean {
  const consent = getConsent();
  if (!consent) return true;

  const consentDate = new Date(consent.consentedAt);
  const now = new Date();
  const diffMs = now.getTime() - consentDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= CONSENT_EXPIRY_DAYS;
}
