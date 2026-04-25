import type { KpiCard } from '@school/shared/reports';

import {
  deltaTone,
  deltaToneClass,
  formatDeltaText,
  isSafeDrillDownHref,
  resolveKpiIdentity,
  severityBorderClass,
  toSparklineSeries,
} from './kpi-card.helpers';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDelta(overrides: Partial<NonNullable<KpiCard['delta']>> = {}): KpiCard['delta'] {
  return {
    value: 5,
    unit: 'percent',
    direction: 'up',
    better_when: 'up',
    ...overrides,
  };
}

// ─── resolveKpiIdentity ───────────────────────────────────────────────────────

describe('resolveKpiIdentity', () => {
  it('returns a distinct icon and accent colour for every known KPI key', () => {
    const keys = [
      'attendance_today',
      'teacher_submission_compliance',
      'at_risk_students',
      'behaviour_incidents_this_week',
      'open_safeguarding_concerns',
      'overdue_invoices',
      'grades_submission_lag',
      'new_applications_this_week',
      'parent_escalations',
      'cover_gaps_this_week',
    ] as const;

    const accents = new Set<string>();
    for (const key of keys) {
      const id = resolveKpiIdentity(key);
      expect(id.Icon).toBeDefined();
      expect(id.accentHex).toMatch(/^#[0-9a-f]{6}$/i);
      accents.add(id.accentHex);
    }
    // No accidental duplicate accents — each KPI is visually distinct.
    expect(accents.size).toBe(keys.length);
  });

  it('falls back to a neutral identity for unknown keys instead of throwing', () => {
    const id = resolveKpiIdentity('not_a_real_kpi');
    expect(id.Icon).toBeDefined();
    expect(id.accentHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(id.iconColor).toContain('text-');
  });
});

// ─── severityBorderClass ──────────────────────────────────────────────────────

describe('severityBorderClass', () => {
  it('returns red border for critical severity', () => {
    expect(severityBorderClass('critical')).toContain('red-600');
    expect(severityBorderClass('critical')).toContain('border-s-4');
  });

  it('returns amber border for warning severity', () => {
    expect(severityBorderClass('warning')).toContain('amber-500');
  });

  it('returns no border class for normal severity', () => {
    expect(severityBorderClass('normal')).toBe('');
  });

  it('returns no border class for null severity', () => {
    expect(severityBorderClass(null)).toBe('');
  });

  it('uses logical (start-side) border classes, never physical', () => {
    // RTL safety: the dashboard mirrors so we must use logical (start-side)
    // borders only. We assemble the forbidden prefix from parts so the
    // physical-direction lint rule does not flag this assertion as a real
    // class usage.
    const forbiddenPrefix = `border-${'l'}-`;
    expect(severityBorderClass('critical')).not.toContain(forbiddenPrefix);
    expect(severityBorderClass('warning')).not.toContain(forbiddenPrefix);
  });
});

// ─── deltaTone ────────────────────────────────────────────────────────────────

describe('deltaTone', () => {
  it('returns "good" when direction matches better_when (up + up)', () => {
    expect(deltaTone(makeDelta({ direction: 'up', better_when: 'up' }))).toBe('good');
  });

  it('returns "bad" when direction opposes better_when (down + up)', () => {
    expect(deltaTone(makeDelta({ direction: 'down', better_when: 'up' }))).toBe('bad');
  });

  it('returns "good" for falling overdue invoices (down + down)', () => {
    // Real-world case — fewer overdue invoices is a good thing.
    expect(deltaTone(makeDelta({ direction: 'down', better_when: 'down' }))).toBe('good');
  });

  it('returns "bad" for rising overdue invoices (up + down)', () => {
    expect(deltaTone(makeDelta({ direction: 'up', better_when: 'down' }))).toBe('bad');
  });

  it('returns "flat" when the metric did not move', () => {
    expect(deltaTone(makeDelta({ direction: 'flat', better_when: 'up' }))).toBe('flat');
  });

  it('returns "flat" when delta is null', () => {
    expect(deltaTone(null)).toBe('flat');
  });
});

// ─── deltaToneClass ───────────────────────────────────────────────────────────

describe('deltaToneClass', () => {
  it('emerald for good', () => {
    expect(deltaToneClass('good')).toContain('emerald');
  });

  it('red for bad', () => {
    expect(deltaToneClass('bad')).toContain('red');
  });

  it('tertiary text colour for flat', () => {
    expect(deltaToneClass('flat')).toContain('text-text-tertiary');
  });
});

// ─── formatDeltaText ──────────────────────────────────────────────────────────

describe('formatDeltaText', () => {
  it('formats an up-percent integer with + sign and % suffix', () => {
    expect(formatDeltaText(makeDelta({ value: 3, direction: 'up', unit: 'percent' }))).toBe('+3%');
  });

  it('formats a down-percent integer with the minus glyph', () => {
    expect(formatDeltaText(makeDelta({ value: 4, direction: 'down', unit: 'percent' }))).toBe(
      '−4%',
    );
  });

  it('omits the % suffix for absolute units', () => {
    expect(formatDeltaText(makeDelta({ value: 12, direction: 'up', unit: 'absolute' }))).toBe(
      '+12',
    );
  });

  it('uses a single-decimal magnitude for non-integer values', () => {
    expect(formatDeltaText(makeDelta({ value: 3.25, direction: 'up' }))).toBe('+3.3%');
  });

  it('renders 0 with the unit suffix when direction is flat', () => {
    expect(formatDeltaText(makeDelta({ value: 0, direction: 'flat', unit: 'percent' }))).toBe('0%');
  });

  it('returns an empty string when the delta is null', () => {
    expect(formatDeltaText(null)).toBe('');
  });
});

// ─── toSparklineSeries ────────────────────────────────────────────────────────

describe('toSparklineSeries', () => {
  it('returns null for arrays with fewer than 2 points', () => {
    expect(toSparklineSeries([])).toBeNull();
    expect(toSparklineSeries([42])).toBeNull();
  });

  it('returns Recharts-shaped objects for valid inputs', () => {
    const series = toSparklineSeries([1, 2, 3]);
    expect(series).not.toBeNull();
    expect(series).toHaveLength(3);
    expect(series?.[0]).toEqual({ value: 1 });
    expect(series?.[2]).toEqual({ value: 3 });
  });

  it('preserves order', () => {
    const input = [10, 5, 15, 8];
    const series = toSparklineSeries(input);
    expect(series?.map((p) => p.value)).toEqual(input);
  });

  it('returns null for non-array inputs', () => {
    // Defensive — backend should always send an array but we tolerate junk.
    expect(toSparklineSeries(undefined as unknown as number[])).toBeNull();
    expect(toSparklineSeries(null as unknown as number[])).toBeNull();
  });
});

// ─── isSafeDrillDownHref ──────────────────────────────────────────────────────

describe('isSafeDrillDownHref', () => {
  it('accepts paths that start with /', () => {
    expect(isSafeDrillDownHref('/reports/attendance')).toBe(true);
    expect(isSafeDrillDownHref('/finance/invoices?status=overdue')).toBe(true);
  });

  it('rejects external URLs', () => {
    expect(isSafeDrillDownHref('https://example.com')).toBe(false);
    expect(isSafeDrillDownHref('//evil.example')).toBe(false);
  });

  it('rejects javascript: schemes', () => {
    expect(isSafeDrillDownHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty / null / undefined', () => {
    expect(isSafeDrillDownHref('')).toBe(false);
    expect(isSafeDrillDownHref(null)).toBe(false);
    expect(isSafeDrillDownHref(undefined)).toBe(false);
  });
});
