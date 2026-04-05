import type { PdfBranding } from '../pdf-rendering.service';

import { renderSstActivityEn } from './sst-activity-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const SST_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  cases_opened: 12,
  cases_closed: 8,
  cases_by_severity: {
    high: 3,
    medium: 5,
    low: 4,
  },
  avg_resolution_days: 14.5,
  concern_volume: {
    total: 45,
    by_category: {
      Behavioural: 20,
      Academic: 15,
      Emotional: 10,
    },
    by_severity: {
      high: 8,
      medium: 22,
      low: 15,
    },
    weekly_trend: [
      { week: '2025-W36', count: 5 },
      { week: '2025-W37', count: 8 },
      { week: '2025-W38', count: 3 },
    ],
  },
  intervention_outcomes: {
    achieved: 10,
    partially_achieved: 5,
    not_achieved: 2,
    escalated: 1,
    in_progress: 7,
  },
  action_completion_rate: 78.5,
  overdue_actions: 3,
  by_year_group: [
    {
      year_group_name: 'Year 7',
      student_count: 25,
      concern_count: 15,
      concerns_per_student: 0.6,
    },
    {
      year_group_name: 'Year 8',
      student_count: 30,
      concern_count: 10,
      concerns_per_student: 0.33,
    },
  ],
};

describe('renderSstActivityEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include period range', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should render case metrics', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('12');
    expect(result).toContain('8');
  });

  it('should render concern categories', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('Behavioural');
    expect(result).toContain('Academic');
    expect(result).toContain('Emotional');
  });

  it('should render intervention outcomes', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('10');
  });

  it('should render year group breakdown', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('Year 7');
    expect(result).toContain('Year 8');
  });

  it('should include school branding', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle null avg_resolution_days', () => {
    const data = { ...SST_DATA, avg_resolution_days: null };
    const result = renderSstActivityEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle empty by_year_group', () => {
    const data = { ...SST_DATA, by_year_group: [] };
    const result = renderSstActivityEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ─── Overdue actions accent branches ───────────────────────────────────────

  it('should use red accent when overdue_actions > 0', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    // SST_DATA has overdue_actions: 3
    expect(result).toContain('#dc2626');
  });

  it('should use green accent when overdue_actions is 0', () => {
    const data = { ...SST_DATA, overdue_actions: 0 };
    const result = renderSstActivityEn(data, BRANDING);

    expect(result).toContain('#16a34a');
  });

  // ─── Completion rate accent branches ───────────────────────────────────────

  it('should use green accent when action_completion_rate >= 80', () => {
    const data = { ...SST_DATA, action_completion_rate: 85 };
    const result = renderSstActivityEn(data, BRANDING);

    expect(result).toContain('#16a34a');
  });

  it('should use amber accent when action_completion_rate >= 50 and < 80', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    // SST_DATA has action_completion_rate: 78.5 which is >= 50 and < 80
    expect(result).toContain('#d97706');
  });

  it('should use red accent when action_completion_rate < 50', () => {
    const data = { ...SST_DATA, action_completion_rate: 30 };
    const result = renderSstActivityEn(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  // ─── Weekly trend branch ───────────────────────────────────────────────────

  it('should render weekly trend section when data exists', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('Weekly Trend');
    expect(result).toContain('2025-W36');
    expect(result).toContain('2025-W37');
  });

  it('should omit weekly trend section when empty', () => {
    const data = {
      ...SST_DATA,
      concern_volume: { ...SST_DATA.concern_volume, weekly_trend: [] },
    };
    const result = renderSstActivityEn(data, BRANDING);

    expect(result).not.toContain('Weekly Trend');
  });

  // ─── avg_resolution_days N/A branch ────────────────────────────────────────

  it('should display resolution days when present', () => {
    const result = renderSstActivityEn(SST_DATA, BRANDING);

    expect(result).toContain('14.5');
  });

  it('should display N/A when avg_resolution_days is null', () => {
    const data = { ...SST_DATA, avg_resolution_days: null };
    const result = renderSstActivityEn(data, BRANDING);

    expect(result).toContain('N/A');
  });

  // ─── Logo branch ──────────────────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderSstActivityEn(SST_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderSstActivityEn(SST_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });
});
