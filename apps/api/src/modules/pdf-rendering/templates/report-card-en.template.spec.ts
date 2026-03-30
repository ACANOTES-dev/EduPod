import type { PdfBranding } from '../pdf-rendering.service';

import { renderReportCardEn } from './report-card-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
  report_card_title: 'Student Report Card',
};

const REPORT_CARD_DATA = {
  student: {
    full_name: 'John Doe',
    student_number: 'STU-001',
    year_group: 'Year 5',
    class_homeroom: '5A',
  },
  period: {
    name: 'Term 1',
    academic_year: '2025-2026',
    start_date: '2025-09-01',
    end_date: '2025-12-20',
  },
  subjects: [
    {
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      computed_value: 85.5,
      display_value: 'A',
      overridden_value: null,
      assessments: [
        {
          title: 'Midterm Exam',
          category: 'exam',
          max_score: 100,
          raw_score: 86,
          is_missing: false,
        },
      ],
    },
    {
      subject_name: 'English',
      subject_code: null,
      computed_value: 72.3,
      display_value: 'B',
      overridden_value: 'B+',
      assessments: [],
    },
  ],
  attendance_summary: {
    total_days: 80,
    present_days: 75,
    absent_days: 3,
    late_days: 2,
  },
  teacher_comment: 'Excellent progress this term.',
  principal_comment: 'Keep up the good work.',
};

describe('renderReportCardEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain a valid HTML document structure', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en" dir="ltr">');
    expect(result).toContain('</html>');
  });

  it('should include school branding', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Test Academy');
    expect(result).toContain('Student Report Card');
    expect(result).toContain('https://example.com/logo.png');
  });

  it('should include student information', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('John Doe');
    expect(result).toContain('STU-001');
    expect(result).toContain('Year 5');
    expect(result).toContain('5A');
  });

  it('should include period information', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Term 1');
    expect(result).toContain('2025-2026');
    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-20');
  });

  it('should render subject rows with scores and grades', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Mathematics');
    expect(result).toContain('MATH');
    expect(result).toContain('85.5%');
    expect(result).toContain('English');
    expect(result).toContain('72.3%');
  });

  it('should use overridden grade when provided', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    // English has overridden_value 'B+', so should show B+ instead of B
    expect(result).toContain('B+');
  });

  it('should render attendance summary when provided', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Attendance Summary');
    expect(result).toContain('80');
    expect(result).toContain('75');
  });

  it('should omit attendance section when not provided', () => {
    const dataWithoutAttendance = {
      ...REPORT_CARD_DATA,
      attendance_summary: undefined,
    };
    const result = renderReportCardEn(dataWithoutAttendance, BRANDING);

    expect(result).not.toContain('Attendance Summary');
  });

  it('should render teacher and principal comments', () => {
    const result = renderReportCardEn(REPORT_CARD_DATA, BRANDING);

    expect(result).toContain('Teacher Comments');
    expect(result).toContain('Excellent progress this term.');
    expect(result).toContain('Principal Comments');
    expect(result).toContain('Keep up the good work.');
  });

  it('should omit comments sections when null', () => {
    const dataWithoutComments = {
      ...REPORT_CARD_DATA,
      teacher_comment: null,
      principal_comment: null,
    };
    const result = renderReportCardEn(dataWithoutComments, BRANDING);

    expect(result).not.toContain('Teacher Comments');
    expect(result).not.toContain('Principal Comments');
  });

  it('should escape HTML entities in student name', () => {
    const dataWithHtml = {
      ...REPORT_CARD_DATA,
      student: {
        ...REPORT_CARD_DATA.student,
        full_name: '<script>alert("xss")</script>',
      },
    };
    const result = renderReportCardEn(dataWithHtml, BRANDING);

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should use default primary color when branding has none', () => {
    const minimalBranding: PdfBranding = {
      school_name: 'Minimal School',
    };
    const result = renderReportCardEn(REPORT_CARD_DATA, minimalBranding);

    expect(result).toContain('#1e40af');
  });

  it('should render without logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = {
      school_name: 'No Logo School',
    };
    const result = renderReportCardEn(REPORT_CARD_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should handle empty subjects array', () => {
    const dataEmpty = {
      ...REPORT_CARD_DATA,
      subjects: [],
    };
    const result = renderReportCardEn(dataEmpty, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toContain('Subject');
  });
});
