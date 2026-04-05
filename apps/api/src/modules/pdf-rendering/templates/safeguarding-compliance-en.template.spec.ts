import type { PdfBranding } from '../pdf-rendering.service';

import { renderSafeguardingComplianceEn } from './safeguarding-compliance-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const SAFEGUARDING_DATA = {
  period: { from: '2025-09-01', to: '2025-12-31' },
  concern_counts: { tier_1: 25, tier_2: 8, tier_3: 2 },
  mandated_reports: {
    total: 3,
    by_status: { submitted: 2, pending: 1 },
  },
  training_compliance: {
    dlp_name: 'Dr. Jane Doe',
    dlp_training_date: '2025-08-15',
    deputy_dlp_name: 'Mr. John Smith',
    deputy_dlp_training_date: '2025-08-20',
    staff_trained_count: 45,
    staff_total_count: 50,
    staff_compliance_rate: 90.0,
    non_compliant_staff: [
      { name: 'New Teacher 1', user_id: 'u1' },
      { name: 'New Teacher 2', user_id: 'u2' },
    ],
  },
  child_safeguarding_statement: {
    last_review_date: '2025-06-01',
    next_review_due: '2026-06-01',
    board_signed_off: true,
  },
  active_cp_cases: 1,
};

describe('renderSafeguardingComplianceEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include period range', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2025-12-31');
  });

  it('should render concern tier counts', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('25');
    expect(result).toContain('8');
  });

  it('should render DLP training info', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('Dr. Jane Doe');
    expect(result).toContain('Mr. John Smith');
    expect(result).toContain('90');
  });

  it('should render non-compliant staff list', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('New Teacher 1');
    expect(result).toContain('New Teacher 2');
  });

  it('should render child safeguarding statement info', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('2025-06-01');
    expect(result).toContain('2026-06-01');
  });

  it('should render mandated report statuses', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('submitted');
    expect(result).toContain('pending');
  });

  it('should include school branding', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle null mandated reports', () => {
    const data = { ...SAFEGUARDING_DATA, mandated_reports: null };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null tier_3 count', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      concern_counts: { tier_1: 10, tier_2: 3, tier_3: null },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  it('should handle null active_cp_cases', () => {
    const data = { ...SAFEGUARDING_DATA, active_cp_cases: null };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  it('should handle null training dates', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        dlp_training_date: null,
        deputy_dlp_training_date: null,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null CSS review dates', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        last_review_date: null,
        next_review_due: null,
        board_signed_off: false,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  // ─── Compliance rate color branches ────────────────────────────────────────

  it('should use green for compliance rate >= 90', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    // SAFEGUARDING_DATA has staff_compliance_rate: 90.0
    expect(result).toContain('#16a34a');
  });

  it('should use amber for compliance rate >= 70 and < 90', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        staff_compliance_rate: 75.0,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use red for compliance rate < 70', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        staff_compliance_rate: 50.0,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  // ─── Non-compliant staff branches ──────────────────────────────────────────

  it('should show non-compliant staff list when staff exist', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('Staff Without Completed Training');
  });

  it('should show all-compliant message when no non-compliant staff', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        non_compliant_staff: [],
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('All staff have completed safeguarding training');
  });

  // ─── Active CP cases branches ──────────────────────────────────────────────

  it('should show red styling when active_cp_cases > 0', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    // SAFEGUARDING_DATA has active_cp_cases: 1
    expect(result).toContain('#b91c1c');
    expect(result).toContain('case');
  });

  it('should use singular "case" when active_cp_cases is 1', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('case');
    expect(result).not.toContain('cases');
  });

  it('should use plural "cases" when active_cp_cases > 1', () => {
    const data = { ...SAFEGUARDING_DATA, active_cp_cases: 3 };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('cases');
  });

  it('should show green styling when active_cp_cases is 0', () => {
    const data = { ...SAFEGUARDING_DATA, active_cp_cases: 0 };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('#16a34a');
  });

  it('should hide active CP section when active_cp_cases is null', () => {
    const data = { ...SAFEGUARDING_DATA, active_cp_cases: null };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).not.toContain('Active Child Protection Cases');
  });

  // ─── Board signed off branches ─────────────────────────────────────────────

  it('should show Yes badge when board_signed_off is true', () => {
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, BRANDING);

    expect(result).toContain('Yes');
  });

  it('should show No badge when board_signed_off is false', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        board_signed_off: false,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('No');
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderSafeguardingComplianceEn(SAFEGUARDING_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── CSS review date fallbacks ─────────────────────────────────────────────

  it('should show Not recorded when last_review_date is null', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        last_review_date: null,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('Not recorded');
  });

  it('should show Not scheduled when next_review_due is null', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      child_safeguarding_statement: {
        ...SAFEGUARDING_DATA.child_safeguarding_statement,
        next_review_due: null,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('Not scheduled');
  });

  // ─── Training date fallbacks ───────────────────────────────────────────────

  it('should show Not recorded for null dlp_training_date', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        dlp_training_date: null,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('Not recorded');
  });

  it('should show Not recorded for null deputy_dlp_training_date', () => {
    const data = {
      ...SAFEGUARDING_DATA,
      training_compliance: {
        ...SAFEGUARDING_DATA.training_compliance,
        deputy_dlp_training_date: null,
      },
    };
    const result = renderSafeguardingComplianceEn(data, BRANDING);

    expect(result).toContain('Not recorded');
  });
});
