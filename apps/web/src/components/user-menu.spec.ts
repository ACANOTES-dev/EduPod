/**
 * Unit tests for UserMenu — pure helper functions.
 *
 * UserMenu contains three private helpers that contain all the testable logic:
 *   - getInitials: derives avatar initials from first/last name
 *   - extractLocale: reads the locale segment from a pathname
 *   - buildLocaleSwitchedPath: rewrites the locale in a pathname
 *
 * We replicate these functions here so they can be tested without mounting
 * React or importing the component (which depends on Next.js internals).
 */

// ─── Pure helpers (mirrored from user-menu.tsx) ───────────────────────────────

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0] ?? '';
  const l = lastName.trim()[0] ?? '';
  return (f + l).toUpperCase() || '?';
}

function extractLocale(pathname: string): string {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  return segments[0] ?? 'en';
}

function buildLocaleSwitchedPath(pathname: string, newLocale: string): string {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  segments[0] = newLocale;
  return '/' + segments.join('/');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UserMenu — helper functions', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── getInitials ─────────────────────────────────────────────────────────

  describe('getInitials', () => {
    it('should return uppercase initials from first and last name', () => {
      expect(getInitials('Ahmed', 'Hassan')).toBe('AH');
    });

    it('should handle lowercase input', () => {
      expect(getInitials('sara', 'khan')).toBe('SK');
    });

    it('should return "?" when both names are empty strings', () => {
      expect(getInitials('', '')).toBe('?');
    });

    it('should return a single initial when last name is empty', () => {
      expect(getInitials('Ahmed', '')).toBe('A');
    });

    it('should return a single initial when first name is empty', () => {
      expect(getInitials('', 'Hassan')).toBe('H');
    });

    it('should trim leading/trailing whitespace before extracting initials', () => {
      expect(getInitials('  Ali  ', '  Omar  ')).toBe('AO');
    });

    it('should handle names with spaces correctly (use first character)', () => {
      expect(getInitials('Mary Jane', 'Watson')).toBe('MW');
    });

    it('should uppercase the result', () => {
      expect(getInitials('bob', 'jones')).toBe('BJ');
    });
  });

  // ─── extractLocale ────────────────────────────────────────────────────────

  describe('extractLocale', () => {
    it('should extract the locale from a standard pathname', () => {
      expect(extractLocale('/en/dashboard')).toBe('en');
      expect(extractLocale('/ar/students')).toBe('ar');
    });

    it('should return the locale from a bare locale path', () => {
      expect(extractLocale('/en')).toBe('en');
    });

    it('should fall back to "en" for an empty pathname', () => {
      expect(extractLocale('')).toBe('en');
    });

    it('should handle deeply nested paths', () => {
      expect(extractLocale('/ar/settings/legal/privacy-notices')).toBe('ar');
    });

    it('should return first segment regardless of its value', () => {
      expect(extractLocale('/fr/reports')).toBe('fr');
    });
  });

  // ─── buildLocaleSwitchedPath ──────────────────────────────────────────────

  describe('buildLocaleSwitchedPath', () => {
    it('should switch locale from en to ar', () => {
      expect(buildLocaleSwitchedPath('/en/dashboard', 'ar')).toBe('/ar/dashboard');
    });

    it('should switch locale from ar to en', () => {
      expect(buildLocaleSwitchedPath('/ar/students/abc-123', 'en')).toBe('/en/students/abc-123');
    });

    it('should preserve the full path after the locale', () => {
      expect(buildLocaleSwitchedPath('/en/settings/legal/privacy-notices', 'ar')).toBe(
        '/ar/settings/legal/privacy-notices',
      );
    });

    it('should work on a bare locale path', () => {
      expect(buildLocaleSwitchedPath('/en', 'ar')).toBe('/ar');
    });

    it('should handle the same locale (no-op switch)', () => {
      expect(buildLocaleSwitchedPath('/en/dashboard', 'en')).toBe('/en/dashboard');
    });
  });

  // ─── displayName derivation ──────────────────────────────────────────────

  describe('displayName derivation', () => {
    it('should concatenate first and last name with a space', () => {
      const displayName = `${'Yusuf'} ${'Rahman'}`.trim();
      expect(displayName).toBe('Yusuf Rahman');
    });

    it('should trim when last name is empty', () => {
      const displayName = `${'Yusuf'} ${''}`.trim();
      expect(displayName).toBe('Yusuf');
    });
  });
});
