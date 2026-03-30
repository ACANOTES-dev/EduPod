import type { PdfBranding } from '../pdf-rendering.service';

import { renderReportCardAr } from './report-card-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const REPORT_CARD_DATA = {
  student: {
    full_name: 'أحمد محمد',
    student_number: 'STU-002',
    year_group: 'الصف الخامس',
    class_homeroom: '5ب',
  },
  period: {
    name: 'الفصل الأول',
    academic_year: '2025-2026',
    start_date: '2025-09-01',
    end_date: '2025-12-20',
  },
  subjects: [
    {
      subject_name: 'الرياضيات',
      subject_code: 'MATH',
      computed_value: 92.0,
      display_value: 'A+',
      overridden_value: null,
      assessments: [],
    },
  ],
  attendance_summary: {
    total_days: 80,
    present_days: 78,
    absent_days: 1,
    late_days: 1,
  },
  teacher_comment: 'عمل ممتاز.',
  principal_comment: null,
};

describe('renderReportCardAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('<html lang="ar" dir="rtl">');
    expect(result).toContain('direction: rtl');
  });

  it('should use Arabic school name from branding', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should fall back to English school name when Arabic is absent', () => {
    const brandingNoAr: PdfBranding = {
      school_name: 'Fallback School',
    };
    const result = renderReportCardAr(REPORT_CARD_DATA, brandingNoAr);

    expect(result).toContain('Fallback School');
  });

  it('should include Arabic labels', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('الطالب:');
    expect(result).toContain('المادة');
    expect(result).toContain('الدرجة');
    expect(result).toContain('التقدير');
  });

  it('should include Arabic attendance labels when attendance provided', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('ملخص الحضور');
    expect(result).toContain('إجمالي الأيام');
    expect(result).toContain('حاضر');
    expect(result).toContain('غائب');
    expect(result).toContain('متأخر');
  });

  it('should render student data', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('أحمد محمد');
    expect(result).toContain('STU-002');
    expect(result).toContain('92.0%');
  });

  it('should include Arabic font import', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  it('should handle null principal comment', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).not.toContain('ملاحظات المدير');
  });

  it('should render teacher comment in Arabic', () => {
    const result = renderReportCardAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('ملاحظات المعلم');
    expect(result).toContain('عمل ممتاز.');
  });
});
