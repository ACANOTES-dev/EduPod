import type { PdfBranding } from '../pdf-rendering.service';

import { renderTranscriptAr } from './transcript-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const TRANSCRIPT_DATA = {
  student: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    full_name: 'خالد عبدالله',
    student_number: 'STU-301',
    year_group: 'الصف العاشر',
  },
  years: [
    {
      academic_year: '2024-2025',
      periods: [
        {
          period_name: 'الفصل الأول',
          subjects: [
            {
              subject_name: 'الفيزياء',
              subject_code: 'PHY',
              computed_value: 90.0,
              display_value: 'A+',
              overridden_value: null,
            },
          ],
        },
      ],
    },
  ],
};

describe('renderTranscriptAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('<html lang="ar" dir="rtl">');
    expect(result).toContain('direction: rtl');
  });

  it('should display Arabic transcript title', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('السجل الأكاديمي');
  });

  it('should use Arabic school name', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should include Arabic labels', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('الطالب:');
    expect(result).toContain('رقم الطالب:');
    expect(result).toContain('المرحلة:');
    expect(result).toContain('المادة');
    expect(result).toContain('الدرجة');
    expect(result).toContain('التقدير');
  });

  it('should render student and subject data', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('خالد عبدالله');
    expect(result).toContain('STU-301');
    expect(result).toContain('الفيزياء');
    expect(result).toContain('90.0%');
  });

  it('should show Arabic empty state when no years', () => {
    const emptyData = { ...TRANSCRIPT_DATA, years: [] };
    const result = renderTranscriptAr(emptyData, BRANDING);

    expect(result).toContain('لا توجد سجلات أكاديمية متاحة');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
