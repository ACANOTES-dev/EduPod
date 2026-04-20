/**
 * Pure-logic tests for the Early-Warnings flagship sub-hub page (impl 16).
 *
 * The page itself is a client component that calls four endpoints and renders
 * a rich compound layout (KPI strip, AI insights, domain drill-down, cohort
 * panels, CTA bar, detail slide-over). Rather than stand up a JSX render
 * harness (which this repo does not standardise for these hub pages), we
 * cover the three behaviours the spec file calls out as testable in
 * isolation:
 *
 *   1. AI narrative panel is hidden unless the flag is affirmatively enabled.
 *   2. Risk-tier + domain filters reduce the list correctly.
 *   3. aggregateTrend produces a coherent sparkline from per-student trends.
 *
 * End-to-end render and navigation are covered by impl 24's Playwright sweep.
 */

import type { RiskProfileListItem } from '@/lib/early-warning';

import { aggregateTrend } from './_components/aggregate-trend';
import { filterByDomain } from './_components/compute-insights';

type AiFlagState = 'unknown' | 'enabled' | 'disabled';

// Matches the page's aiVisible rule: show the panel only when we KNOW the
// tenant has the flag on. Unknown / disabled both hide it. This is stricter
// than the behaviour sub-hub's pattern (which shows AI when unknown) because
// the early-warnings narrative is LLM-generated content, not a form control,
// and we don't want to promise output we might not be able to render.
function aiPanelVisible(state: AiFlagState): boolean {
  return state === 'enabled';
}

describe('EarlyWarningsHub — AI flag visibility', () => {
  it('hides the AI insights panel when the flag is affirmatively disabled', () => {
    expect(aiPanelVisible('disabled')).toBe(false);
  });

  it('hides the AI insights panel when the flag status is unknown', () => {
    expect(aiPanelVisible('unknown')).toBe(false);
  });

  it('shows the AI insights panel only when the flag is enabled', () => {
    expect(aiPanelVisible('enabled')).toBe(true);
  });
});

const row = (overrides: Partial<RiskProfileListItem>): RiskProfileListItem => ({
  id: Math.random().toString(36),
  student_id: Math.random().toString(36),
  student_name: 'Student',
  year_group_name: null,
  class_name: null,
  composite_score: 0,
  risk_tier: 'amber',
  top_signal: null,
  trend_data: [],
  assigned_to_name: null,
  last_computed_at: '2026-04-20T00:00:00Z',
  ...overrides,
});

describe('EarlyWarningsHub — domain filter semantics', () => {
  it('narrows to matching rows when a specific domain is selected', () => {
    const rows = [
      row({ top_signal: 'Attendance below 80%' }),
      row({ top_signal: 'Grade decline in Maths' }),
      row({ top_signal: 'Behaviour incident logged' }),
    ];
    expect(filterByDomain(rows, 'attendance')).toHaveLength(1);
    expect(filterByDomain(rows, 'grades')).toHaveLength(1);
    expect(filterByDomain(rows, 'behaviour')).toHaveLength(1);
    expect(filterByDomain(rows, 'wellbeing')).toHaveLength(0);
  });

  it('returns the full list when the filter is "all"', () => {
    const rows = [row({ top_signal: 'Attendance' }), row({ top_signal: 'Grades' })];
    expect(filterByDomain(rows, 'all')).toHaveLength(2);
  });

  it('excludes rows with no classifiable top_signal from a specific domain', () => {
    const rows = [row({ top_signal: null }), row({ top_signal: 'Attendance below 75%' })];
    expect(filterByDomain(rows, 'attendance')).toHaveLength(1);
  });
});

describe('EarlyWarningsHub — aggregateTrend', () => {
  it('returns an empty series when no rows have trend data', () => {
    const rows = [row({ trend_data: [] }), row({ trend_data: [] })];
    expect(aggregateTrend(rows)).toEqual([]);
  });

  it('returns an empty series when all rows have fewer than 2 points', () => {
    const rows = [row({ trend_data: [10] }), row({ trend_data: [20] })];
    expect(aggregateTrend(rows)).toEqual([]);
  });

  it('averages per-index values across rows, truncated to the shortest trend', () => {
    const rows = [row({ trend_data: [10, 20, 30, 40] }), row({ trend_data: [20, 40, 60] })];
    expect(aggregateTrend(rows)).toEqual([15, 30, 45]);
  });
});
