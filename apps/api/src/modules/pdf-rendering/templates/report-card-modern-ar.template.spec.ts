import type { PdfBranding } from '../pdf-rendering.service';

import { renderReportCardModernAr } from './report-card-modern-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Modern Academy',
  school_name_ar: 'الأكاديمية الحديثة',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#2563eb',
};

const REPORT_CARD_DATA = {
  student: {
    full_name: 'سارة أحمد',
    student_number: 'STU-200',
    year_group: 'الصف الثامن',
    class_homeroom: '8أ',
  },
  period: {
    name: 'الفصل الأول',
    academic_year: '2025-2026',
    start_date: '2025-09-01',
    end_date: '2025-12-20',
  },
  subjects: [
    {
      subject_name: 'العلوم',
      subject_code: 'SCI',
      computed_value: 78.0,
      display_value: 'B+',
      overridden_value: null,
    },
  ],
  attendance_summary: {
    total_days: 70,
    present_days: 68,
    absent_days: 1,
    late_days: 1,
  },
  teacher_comment: 'أداء جيد.',
  principal_comment: null,
};

describe('renderReportCardModernAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('<html lang="ar" dir="rtl">');
    expect(result).toContain('direction: rtl');
  });

  it('should contain modern gradient header', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('linear-gradient');
  });

  it('should use Arabic school name', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('الأكاديمية الحديثة');
  });

  it('should include Arabic labels', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('الطالب');
    expect(result).toContain('الصف');
    expect(result).toContain('الفترة');
    expect(result).toContain('المادة');
    expect(result).toContain('التقدير');
  });

  it('should render Arabic attendance labels', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('ملخص الحضور');
    expect(result).toContain('إجمالي الأيام');
  });

  it('should apply grade color coding', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    // 78% is >= 75, so blue (#2563eb)
    expect(result).toContain('#2563eb');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
