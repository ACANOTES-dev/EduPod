import type { PdfBranding } from '../pdf-rendering.service';

import { renderDesInspectionEn } from './des-inspection-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const DES_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  pastoral_care_policy_summary:
    'The school maintains a comprehensive pastoral care policy focused on student wellbeing.',
  sst_composition: [
    { user_name: 'Dr. Jane Doe', role: 'DLP' },
    { user_name: 'Mr. John Smith', role: 'Deputy DLP' },
    { user_name: 'Ms. Brown', role: null },
  ],
  meeting_frequency: { total_meetings: 12, average_per_month: 3.0 },
  concern_logging: {
    total: 45,
    by_category: {
      Behavioural: 20,
      Academic: 15,
      Emotional: 10,
    },
  },
  intervention_quality: {
    with_measurable_targets_percent: 85.0,
    with_documented_outcomes_percent: 72.0,
  },
  referral_pathways: {
    total: 8,
    by_type: {
      CAMHS: 3,
      Educational_Psychology: 2,
      TUSLA: 3,
    },
  },
  continuum_coverage: { level_1: 30, level_2: 10, level_3: 3 },
  staff_engagement: { distinct_staff_logging_concerns: 15 },
};

describe('renderDesInspectionEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include period range', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should render pastoral care policy summary', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('pastoral care policy');
  });

  it('should render SST composition', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('Dr. Jane Doe');
    expect(result).toContain('DLP');
    expect(result).toContain('Mr. John Smith');
    expect(result).toContain('Ms. Brown');
  });

  it('should render meeting frequency', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('12');
    expect(result).toContain('3');
  });

  it('should render concern categories', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('Behavioural');
    expect(result).toContain('Academic');
    expect(result).toContain('Emotional');
  });

  it('should render intervention quality metrics', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('85');
    expect(result).toContain('72');
  });

  it('should render referral pathways', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('CAMHS');
    expect(result).toContain('TUSLA');
  });

  it('should render continuum coverage', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('30');
    expect(result).toContain('10');
  });

  it('should include school branding', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle SST member with null role', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    // Ms. Brown has null role, should still render
    expect(result).toContain('Ms. Brown');
  });

  it('should handle empty concern categories', () => {
    const data = {
      ...DES_DATA,
      concern_logging: { total: 0, by_category: {} },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle empty SST composition', () => {
    const data = { ...DES_DATA, sst_composition: [] };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ─── Quality accent branches ───────────────────────────────────────────────

  it('should use green accent for quality >= 80', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    // DES_DATA has with_measurable_targets_percent: 85.0 (>=80 -> green)
    expect(result).toContain('#16a34a');
  });

  it('should use amber accent for quality >= 50 and < 80', () => {
    const data = {
      ...DES_DATA,
      intervention_quality: {
        with_measurable_targets_percent: 60.0,
        with_documented_outcomes_percent: 55.0,
      },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use red accent for quality < 50', () => {
    const data = {
      ...DES_DATA,
      intervention_quality: {
        with_measurable_targets_percent: 30.0,
        with_documented_outcomes_percent: 25.0,
      },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  // ─── Referral pathways branch ──────────────────────────────────────────────

  it('should show no referrals message when by_type is empty', () => {
    const data = {
      ...DES_DATA,
      referral_pathways: { total: 0, by_type: {} },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(result).toContain('No referrals recorded in this period');
  });

  it('should show referral table when by_type has entries', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('CAMHS');
    expect(result).toContain('TUSLA');
  });

  // ─── Continuum coverage percentage branch ──────────────────────────────────

  it('should show 0% when continuum total is 0', () => {
    const data = {
      ...DES_DATA,
      continuum_coverage: { level_1: 0, level_2: 0, level_3: 0 },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(result).toContain('0%');
  });

  it('should calculate percentage shares when continuum total > 0', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    // level_1: 30, level_2: 10, level_3: 3, total: 43
    // level_1 share: 30/43 = 70%
    expect(result).toContain('70%');
  });

  // ─── SST member role null branch ───────────────────────────────────────────

  it('should show dash for SST member with null role', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    // Ms. Brown has null role, should render the dash span
    expect(result).toContain('\u2014');
  });

  // ──��� Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderDesInspectionEn(DES_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderDesInspectionEn(DES_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ��── Concern category conditional rendering ────────────────────────────────

  it('should show category breakdown when categories exist', () => {
    const result = renderDesInspectionEn(DES_DATA, BRANDING);

    expect(result).toContain('Breakdown by Category');
  });

  it('should hide category breakdown when by_category is empty', () => {
    const data = {
      ...DES_DATA,
      concern_logging: { total: 0, by_category: {} },
    };
    const result = renderDesInspectionEn(data, BRANDING);

    expect(result).not.toContain('Breakdown by Category');
  });
});
