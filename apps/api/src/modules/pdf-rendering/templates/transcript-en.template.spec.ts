import type { PdfBranding } from '../pdf-rendering.service';

import { renderTranscriptEn } from './transcript-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const TRANSCRIPT_DATA = {
  student: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    full_name: 'Alice Johnson',
    student_number: 'STU-300',
    year_group: 'Year 10',
  },
  years: [
    {
      academic_year: '2024-2025',
      periods: [
        {
          period_name: 'Term 1',
          subjects: [
            {
              subject_name: 'Physics',
              subject_code: 'PHY',
              computed_value: 88.5,
              display_value: 'A',
              overridden_value: null,
            },
            {
              subject_name: 'Chemistry',
              subject_code: null,
              computed_value: 76.0,
              display_value: 'B+',
              overridden_value: 'A-',
            },
          ],
        },
      ],
    },
    {
      academic_year: '2023-2024',
      periods: [
        {
          period_name: 'Full Year',
          subjects: [
            {
              subject_name: 'Biology',
              subject_code: 'BIO',
              computed_value: 91.0,
              display_value: 'A+',
              overridden_value: null,
            },
          ],
        },
      ],
    },
  ],
};

describe('renderTranscriptEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure with LTR', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en" dir="ltr">');
  });

  it('should display Academic Transcript title', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('Academic Transcript');
  });

  it('should include student info', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('Alice Johnson');
    expect(result).toContain('STU-300');
    expect(result).toContain('Year 10');
  });

  it('should render multiple academic years', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('2024-2025');
    expect(result).toContain('2023-2024');
  });

  it('should render subject details per period', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('Physics');
    expect(result).toContain('PHY');
    expect(result).toContain('88.5%');
    expect(result).toContain('Chemistry');
    expect(result).toContain('Biology');
    expect(result).toContain('BIO');
  });

  it('should use overridden value when provided', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    // Chemistry has overridden_value 'A-'
    expect(result).toContain('A-');
  });

  it('should show empty state when no academic records', () => {
    const emptyData = {
      ...TRANSCRIPT_DATA,
      years: [],
    };
    const result = renderTranscriptEn(emptyData, BRANDING);

    expect(result).toContain('No academic records available');
  });

  it('should include generation date', () => {
    const result = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);

    expect(result).toContain('Generated');
  });
});
