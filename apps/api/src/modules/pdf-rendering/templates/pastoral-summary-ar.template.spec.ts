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
});
