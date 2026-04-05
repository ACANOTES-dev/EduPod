import type { PdfBranding } from '../pdf-rendering.service';

import { renderPastoralSummaryAr } from './pastoral-summary-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const PASTORAL_DATA = {
  student: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    full_name: 'ليلى حسين',
    student_number: 'STU-401',
    year_group: 'الصف السابع',
    class_name: '7ب',
  },
  concerns: [
    {
      id: 'c1',
      date: '2025-11-01',
      category: 'سلوكي',
      severity: 'low',
      tier: 1,
      narrative: 'حادثة بسيطة في الصف.',
      versions: [],
      logged_by: 'أستاذ أحمد',
      actions_taken: 'تم إبلاغ ولي الأمر.',
    },
  ],
  cases: [],
  interventions: [],
  referrals: [],
  has_cp_records: false,
};

describe('renderPastoralSummaryAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should include student info', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('ليلى حسين');
    expect(result).toContain('STU-401');
  });

  it('should render concern data', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('حادثة بسيطة في الصف.');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  // ─── Branch coverage: has_cp_records ────────────────────────────────────

  it('should render CP banner when has_cp_records is true', () => {
    const data = { ...PASTORAL_DATA, has_cp_records: true };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('cp-banner');
    expect(result).toContain('سجلات حماية الطفل');
  });

  it('should NOT render CP banner content when has_cp_records is false', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).not.toContain('سجلات حماية الطفل');
  });

  // ─── Branch coverage: logo_url present vs absent ───────────────────────

  it('should render logo when logo_url is provided', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('<img src="https://example.com/logo.png"');
  });

  it('should not render logo when logo_url is absent', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'Test', school_name_ar: 'اختبار' };
    const result = renderPastoralSummaryAr(PASTORAL_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Branch coverage: empty arrays vs populated ────────────────────────

  it('should render empty message for concerns when array is empty', () => {
    const data = { ...PASTORAL_DATA, concerns: [] };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('لا توجد مخاوف مسجلة');
    expect(result).not.toContain('<thead>');
  });

  it('should render concerns table when array is populated', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('<thead>');
    expect(result).toContain('السرد');
  });

  it('should render empty message for cases when array is empty', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('لا توجد حالات نشطة');
  });

  it('should render cases table when populated', () => {
    const data = {
      ...PASTORAL_DATA,
      cases: [
        {
          id: 'cs1',
          status: 'open',
          case_owner: 'أحمد',
          opened_at: '2025-11-01',
          review_date: null,
          linked_concern_count: 1,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('أحمد');
    expect(result).not.toContain('لا توجد حالات نشطة');
  });

  it('should render dash for null review_date in cases', () => {
    const data = {
      ...PASTORAL_DATA,
      cases: [
        {
          id: 'cs1',
          status: 'open',
          case_owner: 'أحمد',
          opened_at: '2025-11-01',
          review_date: null,
          linked_concern_count: 1,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('—');
  });

  it('should render review_date when present', () => {
    const data = {
      ...PASTORAL_DATA,
      cases: [
        {
          id: 'cs1',
          status: 'open',
          case_owner: 'أحمد',
          opened_at: '2025-11-01',
          review_date: '2025-12-01',
          linked_concern_count: 1,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('2025-12-01');
  });

  it('should render empty message for interventions when empty', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('لا توجد تدخلات مسجلة');
  });

  it('should render interventions table when populated', () => {
    const data = {
      ...PASTORAL_DATA,
      interventions: [
        {
          id: 'i1',
          type: 'سلوكي',
          continuum_level: 2,
          status: 'active',
          target_outcomes: 'test',
          outcome: 'improved',
          start_date: '2025-10-01',
          end_date: null,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('improved');
    expect(result).not.toContain('لا توجد تدخلات مسجلة');
  });

  it('should render dash for null intervention outcome', () => {
    const data = {
      ...PASTORAL_DATA,
      interventions: [
        {
          id: 'i1',
          type: 'سلوكي',
          continuum_level: 2,
          status: 'active',
          target_outcomes: 'test',
          outcome: null,
          start_date: '2025-10-01',
          end_date: null,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    // The outcome cell should contain —
    expect(result).toContain('>—</td>');
  });

  it('should render empty message for referrals when empty', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).toContain('لا توجد إحالات خارجية');
  });

  it('should render referrals table when populated', () => {
    const data = {
      ...PASTORAL_DATA,
      referrals: [
        {
          id: 'r1',
          referral_type: 'CAMHS',
          status: 'pending',
          submitted_at: '2025-11-15',
          wait_days: 5,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('CAMHS');
    expect(result).not.toContain('لا توجد إحالات خارجية');
  });

  it('should render dash for null referral submitted_at', () => {
    const data = {
      ...PASTORAL_DATA,
      referrals: [
        {
          id: 'r1',
          referral_type: 'CAMHS',
          status: 'pending',
          submitted_at: null,
          wait_days: null,
        },
      ],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    // Verify the submitted_at cell shows dash
    expect(result).toContain('>—</td>');
  });

  // ─── Branch coverage: tier 3 concern highlighting ──────────────────────

  it('should apply red background for tier 3 concerns', () => {
    const data = {
      ...PASTORAL_DATA,
      concerns: [{ ...PASTORAL_DATA.concerns[0]!, tier: 3 }],
    };
    const result = renderPastoralSummaryAr(data, BRANDING);

    expect(result).toContain('background: #fff5f5;');
  });

  it('should not apply red background for non-tier-3 concerns', () => {
    const result = renderPastoralSummaryAr(PASTORAL_DATA, BRANDING);

    expect(result).not.toContain('background: #fff5f5;');
  });

  // ─── Branch coverage: fallback school name ─────────────────────────────

  it('should fall back to school_name when school_name_ar is absent', () => {
    const brandingNoAr: PdfBranding = { school_name: 'Test Academy' };
    const result = renderPastoralSummaryAr(PASTORAL_DATA, brandingNoAr);

    expect(result).toContain('Test Academy');
  });

  // ─── Branch coverage: default primary_color ────────────────────────────

  it('should use default primary color when not set', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Test' };
    const result = renderPastoralSummaryAr(PASTORAL_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });
});
