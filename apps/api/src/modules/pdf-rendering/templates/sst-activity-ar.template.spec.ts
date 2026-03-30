import type { PdfBranding } from '../pdf-rendering.service';

import { renderSstActivityAr } from './sst-activity-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const SST_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  cases_opened: 10,
  cases_closed: 6,
  cases_by_severity: {
    high: 2,
    medium: 4,
    low: 4,
  },
  avg_resolution_days: 12.0,
  concern_volume: {
    total: 30,
    by_category: { سلوكي: 15, أكاديمي: 10, عاطفي: 5 },
    by_severity: { high: 5, medium: 15, low: 10 },
    weekly_trend: [{ week: '2025-W40', count: 7 }],
  },
  intervention_outcomes: {
    achieved: 8,
    partially_achieved: 3,
    not_achieved: 1,
    escalated: 0,
    in_progress: 4,
  },
  action_completion_rate: 82.0,
  overdue_actions: 2,
  by_year_group: [
    {
      year_group_name: 'الصف السابع',
      student_count: 20,
      concern_count: 12,
      concerns_per_student: 0.6,
    },
  ],
};

describe('renderSstActivityAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should render period dates', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should render year group data', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('الصف السابع');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
