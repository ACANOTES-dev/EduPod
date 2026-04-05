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

  // ─── Branch coverage: logo_url present vs absent ───────────────────────

  it('should render logo when logo_url is provided', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('<img src="https://example.com/logo.png"');
  });

  it('should not render logo when logo_url is absent', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'Test', school_name_ar: 'اختبار' };
    const result = renderSstActivityAr(SST_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Branch coverage: avg_resolution_days null vs number ──────────────

  it('should render resolution days value when not null', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('12.0');
    expect(result).toContain('يوم');
  });

  it('should render dash when avg_resolution_days is null', () => {
    const data = { ...SST_DATA, avg_resolution_days: null };
    const result = renderSstActivityAr(data, BRANDING);

    // Should not have "يوم" sub-label when null
    // The kpi-value should show —
    expect(result).toContain('>—</div>');
  });

  // ─── Branch coverage: overdue_actions > 0 styling ─────────────────────

  it('should apply red color when overdue_actions > 0', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('color: #dc2626;');
  });

  it('should not apply red color when overdue_actions is 0', () => {
    const data = { ...SST_DATA, overdue_actions: 0 };
    const result = renderSstActivityAr(data, BRANDING);

    // The overdue_actions div should not have dc2626
    const idx = result.indexOf('الإجراءات المتأخرة');
    const section = result.slice(idx, idx + 200);
    expect(section).not.toContain('color: #dc2626;');
  });

  // ─── Branch coverage: empty by_category / by_severity ─────────────────

  it('should render category table when categories exist', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('سلوكي');
    expect(result).toContain('أكاديمي');
  });

  it('should render empty message when by_category is empty', () => {
    const data = {
      ...SST_DATA,
      concern_volume: { ...SST_DATA.concern_volume, by_category: {} },
    };
    const result = renderSstActivityAr(data, BRANDING);

    expect(result).toContain('لا توجد بيانات');
  });

  it('should render severity table when severities exist', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('high');
  });

  it('should render empty message when by_severity is empty', () => {
    const data = {
      ...SST_DATA,
      concern_volume: { ...SST_DATA.concern_volume, by_severity: {} },
    };
    const result = renderSstActivityAr(data, BRANDING);

    // Both "no data" messages appear
    const matches = result.match(/لا توجد بيانات/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Branch coverage: by_year_group empty vs populated ─────────────────

  it('should render year group table when populated', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    expect(result).toContain('حسب المجموعة السنوية');
    expect(result).toContain('الصف السابع');
  });

  it('should not render year group section when empty', () => {
    const data = { ...SST_DATA, by_year_group: [] };
    const result = renderSstActivityAr(data, BRANDING);

    expect(result).not.toContain('حسب المجموعة السنوية');
  });

  // ─── Branch coverage: totalOutcomes > 0 vs 0 ──────────────────────────

  it('should show total outcomes count in title when > 0', () => {
    const result = renderSstActivityAr(SST_DATA, BRANDING);

    // Total = 8+3+1+0+4 = 16
    expect(result).toContain('(16)');
  });

  it('should not show count in title when totalOutcomes is 0', () => {
    const data = {
      ...SST_DATA,
      intervention_outcomes: {
        achieved: 0,
        partially_achieved: 0,
        not_achieved: 0,
        escalated: 0,
        in_progress: 0,
      },
    };
    const result = renderSstActivityAr(data, BRANDING);

    // Section title should not have parenthesized count
    const idx = result.indexOf('نتائج التدخلات');
    const section = result.slice(idx, idx + 100);
    expect(section).not.toContain('(0)');
  });

  // ─── Branch coverage: default primary_color ────────────────────────────

  it('should use default primary color when not set', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Test' };
    const result = renderSstActivityAr(SST_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Branch coverage: school_name_ar fallback ──────────────────────────

  it('should fall back to school_name when school_name_ar is absent', () => {
    const brandingNoAr: PdfBranding = { school_name: 'Test Academy' };
    const result = renderSstActivityAr(SST_DATA, brandingNoAr);

    expect(result).toContain('Test Academy');
  });
});
