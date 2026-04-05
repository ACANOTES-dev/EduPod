import type { PdfBranding } from '../pdf-rendering.service';

import { renderReportCardModernEn } from './report-card-modern-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Modern Academy',
  school_name_ar: 'الأكاديمية الحديثة',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#2563eb',
  report_card_title: 'Progress Report',
};

const REPORT_CARD_DATA = {
  student: {
    full_name: 'Jane Smith',
    student_number: 'STU-100',
    year_group: 'Year 8',
    class_homeroom: '8B',
  },
  period: {
    name: 'Spring Term',
    academic_year: '2025-2026',
    start_date: '2026-01-10',
    end_date: '2026-04-05',
  },
  subjects: [
    {
      subject_name: 'Science',
      subject_code: 'SCI',
      computed_value: 95.0,
      display_value: 'A+',
      overridden_value: null,
    },
    {
      subject_name: 'History',
      subject_code: null,
      computed_value: 55.2,
      display_value: 'D',
      overridden_value: null,
    },
  ],
  attendance_summary: {
    total_days: 60,
    present_days: 58,
    absent_days: 1,
    late_days: 1,
  },
  teacher_comment: 'Strong performance in sciences.',
  principal_comment: 'Well done this term.',
};

describe('renderReportCardModernEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain modern gradient header', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('linear-gradient');
    expect(result).toContain('#2563eb');
  });

  it('should use custom report card title from branding', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Progress Report');
  });

  it('should render student info cards', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Jane Smith');
    expect(result).toContain('STU-100');
    expect(result).toContain('8B');
    expect(result).toContain('Year 8');
  });

  it('should apply grade color coding based on score', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    // 95% should get green (#059669)
    expect(result).toContain('#059669');
    // 55.2% should get red (#dc2626)
    expect(result).toContain('#dc2626');
  });

  it('should render attendance cards', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Attendance Summary');
    expect(result).toContain('Total Days');
    expect(result).toContain('Present');
    expect(result).toContain('Absent');
    expect(result).toContain('Late');
  });

  it('should render comments in styled boxes', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Teacher Comments');
    expect(result).toContain('Strong performance in sciences.');
    expect(result).toContain('Principal Comments');
    expect(result).toContain('Well done this term.');
  });

  it('should omit attendance and comments when absent', () => {
    const minimal = {
      ...REPORT_CARD_DATA,
      attendance_summary: undefined,
      teacher_comment: null,
      principal_comment: null,
    };
    const result = renderReportCardModernEn(minimal, BRANDING);

    expect(result).not.toContain('Attendance Summary');
    expect(result).not.toContain('Teacher Comments');
    expect(result).not.toContain('Principal Comments');
  });

  it('should set LTR direction', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('<html lang="en" dir="ltr">');
  });

  // ─── Grade color threshold branches ────────────────────────────────────────

  it('should use green (#059669) for scores >= 90', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Math',
          subject_code: null,
          computed_value: 92.0,
          display_value: 'A+',
          overridden_value: null,
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('#059669');
  });

  it('should use blue (#2563eb) for scores >= 75 and < 90', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Math',
          subject_code: null,
          computed_value: 78.0,
          display_value: 'B+',
          overridden_value: null,
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('#2563eb');
  });

  it('should use amber (#d97706) for scores >= 60 and < 75', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Math',
          subject_code: null,
          computed_value: 65.0,
          display_value: 'C',
          overridden_value: null,
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use red (#dc2626) for scores < 60', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Math',
          subject_code: null,
          computed_value: 45.0,
          display_value: 'F',
          overridden_value: null,
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  // ─── Subject code branch ───────────────────────────────────────────────────

  it('should render subject code when present', () => {
    const result = renderReportCardModernEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('SCI');
  });

  it('should omit subject code div when subject_code is null', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Art',
          subject_code: null,
          computed_value: 80.0,
          display_value: 'A-',
          overridden_value: null,
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('Art');
  });

  // ─── Overridden value branch ───────────────────────────────────────────────

  it('should use overridden_value when provided', () => {
    const data = {
      ...REPORT_CARD_DATA,
      subjects: [
        {
          subject_name: 'Math',
          subject_code: null,
          computed_value: 80.0,
          display_value: 'A-',
          overridden_value: 'A',
        },
      ],
    };
    const result = renderReportCardModernEn(data, BRANDING);

    // The overridden value 'A' should appear (instead of display_value 'A-')
    expect(result).toContain('A');
    // A- should NOT be in the grade column (it was overridden)
    expect(result).not.toContain('A-');
  });

  // ─── Default report card title ─────────────────────────────────────────────

  it('should use default "Report Card" title when report_card_title is undefined', () => {
    const brandingNoTitle: PdfBranding = { school_name: 'Test School' };
    const result = renderReportCardModernEn(REPORT_CARD_DATA, brandingNoTitle);

    expect(result).toContain('Report Card');
  });

  // ─── Logo branch ──────────────────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderReportCardModernEn(REPORT_CARD_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  // ─── Only teacher comment ──────────────────────────────────────────────────

  it('should render only teacher comment when principal is null', () => {
    const data = { ...REPORT_CARD_DATA, principal_comment: null };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).toContain('Teacher Comments');
    expect(result).not.toContain('Principal Comments');
  });

  it('should render only principal comment when teacher is null', () => {
    const data = { ...REPORT_CARD_DATA, teacher_comment: null };
    const result = renderReportCardModernEn(data, BRANDING);

    expect(result).not.toContain('Teacher Comments');
    expect(result).toContain('Principal Comments');
  });
});
