import type { PdfBranding } from '../pdf-rendering.service';

import { renderHouseholdStatementAr } from './household-statement-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const STATEMENT_DATA = {
  household: {
    household_name: 'عائلة محمد',
    billing_parent_name: 'محمد علي',
  },
  currency_code: 'LYD',
  date_from: '2025-09-01',
  date_to: '2026-01-31',
  opening_balance: 0,
  closing_balance: 2000.0,
  entries: [
    {
      date: '2025-09-15',
      type: 'invoice',
      reference: 'INV-202509-0010',
      description: 'رسوم الفصل الأول',
      debit: 3000.0,
      credit: null,
      running_balance: 3000.0,
    },
    {
      date: '2025-10-01',
      type: 'payment',
      reference: 'PAY-202510-0005',
      description: 'دفعة نقدية',
      debit: null,
      credit: 1000.0,
      running_balance: 2000.0,
    },
  ],
};

describe('renderHouseholdStatementAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should render Arabic household info', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(result).toContain('عائلة محمد');
    expect(result).toContain('محمد علي');
  });

  it('should render ledger entries', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(result).toContain('INV-202509-0010');
    expect(result).toContain('PAY-202510-0005');
    expect(result).toContain('رسوم الفصل الأول');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderHouseholdStatementAr(STATEMENT_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
