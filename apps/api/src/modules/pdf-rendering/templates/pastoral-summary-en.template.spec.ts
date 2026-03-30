import type { PdfBranding } from '../pdf-rendering.service';

import { renderPastoralSummaryEn } from './pastoral-summary-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const PASTORAL_DATA = {
  student: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    full_name: 'Emma Wilson',
    student_number: 'STU-400',
    year_group: 'Year 7',
    class_name: '7C',
  },
  concerns: [
    {
      id: 'c1',
      date: '2025-10-15',
      category: 'Behavioural',
      severity: 'medium',
      tier: 1,
      narrative: 'Student was involved in a playground incident.',
      versions: [
        {
          version: 1,
          text: 'Initial report.',
          amended_at: '2025-10-15',
          amended_by: 'Teacher A',
          reason: 'initial',
        },
      ],
      logged_by: 'Ms. Brown',
      actions_taken: 'Parent notified.',
    },
  ],
  cases: [
    {
      id: 'case1',
      status: 'open',
      case_owner: 'Dr. Smith',
      opened_at: '2025-10-16',
      review_date: '2025-11-16',
      linked_concern_count: 1,
    },
  ],
  interventions: [
    {
      id: 'int1',
      type: 'behavioural_support',
      continuum_level: 1,
      status: 'active',
      target_outcomes: 'Reduce incidents by 50%',
      outcome: null,
      start_date: '2025-10-20',
      end_date: null,
    },
  ],
  referrals: [
    {
      id: 'ref1',
      referral_type: 'external_psychology',
      status: 'pending',
      submitted_at: '2025-10-25',
      wait_days: 14,
    },
  ],
  has_cp_records: false,
};

describe('renderPastoralSummaryEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include student info', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Emma Wilson');
    expect(result).toContain('STU-400');
    expect(result).toContain('Year 7');
    expect(result).toContain('7C');
  });

  it('should render concern details', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Behavioural');
    expect(result).toContain('playground incident');
  });

  it('should render case details', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Dr. Smith');
    expect(result).toContain('open');
  });

  it('should render intervention details', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Reduce incidents by 50%');
  });

  it('should render referral details', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('external_psychology');
    expect(result).toContain('pending');
  });

  it('should include school branding', () => {
    const result = renderPastoralSummaryEn(PASTORAL_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle empty arrays', () => {
    const emptyData = {
      ...PASTORAL_DATA,
      concerns: [],
      cases: [],
      interventions: [],
      referrals: [],
    };
    const result = renderPastoralSummaryEn(emptyData, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle has_cp_records flag', () => {
    const cpData = { ...PASTORAL_DATA, has_cp_records: true };
    const result = renderPastoralSummaryEn(cpData, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
