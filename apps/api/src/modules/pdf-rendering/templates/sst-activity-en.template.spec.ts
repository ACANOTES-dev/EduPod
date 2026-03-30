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
});
