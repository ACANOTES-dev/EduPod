import type { PdfBranding } from '../pdf-rendering.service';

import { renderReceiptEn } from './receipt-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const RECEIPT_DATA = {
  receipt_number: 'REC-202601-0001',
  issued_at: '2026-01-20',
  currency_code: 'EUR',
  household: {
    household_name: 'Smith Family',
    billing_parent_name: 'Robert Smith',
  },
  payment: {
    payment_reference: 'PAY-202601-0001',
    payment_method: 'bank_transfer',
    amount: 1000.0,
    received_at: '2026-01-18',
  },
  allocations: [
    {
      invoice_number: 'INV-202601-0001',
      allocated_amount: 800.0,
    },
    {
      invoice_number: 'INV-202601-0002',
      allocated_amount: 200.0,
    },
  ],
};

describe('renderReceiptEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include receipt number', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('REC-202601-0001');
  });

  it('should include household info', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('Smith Family');
    expect(result).toContain('Robert Smith');
  });

  it('should render payment details', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('PAY-202601-0001');
    expect(result).toContain('Bank Transfer');
  });

  it('should render allocations', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('INV-202601-0001');
    expect(result).toContain('INV-202601-0002');
  });

  it('should include school branding', () => {
    const result = renderReceiptEn(RECEIPT_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle null billing parent', () => {
    const data = {
      ...RECEIPT_DATA,
      household: {
        household_name: 'Test Family',
        billing_parent_name: null,
      },
    };
    const result = renderReceiptEn(data, BRANDING);

    expect(result).toContain('Test Family');
  });

  it('should handle empty allocations', () => {
    const data = { ...RECEIPT_DATA, allocations: [] };
    const result = renderReceiptEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
