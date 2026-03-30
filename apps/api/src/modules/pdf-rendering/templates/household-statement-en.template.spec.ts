import type { PdfBranding } from '../pdf-rendering.service';

import { renderHouseholdStatementEn } from './household-statement-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const STATEMENT_DATA = {
  household: {
    household_name: 'Smith Family',
    billing_parent_name: 'Robert Smith',
  },
  currency_code: 'EUR',
  date_from: '2025-09-01',
  date_to: '2026-01-31',
  opening_balance: 500.0,
  closing_balance: 1550.0,
  entries: [
    {
      date: '2025-09-15',
      type: 'invoice',
      reference: 'INV-202509-0001',
      description: 'Tuition Fee Term 1',
      debit: 2500.0,
      credit: null,
      running_balance: 3000.0,
    },
    {
      date: '2025-10-01',
      type: 'payment',
      reference: 'PAY-202510-0001',
      description: 'Online payment',
      debit: null,
      credit: 1000.0,
      running_balance: 2000.0,
    },
    {
      date: '2025-11-01',
      type: 'credit_note',
      reference: 'CN-202511-0001',
      description: 'Sibling discount',
      debit: null,
      credit: 450.0,
      running_balance: 1550.0,
    },
  ],
};

describe('renderHouseholdStatementEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include household info', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('Smith Family');
    expect(result).toContain('Robert Smith');
  });

  it('should include date range', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('2025-09-01');
    expect(result).toContain('2026-01-31');
  });

  it('should render ledger entries', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('INV-202509-0001');
    expect(result).toContain('PAY-202510-0001');
    expect(result).toContain('CN-202511-0001');
    expect(result).toContain('Tuition Fee Term 1');
  });

  it('should format entry types', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('Invoice');
    expect(result).toContain('Payment');
    expect(result).toContain('Credit Note');
  });

  it('should include opening and closing balances', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('EUR 500.00');
    expect(result).toContain('EUR 1550.00');
  });

  it('should include school branding', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle empty entries list', () => {
    const data = { ...STATEMENT_DATA, entries: [] };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null billing parent', () => {
    const data = {
      ...STATEMENT_DATA,
      household: {
        household_name: 'Orphan Account',
        billing_parent_name: null,
      },
    };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(result).toContain('Orphan Account');
  });
});
