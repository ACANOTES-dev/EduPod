import type { PdfBranding } from '../pdf-rendering.service';

import { renderSafeguardingComplianceAr } from './safeguarding-compliance-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const SAFEGUARDING_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  concern_counts: { tier_1: 20, tier_2: 5, tier_3: 1 },
  mandated_reports: {
    total: 2,
    by_status: { submitted: 2 },
  },
  training_compliance: {
    dlp_name: 'د. فاطمة أحمد',
    dlp_training_date: '2025-08-01',
    deputy_dlp_name: 'أ. محمد علي',
    deputy_dlp_training_date: '2025-08-05',
    staff_trained_count: 38,
    staff_total_count: 40,
    staff_compliance_rate: 95.0,
    non_compliant_staff: [{ name: 'معلم جديد', user_id: 'u3' }],
  },
  child_safeguarding_statement: {
    last_review_date: '2025-05-01',
    next_review_due: '2026-05-01',
    board_signed_off: true,
  },
  active_cp_cases: 0,
};

describe('renderSafeguardingComplianceAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should render DLP names', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('د. فاطمة أحمد');
    expect(result).toContain('أ. محمد علي');
  });

  it('should render non-compliant staff', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('معلم جديد');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  it('should handle null mandated reports', () => {
    const data = { ...SAFEGUARDING_DATA, mandated_reports: null };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('يتطلب صلاحية الوصول لحماية الطفل');
  });

  // ─── Branch coverage: logo_url present vs absent ───────────────────────

  it('should render logo when logo_url is provided', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('<img src="https://example.com/logo.png"');
  });

  it('should not render logo when logo_url is absent', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'Test', school_name_ar: 'اختبار' };
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Branch coverage: tier_3 null vs number ───────────────────────────

  it('should render tier_3 count when not null', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    // tier_3 = 1 in default fixture
    expect(result).not.toContain('يتطلب صلاحية الوصول');
  });

  it('should render dash and access note when tier_3 is null', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      concern_counts: { ...SAFEGUARDING_DATA.concern_counts, tier_3: null },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('يتطلب صلاحية الوصول');
  });

  // ─── Branch coverage: active_cp_cases not null vs null ─────────────────

  it('should render active CP cases count when not null', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('حالات حماية الطفل النشطة');
  });

  it('should not render active CP cases line when null', () => {
    const data = { ...SAFEGUARDING_DATA, active_cp_cases: null };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).not.toContain('حالات حماية الطفل النشطة');
  });

  // ─── Branch coverage: mandated_reports.by_status empty vs populated ───

  it('should render mandated status table when by_status has entries', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('submitted');
  });

  it('should not render status table when by_status is empty', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      mandated_reports: { total: 0, by_status: {} },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('إجمالي التقارير المقدمة');
    // No table for statuses
    expect(result).not.toContain('submitted');
  });

  // ─── Branch coverage: dlp_training_date null ──────────────────────────

  it('should render training date when present', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('2025-08-01');
  });

  it('should render "not trained" when dlp_training_date is null', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: { ...SAFEGUARDING_DATA.training_compliance, dlp_training_date: null },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('غير مدرَّب');
  });

  it('should render "not trained" when deputy_dlp_training_date is null', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        deputy_dlp_training_date: null,
      },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('غير مدرَّب');
  });

  // ─── Branch coverage: non_compliant_staff empty ────────────────────────

  it('should not render non-compliant section when list is empty', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: { ...SAFEGUARDING_DATA.training_compliance, non_compliant_staff: [] },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).not.toContain('الموظفون غير الممتثلون');
  });

  // ─── Branch coverage: child_safeguarding_statement dates null ──────────

  it('should render dash for null last_review_date', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        last_review_date: null,
      },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    // The review date row should have a dash
    expect(result).toContain('>—</span>');
  });

  it('should render dash for null next_review_due', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        next_review_due: null,
      },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('>—</span>');
  });

  // ─── Branch coverage: board_signed_off true vs false ──────────────────

  it('should show green badge when board_signed_off is true', () => {
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('badge-green');
    expect(result).toContain('معتمد');
  });

  it('should show red badge when board_signed_off is false', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        board_signed_off: false,
      },
    };
    const result = renderSafeguardingComplianceAr(data, BRANDING);

    expect(result).toContain('badge-red');
    expect(result).toContain('بانتظار الاعتماد');
  });

  // ─── Branch coverage: default primary_color ────────────────────────────

  it('should use default primary color when not set', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Test' };
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Branch coverage: school_name_ar fallback ──────────────────────────

  it('should fall back to school_name when school_name_ar is absent', () => {
    const brandingNoAr: PdfBranding = { school_name: 'Test Academy' };
    const result = renderSafeguardingComplianceAr(SAFEGUARDING_DATA, brandingNoAr);

    expect(result).toContain('Test Academy');
  });
});
