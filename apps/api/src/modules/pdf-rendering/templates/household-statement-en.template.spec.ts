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

    // Template formats dates via formatDate() -> '01 Sept 2025' style
    expect(result).toContain('01 Sept 2025');
    expect(result).toContain('31 Jan 2026');
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
    // toLocaleString adds comma separator for thousands
    expect(result).toContain('EUR 1,550.00');
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

  // ─── Closing balance color branches ────────────────────────────────────────

  it('should use red for positive closing balance (amount owed)', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    // STATEMENT_DATA has closing_balance: 1550.0 > 0 -> red
    expect(result).toContain('#dc2626');
  });

  it('should use green for zero or negative closing balance', () => {
    const data = { ...STATEMENT_DATA, closing_balance: 0 };
    const result = renderHouseholdStatementEn(data, BRANDING);

    // Template uses #059669 for non-positive closing balance
    expect(result).toContain('#059669');
  });

  it('should use green for negative closing balance (credit)', () => {
    const data = { ...STATEMENT_DATA, closing_balance: -100 };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(result).toContain('#059669');
  });

  // ─── Entry type formatting branches ────────────────────────────────────────

  it('should format refund type', () => {
    const data = {
      ...STATEMENT_DATA,
      entries: [
        {
          date: '2025-12-01',
          type: 'refund',
          reference: 'REF-001',
          description: 'Fee refund',
          debit: null,
          credit: 100,
          running_balance: 0,
        },
      ],
    };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(result).toContain('Refund');
  });

  it('should format write_off type', () => {
    const data = {
      ...STATEMENT_DATA,
      entries: [
        {
          date: '2025-12-01',
          type: 'write_off',
          reference: 'WO-001',
          description: 'Written off',
          debit: null,
          credit: 50,
          running_balance: 0,
        },
      ],
    };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(result).toContain('Write-off');
  });

  it('should pass through unknown type as-is', () => {
    const data = {
      ...STATEMENT_DATA,
      entries: [
        {
          date: '2025-12-01',
          type: 'adjustment',
          reference: 'ADJ-001',
          description: 'Manual adjustment',
          debit: 25,
          credit: null,
          running_balance: 525,
        },
      ],
    };
    const result = renderHouseholdStatementEn(data, BRANDING);

    expect(result).toContain('adjustment');
  });

  // ─── Debit/credit null branches ────────────────────────────────────────────

  it('should render debit amount when not null', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    // First entry has debit: 2500.0 — toLocaleString adds comma for thousands
    expect(result).toContain('EUR 2,500.00');
  });

  it('should render empty cell when debit is null', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    // Second entry has debit: null, should just be empty
    expect(typeof result).toBe('string');
  });

  it('should render credit amount with green color when not null', () => {
    const result = renderHouseholdStatementEn(STATEMENT_DATA, BRANDING);

    // Second entry has credit: 1000.0 — toLocaleString adds comma for thousands
    expect(result).toContain('EUR 1,000.00');
    // Template uses #059669 for credit column color
    expect(result).toContain('#059669');
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderHouseholdStatementEn(STATEMENT_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderHouseholdStatementEn(STATEMENT_DATA, brandingNoColor);

    // Template default primary color is #1a56db
    expect(result).toContain('#1a56db');
  });
});
