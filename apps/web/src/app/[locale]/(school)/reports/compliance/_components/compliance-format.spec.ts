import type { ComplianceField } from '@school/shared/reports';

import {
  countComplianceGaps,
  formatComplianceValue,
  relativeTimeFromIso,
} from './compliance-format';

const baseField: Omit<ComplianceField, 'key' | 'value' | 'unit'> = {
  label_key: 'compliance.field.example',
  source: 'students.count',
  last_verified_at: '2026-04-25T00:00:00.000Z',
  has_gap: false,
};

const field = (overrides: Partial<ComplianceField>): ComplianceField =>
  ({
    key: 'student_headcount',
    value: null,
    unit: 'count',
    ...baseField,
    ...overrides,
  }) as ComplianceField;

describe('formatComplianceValue', () => {
  it('returns em-dash for null', () => {
    expect(formatComplianceValue(field({ value: null }))).toBe('—');
  });

  it('formats currency with 2dp (no symbol — the tenant supplies it)', () => {
    expect(formatComplianceValue(field({ value: 34601.01, unit: 'currency' }))).toMatch(
      /34,?601\.01/,
    );
  });

  it('formats percent with 1dp + suffix', () => {
    expect(formatComplianceValue(field({ value: 99.876, unit: 'percent' }))).toBe('99.9%');
  });

  it('formats ratio as 1 : N', () => {
    expect(formatComplianceValue(field({ value: 13.7, unit: 'ratio' }))).toBe('1 : 13.7');
  });

  it('formats hours with localised count and h suffix', () => {
    expect(formatComplianceValue(field({ value: 1450, unit: 'hours' }))).toMatch(/1,?450 h/);
  });

  it('formats counts with locale separator', () => {
    expect(formatComplianceValue(field({ value: 1250, unit: 'count' }))).toMatch(/1,?250/);
  });

  it('passes through strings', () => {
    expect(formatComplianceValue(field({ value: 'opt-in', unit: null }))).toBe('opt-in');
  });
});

describe('countComplianceGaps', () => {
  it('returns 0 when no gaps', () => {
    const rows = [field({ value: 1, has_gap: false }), field({ value: 2, has_gap: false })];
    expect(countComplianceGaps(rows)).toBe(0);
  });

  it('counts only has_gap=true rows', () => {
    const rows = [
      field({ value: 1, has_gap: false }),
      field({ value: null, has_gap: true }),
      field({ value: null, has_gap: true }),
      field({ value: 3, has_gap: false }),
    ];
    expect(countComplianceGaps(rows)).toBe(2);
  });

  it('returns 0 for empty list', () => {
    expect(countComplianceGaps([])).toBe(0);
  });
});

describe('relativeTimeFromIso', () => {
  // Use a fixed now for stable tests.
  const NOW = new Date('2026-04-25T12:00:00.000Z').getTime();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  it('shows seconds for very-recent timestamps', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(relativeTimeFromIso(iso, formatter, NOW)).toMatch(/second/);
  });

  it('shows minutes for sub-hour deltas', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(relativeTimeFromIso(iso, formatter, NOW)).toMatch(/minute/);
  });

  it('shows hours for sub-day deltas', () => {
    const iso = new Date(NOW - 5 * 3_600_000).toISOString();
    expect(relativeTimeFromIso(iso, formatter, NOW)).toMatch(/hour/);
  });

  it('shows days for sub-month deltas', () => {
    const iso = new Date(NOW - 7 * 86_400_000).toISOString();
    expect(relativeTimeFromIso(iso, formatter, NOW)).toMatch(/day/);
  });

  it('falls back to a date string for older timestamps', () => {
    const iso = new Date(NOW - 60 * 86_400_000).toISOString();
    const result = relativeTimeFromIso(iso, formatter, NOW);
    // Locale-dependent — just confirm it's not a relative phrase.
    expect(result).not.toMatch(/ago|in /);
  });

  it('returns the raw input for invalid ISO', () => {
    expect(relativeTimeFromIso('not-a-date', formatter, NOW)).toBe('not-a-date');
  });
});
