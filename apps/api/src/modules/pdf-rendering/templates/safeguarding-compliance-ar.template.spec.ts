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
    non_compliant_staff: [
      { name: 'معلم جديد', user_id: 'u3' },
    ],
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

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
