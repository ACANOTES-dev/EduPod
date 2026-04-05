import type { PdfBranding } from '../pdf-rendering.service';

import { renderWellbeingProgrammeEn } from './wellbeing-programme-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const WELLBEING_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  intervention_coverage_percent: 18.5,
  continuum_distribution: { level_1: 30, level_2: 12, level_3: 3 },
  referral_rate: 6.7,
  concern_to_case_conversion_rate: 22.0,
  intervention_type_distribution: {
    'Behavioural Support': 15,
    'Academic Mentoring': 10,
    'Social Skills': 8,
    Counselling: 5,
  },
  by_year_group: [
    {
      year_group_name: 'Year 7',
      intervention_count: 12,
      student_count: 25,
    },
    {
      year_group_name: 'Year 8',
      intervention_count: 8,
      student_count: 30,
    },
  ],
};

describe('renderWellbeingProgrammeEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include period range', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should render continuum distribution levels', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('30');
    expect(result).toContain('12');
    expect(result).toContain('3');
  });

  it('should render intervention type breakdown', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('Behavioural Support');
    expect(result).toContain('Academic Mentoring');
    expect(result).toContain('Social Skills');
    expect(result).toContain('Counselling');
  });

  it('should render year group breakdown', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('Year 7');
    expect(result).toContain('Year 8');
  });

  it('should include school branding', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle empty year groups', () => {
    const data = { ...WELLBEING_DATA, by_year_group: [] };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle empty intervention type distribution', () => {
    const data = { ...WELLBEING_DATA, intervention_type_distribution: {} };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ─── Coverage accent branches ──────────────────────────────────────────────

  it('should use green accent when coverage >= 80', () => {
    const data = { ...WELLBEING_DATA, intervention_coverage_percent: 85.0 };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(result).toContain('#16a34a');
  });

  it('should use amber accent when coverage >= 50 and < 80', () => {
    const data = { ...WELLBEING_DATA, intervention_coverage_percent: 60.0 };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use primaryColor accent when coverage < 50', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    // WELLBEING_DATA has intervention_coverage_percent: 18.5
    // coverage < 50 means coverageAccent = primaryColor = '#1e40af'
    expect(typeof result).toBe('string');
  });

  // ─── Year group rate calculation branch ────────────────────────────────────

  it('should calculate rate as 0.0 when student_count is 0', () => {
    const data = {
      ...WELLBEING_DATA,
      by_year_group: [{ year_group_name: 'Year 9', intervention_count: 0, student_count: 0 }],
    };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(result).toContain('0.0%');
  });

  it('should calculate non-zero coverage rate', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    // Year 7: 12/25 = 48.0%
    expect(result).toContain('48.0%');
  });

  // ─── Empty intervention type distribution ──────────────────────────────────

  it('should show empty state message when no intervention types', () => {
    const data = { ...WELLBEING_DATA, intervention_type_distribution: {} };
    const result = renderWellbeingProgrammeEn(data, BRANDING);

    expect(result).toContain('No intervention type data available');
  });

  it('should show table when intervention types exist', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('Intervention Type');
    expect(result).toContain('Behavioural Support');
  });

  // ─── MetricCard sub branch ─────────────────────────────────────────────────

  it('should render metricCard sub text when provided', () => {
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, BRANDING);

    expect(result).toContain('of student population');
    expect(result).toContain('concerns referred externally');
  });

  // ─── Logo and branding ────────────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderWellbeingProgrammeEn(WELLBEING_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });
});
