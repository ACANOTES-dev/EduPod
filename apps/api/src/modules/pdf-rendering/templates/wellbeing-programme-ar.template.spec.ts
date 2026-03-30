import type { PdfBranding } from '../pdf-rendering.service';

import { renderWellbeingProgrammeAr } from './wellbeing-programme-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const WELLBEING_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  total_students: 200,
  students_with_level2_plus: 30,
  coverage_rate: 15.0,
  referral_rate: 5.0,
  concern_to_case_conversion_rate: 20.0,
  continuum_distribution: { level_1: 25, level_2: 8, level_3: 2 },
  intervention_type_distribution: {
    'دعم سلوكي': 12,
    'إرشاد أكاديمي': 8,
  },
  by_year_group: [
    {
      year_group_name: 'الصف السابع',
      student_count: 20,
      students_with_support: 5,
      coverage_rate: 25.0,
    },
  ],
};

describe('renderWellbeingProgrammeAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should render continuum distribution', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('25');
    expect(result).toContain('8');
    expect(result).toContain('2');
  });

  it('should render Arabic intervention types', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('دعم سلوكي');
    expect(result).toContain('إرشاد أكاديمي');
  });

  it('should render Arabic year group name', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('الصف السابع');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderWellbeingProgrammeAr(WELLBEING_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
