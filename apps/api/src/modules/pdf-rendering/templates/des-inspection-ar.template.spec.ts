import type { PdfBranding } from '../pdf-rendering.service';

import { renderDesInspectionAr } from './des-inspection-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const DES_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  pastoral_care_policy: {
    policy_title: 'سياسة الرعاية الرعوية',
    last_reviewed: '2025-06-01',
    next_review_due: '2026-06-01',
  },
  sst_composition: [
    { name: 'د. فاطمة أحمد', role: 'مسؤول حماية الطفل' },
    { name: 'أ. محمد علي', role: 'نائب المسؤول' },
  ],
  meeting_frequency: {
    meetings_held: 10,
    average_attendance_rate: 85.0,
    last_meeting_date: '2025-12-15',
  },
  concern_logging_activity: {
    total_concerns: 35,
    by_category: { سلوكي: 18, أكاديمي: 12, عاطفي: 5 },
    distinct_staff_logged: 12,
  },
  intervention_quality: {
    total_interventions: 20,
    with_measurable_targets: 16,
    with_documented_outcomes: 13,
    measurable_targets_rate: 80.0,
    documented_outcomes_rate: 65.0,
  },
  referral_pathways: {
    total_external_referrals: 5,
    by_type: { CAMHS: 2, إرشاد_نفسي: 3 },
    with_outcomes: 3,
  },
  continuum_evidence: {
    level_1_count: 25,
    level_2_count: 8,
    level_3_count: 2,
    coverage_rate: 15.0,
  },
};

describe('renderDesInspectionAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should render SST composition', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('د. فاطمة أحمد');
    expect(result).toContain('مسؤول حماية الطفل');
  });

  it('should render Arabic concern categories', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('سلوكي');
    expect(result).toContain('أكاديمي');
  });

  it('should include period range', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  it('should handle empty SST composition', () => {
    const data = { ...DES_DATA, sst_composition: [] };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
