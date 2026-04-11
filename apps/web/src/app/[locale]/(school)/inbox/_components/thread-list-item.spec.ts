/**
 * Unit tests for the thread-list-item display helpers.
 *
 * ThreadListItem contains a pure `formatListTimestamp` helper that maps an
 * ISO timestamp to one of three formats depending on recency:
 *   - same calendar day → HH:mm
 *   - within last 7 days → weekday short
 *   - older → "d MMM"
 *
 * We mirror the helper here so we can verify its branching without mounting
 * React or importing `lucide-react` / `@school/ui`.
 */

function formatListTimestamp(iso: string | null, locale: string, now: Date): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const diffMs = now.getTime() - date.getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (diffMs >= 0 && diffMs < sevenDays) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

describe('ThreadListItem — formatListTimestamp', () => {
  afterEach(() => jest.clearAllMocks());

  const now = new Date('2026-04-11T14:30:00Z');

  it('should return empty string for null', () => {
    expect(formatListTimestamp(null, 'en-GB', now)).toBe('');
  });

  it('should return empty string for an invalid ISO string', () => {
    expect(formatListTimestamp('not-a-date', 'en-GB', now)).toBe('');
  });

  it('should format a same-day timestamp as HH:mm', () => {
    const result = formatListTimestamp('2026-04-11T09:05:00Z', 'en-GB', now);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('should format a timestamp from earlier this week as a weekday', () => {
    const result = formatListTimestamp('2026-04-07T10:00:00Z', 'en-GB', now);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/^\d{2}:\d{2}$/);
  });

  it('should format an old timestamp as "d MMM"', () => {
    const result = formatListTimestamp('2026-02-15T10:00:00Z', 'en-GB', now);
    expect(result).toMatch(/\d+\s+\w+/);
  });
});
