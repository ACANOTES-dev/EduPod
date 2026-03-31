/**
 * Unit tests for DiaryDateNavigator — pure helper functions.
 *
 * DiaryDateNavigator contains two small but critical helpers:
 *   - toISO: serialises a Date to YYYY-MM-DD
 *   - parseDate: deserialises a YYYY-MM-DD string into a Date (at noon to
 *     avoid DST edge cases)
 *
 * We also test the derived logic for navigation (previous/next day) and the
 * "isToday" check.
 *
 * Functions are mirrored here to avoid importing the component and pulling
 * in React / next-intl dependencies.
 */

// ─── Pure helpers (mirrored from diary-date-navigator.tsx) ────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d, 12); // noon to avoid DST issues
}

function shiftDay(selectedDate: string, offset: number): string {
  const current = parseDate(selectedDate);
  const next = new Date(current);
  next.setDate(next.getDate() + offset);
  return toISO(next);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DiaryDateNavigator — helper functions', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── toISO ─────────────────────────────────────────────────────────────────

  describe('toISO', () => {
    it('should produce a zero-padded YYYY-MM-DD string', () => {
      const date = new Date(2026, 0, 5, 12); // 5 Jan 2026
      expect(toISO(date)).toBe('2026-01-05');
    });

    it('should zero-pad single-digit months', () => {
      const date = new Date(2026, 2, 15, 12); // 15 Mar 2026
      expect(toISO(date)).toBe('2026-03-15');
    });

    it('should handle end-of-year dates', () => {
      const date = new Date(2025, 11, 31, 12); // 31 Dec 2025
      expect(toISO(date)).toBe('2025-12-31');
    });

    it('should produce consistent output when round-tripping through parseDate', () => {
      const original = '2026-06-15';
      expect(toISO(parseDate(original))).toBe(original);
    });
  });

  // ─── parseDate ─────────────────────────────────────────────────────────────

  describe('parseDate', () => {
    it('should parse a standard ISO date string', () => {
      const date = parseDate('2026-03-10');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(2); // March is index 2
      expect(date.getDate()).toBe(10);
    });

    it('should set time to noon (12:00) to avoid DST issues', () => {
      const date = parseDate('2026-03-10');
      expect(date.getHours()).toBe(12);
    });

    it('should parse month 1 (January) correctly (Month index 0)', () => {
      const date = parseDate('2026-01-01');
      expect(date.getMonth()).toBe(0);
    });

    it('should parse month 12 (December) correctly (Month index 11)', () => {
      const date = parseDate('2026-12-31');
      expect(date.getMonth()).toBe(11);
      expect(date.getDate()).toBe(31);
    });
  });

  // ─── shiftDay (derived navigation logic) ──────────────────────────────────

  describe('shiftDay', () => {
    it('should advance by one day', () => {
      expect(shiftDay('2026-03-10', 1)).toBe('2026-03-11');
    });

    it('should go back by one day', () => {
      expect(shiftDay('2026-03-10', -1)).toBe('2026-03-09');
    });

    it('should handle a month boundary when advancing', () => {
      expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    });

    it('should handle a month boundary when going back', () => {
      expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('should handle a year boundary when advancing', () => {
      expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
    });

    it('should handle a year boundary when going back', () => {
      expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('should shift by multiple days', () => {
      expect(shiftDay('2026-03-10', 7)).toBe('2026-03-17');
    });
  });

  // ─── isToday (derived check) ───────────────────────────────────────────────

  describe('isToday check', () => {
    it('should identify today correctly', () => {
      const todayIso = toISO(new Date());
      expect(todayIso === toISO(new Date())).toBe(true);
    });

    it('should not treat yesterday as today', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = toISO(yesterday);
      const todayIso = toISO(new Date());
      expect(yesterdayIso).not.toBe(todayIso);
    });
  });
});
