import type { RiskProfileListItem } from '@/lib/early-warning';

import {
  computeInsights,
  filterByDomain,
  groupByYearTier,
  topClassesByAtRisk,
} from './compute-insights';

const base: Omit<RiskProfileListItem, 'id' | 'student_id' | 'student_name' | 'risk_tier'> = {
  year_group_name: null,
  class_name: null,
  composite_score: 0,
  top_signal: null,
  trend_data: [],
  assigned_to_name: 'Someone',
  last_computed_at: '2026-04-20T00:00:00Z',
};

const row = (overrides: Partial<RiskProfileListItem>): RiskProfileListItem => ({
  ...base,
  id: Math.random().toString(36),
  student_id: Math.random().toString(36),
  student_name: 'Student',
  risk_tier: 'green',
  ...overrides,
});

describe('computeInsights', () => {
  it('returns zeros when no rows are flagged', () => {
    const result = computeInsights([row({ risk_tier: 'green' }), row({ risk_tier: 'yellow' })]);
    expect(result.flagged_total).toBe(0);
    expect(result.red_total).toBe(0);
    expect(result.amber_total).toBe(0);
    expect(result.themes).toEqual([]);
  });

  it('counts red and amber separately', () => {
    const result = computeInsights([
      row({ risk_tier: 'red' }),
      row({ risk_tier: 'red' }),
      row({ risk_tier: 'amber' }),
    ]);
    expect(result.flagged_total).toBe(3);
    expect(result.red_total).toBe(2);
    expect(result.amber_total).toBe(1);
  });

  it('surfaces year-group concentration when >= 40% sit in one year', () => {
    const rows = [
      row({ risk_tier: 'amber', year_group_name: 'Year 5' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 5' }),
      row({ risk_tier: 'red', year_group_name: 'Year 5' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 7' }),
    ];
    const result = computeInsights(rows);
    expect(result.themes.map((t) => t.key)).toContain('concentrated_year_group');
    const theme = result.themes.find((t) => t.key === 'concentrated_year_group');
    expect(theme?.params.year_group).toBe('Year 5');
    expect(theme?.params.count).toBe(3);
  });

  it('flags dominant indicator domain from top signals', () => {
    const rows = [
      row({ risk_tier: 'amber', top_signal: 'Attendance below 80%' }),
      row({ risk_tier: 'amber', top_signal: 'Attendance below 75%' }),
      row({ risk_tier: 'amber', top_signal: 'Attendance below 85%' }),
      row({ risk_tier: 'red', top_signal: 'Grade drop in Maths' }),
    ];
    const result = computeInsights(rows);
    const theme = result.themes.find((t) => t.key === 'dominant_domain');
    expect(theme?.params.domain).toBe('attendance');
  });

  it('flags unassigned reds as an operational theme', () => {
    const rows = [
      row({ risk_tier: 'red', assigned_to_name: null }),
      row({ risk_tier: 'red', assigned_to_name: null }),
      row({ risk_tier: 'red', assigned_to_name: 'Mrs Keane' }),
    ];
    const result = computeInsights(rows);
    const theme = result.themes.find((t) => t.key === 'unassigned_reds');
    expect(theme).toBeDefined();
    expect(theme?.params.count).toBe(2);
  });

  it('caps themes at 3 and sorts by weight descending', () => {
    const rows = [
      row({
        risk_tier: 'amber',
        year_group_name: 'Year 5',
        class_name: '5A',
        top_signal: 'Attendance',
        trend_data: [10, 20, 30, 40, 50],
      }),
      row({
        risk_tier: 'amber',
        year_group_name: 'Year 5',
        class_name: '5A',
        top_signal: 'Attendance',
        trend_data: [10, 20, 30, 40, 50],
      }),
      row({
        risk_tier: 'amber',
        year_group_name: 'Year 5',
        class_name: '5A',
        top_signal: 'Attendance',
        trend_data: [10, 20, 30, 40, 50],
      }),
      row({
        risk_tier: 'red',
        year_group_name: 'Year 5',
        class_name: '5A',
        top_signal: 'Attendance',
        trend_data: [10, 20, 30, 40, 50],
        assigned_to_name: null,
      }),
      row({
        risk_tier: 'red',
        year_group_name: 'Year 5',
        class_name: '5A',
        top_signal: 'Attendance',
        trend_data: [10, 20, 30, 40, 50],
        assigned_to_name: null,
      }),
    ];
    const result = computeInsights(rows);
    expect(result.themes.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.themes.length; i += 1) {
      const prev = result.themes[i - 1];
      const curr = result.themes[i];
      if (!prev || !curr) continue;
      expect(prev.weight).toBeGreaterThanOrEqual(curr.weight);
    }
  });
});

describe('filterByDomain', () => {
  it('returns all rows when domain is "all"', () => {
    const rows = [row({ top_signal: 'Attendance' }), row({ top_signal: 'Grades' })];
    expect(filterByDomain(rows, 'all')).toHaveLength(2);
  });

  it('returns only matching rows for a specific domain', () => {
    const rows = [
      row({ top_signal: 'Attendance below 80%' }),
      row({ top_signal: 'Grade drop' }),
      row({ top_signal: 'Behaviour incident' }),
    ];
    expect(filterByDomain(rows, 'attendance')).toHaveLength(1);
    expect(filterByDomain(rows, 'grades')).toHaveLength(1);
    expect(filterByDomain(rows, 'behaviour')).toHaveLength(1);
    expect(filterByDomain(rows, 'wellbeing')).toHaveLength(0);
  });
});

describe('groupByYearTier', () => {
  it('groups flagged rows by year with red/amber split', () => {
    const rows = [
      row({ risk_tier: 'red', year_group_name: 'Year 5' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 5' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 7' }),
      row({ risk_tier: 'green', year_group_name: 'Year 5' }),
    ];
    const result = groupByYearTier(rows);
    const year5 = result.find((r) => r.year_group === 'Year 5');
    expect(year5).toEqual({ year_group: 'Year 5', red: 1, amber: 1, total: 2 });
    expect(result).toHaveLength(2);
  });

  it('sorts by total descending', () => {
    const rows = [
      row({ risk_tier: 'amber', year_group_name: 'Year 7' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 5' }),
      row({ risk_tier: 'amber', year_group_name: 'Year 5' }),
    ];
    const result = groupByYearTier(rows);
    expect(result[0]?.year_group).toBe('Year 5');
  });
});

describe('topClassesByAtRisk', () => {
  it('returns top classes by at-risk count', () => {
    const rows = [
      row({ risk_tier: 'amber', class_name: '5A' }),
      row({ risk_tier: 'amber', class_name: '5A' }),
      row({ risk_tier: 'red', class_name: '5A' }),
      row({ risk_tier: 'amber', class_name: '7B' }),
    ];
    const result = topClassesByAtRisk(rows);
    expect(result[0]).toEqual({ class_name: '5A', year_group: null, at_risk: 3 });
    expect(result[1]).toEqual({ class_name: '7B', year_group: null, at_risk: 1 });
  });

  it('respects the limit parameter', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ risk_tier: 'amber', class_name: `Class-${i}` }),
    );
    expect(topClassesByAtRisk(rows, 5)).toHaveLength(5);
  });
});
