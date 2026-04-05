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

  // ─── Branch coverage: SST composition empty vs populated ──────────────

  it('should render empty message when SST composition is empty', () => {
    const data = { ...DES_DATA, sst_composition: [] };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('لم يتم تكوين الفريق بعد');
  });

  it('should render SST table when composition is populated', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).not.toContain('لم يتم تكوين الفريق بعد');
    expect(result).toContain('د. فاطمة أحمد');
  });

  // ─── Branch coverage: logo_url present vs absent ───────────────────────

  it('should render logo when logo_url is provided', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('<img src="https://example.com/logo.png"');
  });

  it('should not render logo when logo_url is absent', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'Test', school_name_ar: 'اختبار' };
    const result = renderDesInspectionAr(DES_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Branch coverage: pastoral_care_policy null fields ────────────────

  it('should render policy title when present', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('سياسة الرعاية الرعوية');
  });

  it('should render dash when policy_title is null', () => {
    const data = {
      ...DES_DATA,
      pastoral_care_policy: { ...DES_DATA.pastoral_care_policy, policy_title: null },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  it('should render dash when last_reviewed is null', () => {
    const data = {
      ...DES_DATA,
      pastoral_care_policy: { ...DES_DATA.pastoral_care_policy, last_reviewed: null },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  it('should render dash when next_review_due is null', () => {
    const data = {
      ...DES_DATA,
      pastoral_care_policy: { ...DES_DATA.pastoral_care_policy, next_review_due: null },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  // ─── Branch coverage: meeting_frequency null fields ───────────────────

  it('should render attendance rate when not null', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('85%');
  });

  it('should render dash when average_attendance_rate is null', () => {
    const data = {
      ...DES_DATA,
      meeting_frequency: { ...DES_DATA.meeting_frequency, average_attendance_rate: null },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  it('should render dash when last_meeting_date is null', () => {
    const data = {
      ...DES_DATA,
      meeting_frequency: { ...DES_DATA.meeting_frequency, last_meeting_date: null },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  // ─── Branch coverage: concern_logging by_category empty ───────────────

  it('should not render category table when empty', () => {
    const data = {
      ...DES_DATA,
      concern_logging_activity: { ...DES_DATA.concern_logging_activity, by_category: {} },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    // No category rows
    expect(result).not.toContain('سلوكي');
  });

  // ─── Branch coverage: referral_pathways.by_type empty ─────────────────

  it('should render referral type table when populated', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    expect(result).toContain('CAMHS');
  });

  it('should not render referral type table when empty', () => {
    const data = {
      ...DES_DATA,
      referral_pathways: { ...DES_DATA.referral_pathways, by_type: {} },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).not.toContain('CAMHS');
  });

  // ─── Branch coverage: totalContinuum > 0 vs 0 ────────────────────────

  it('should render percentages when totalContinuum > 0', () => {
    const result = renderDesInspectionAr(DES_DATA, BRANDING);

    // total = 25+8+2 = 35; level_1 = 25/35*100 = 71%
    expect(result).toContain('71%');
  });

  it('should render 0% when totalContinuum is 0', () => {
    const data = {
      ...DES_DATA,
      continuum_evidence: {
        level_1_count: 0,
        level_2_count: 0,
        level_3_count: 0,
        coverage_rate: 0,
      },
    };
    const result = renderDesInspectionAr(data, BRANDING);

    expect(result).toContain('>0%</div>');
  });

  // ─── Branch coverage: default primary_color ────────────────────────────

  it('should use default primary color when not set', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Test' };
    const result = renderDesInspectionAr(DES_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Branch coverage: school_name_ar fallback ──────────────────────────

  it('should fall back to school_name when school_name_ar is absent', () => {
    const brandingNoAr: PdfBranding = { school_name: 'Test Academy' };
    const result = renderDesInspectionAr(DES_DATA, brandingNoAr);

    expect(result).toContain('Test Academy');
  });
});
