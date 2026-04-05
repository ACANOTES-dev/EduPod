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

  // ─── Branch coverage: logo_url present vs absent ───────────────────────

  it('should render logo when logo_url is provided', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('<img src="https://example.com/logo.png"');
  });

  it('should not render logo when logo_url is absent', () => {
    const brandingNoLogo: PdfBranding = {
      school_name: 'Test',
      school_name_ar: 'اختبار',
      primary_color: '#2563eb',
    };
    const result = renderReportCardModernAr(REPORT_CARD_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Branch coverage: attendance_summary present vs absent ────────────

  it('should render attendance section when attendance_summary is present', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('ملخص الحضور');
    expect(result).toContain('68');
  });

  it('should not render attendance section when attendance_summary is absent', () => {
    const data = { ...REPORT_CARD_DATA, attendance_summary: undefined };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).not.toContain('ملخص الحضور');
  });

  // ─── Branch coverage: teacher_comment present vs absent ────────────────

  it('should render teacher comment when present', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('ملاحظات المعلم');
    expect(result).toContain('أداء جيد.');
  });

  it('should not render teacher comment when null', () => {
    const data = { ...REPORT_CARD_DATA, teacher_comment: null };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).not.toContain('ملاحظات المعلم');
  });

  // ─── Branch coverage: principal_comment present vs absent ─────────────

  it('should render principal comment when present', () => {
    const data = { ...REPORT_CARD_DATA, principal_comment: 'ممتاز جدا!' };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).toContain('ملاحظات المدير');
    expect(result).toContain('ممتاز جدا!');
  });

  it('should not render principal comment when null', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).not.toContain('ملاحظات المدير');
  });

  // ─── Branch coverage: subject_code present vs absent ───────────────────

  it('should render subject code when present', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('SCI');
  });

  it('should not render subject code when null', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [{ ...REPORT_CARD_DATA.subjects[0]!, subject_code: null }],
    };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).not.toContain('SCI');
  });

  // ─── Branch coverage: overridden_value used when present ──────────────

  it('should use overridden_value when present', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [{ ...REPORT_CARD_DATA.subjects[0]!, overridden_value: 'A+' }],
    };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).toContain('A+');
  });

  it('should use display_value when overridden_value is null', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('B+');
  });

  // ─── Branch coverage: grade color coding for all tiers ─────────────────

  it('should use green for scores >= 90', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [{ ...REPORT_CARD_DATA.subjects[0]!, computed_value: 95 }],
    };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).toContain('#059669');
  });

  it('should use blue for scores >= 75 and < 90', () => {
    const result = renderReportCardModernAr(REPORT_CARD_DATA, BRANDING);

    // 78% is blue
    expect(result).toContain('#2563eb');
  });

  it('should use amber for scores >= 60 and < 75', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [{ ...REPORT_CARD_DATA.subjects[0]!, computed_value: 65 }],
    };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use red for scores < 60', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [{ ...REPORT_CARD_DATA.subjects[0]!, computed_value: 45 }],
    };
    const result = renderReportCardModernAr(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  // ─── Branch coverage: default primary_color ────────────────────────────

  it('should use default primary color when not set', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Test' };
    const result = renderReportCardModernAr(REPORT_CARD_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Branch coverage: school_name_ar fallback ──────────────────────────

  it('should fall back to school_name when school_name_ar is absent', () => {
    const brandingNoAr: PdfBranding = { school_name: 'Test Academy', primary_color: '#2563eb' };
    const result = renderReportCardModernAr(REPORT_CARD_DATA, brandingNoAr);

    expect(result).toContain('Test Academy');
  });

  // ─── Branch coverage: report_card_title ────────────────────────────────

  it('should use custom report_card_title when provided', () => {
    const brandingCustom: PdfBranding = { ...BRANDING, report_card_title: 'شهادة مدرسية' };
    const result = renderReportCardModernAr(REPORT_CARD_DATA, brandingCustom);

    expect(result).toContain('شهادة مدرسية');
  });

  it('should use default report card title when report_card_title is absent', () => {
    const brandingNoTitle: PdfBranding = {
      school_name: 'Test',
      school_name_ar: 'اختبار',
      primary_color: '#2563eb',
    };
    const result = renderReportCardModernAr(REPORT_CARD_DATA, brandingNoTitle);

    expect(result).toContain('بطاقة التقرير');
  });
});
