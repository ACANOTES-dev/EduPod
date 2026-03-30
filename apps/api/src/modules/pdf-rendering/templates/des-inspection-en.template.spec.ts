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
  pastoral_care_policy_summary: 'The school maintains a comprehensive pastoral care policy focused on student wellbeing.',
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
});
