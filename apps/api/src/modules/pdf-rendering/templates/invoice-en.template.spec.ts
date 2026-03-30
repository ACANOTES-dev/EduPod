import type { PdfBranding } from '../pdf-rendering.service';

import { renderInvoiceEn } from './invoice-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const INVOICE_DATA = {
  invoice_number: 'INV-202601-0001',
  status: 'issued',
  issue_date: '2026-01-15',
  due_date: '2026-02-15',
  currency_code: 'EUR',
  household: {
    household_name: 'Smith Family',
    billing_parent_name: 'Robert Smith',
    address_line_1: '123 Main Street',
    address_line_2: 'Apt 4B',
    city: 'Dublin',
    country: 'Ireland',
    postal_code: 'D01 AB12',
  },
  lines: [
    {
      description: 'Tuition Fee - Term 1',
      quantity: 1,
      unit_amount: 2500.0,
      line_total: 2500.0,
    },
    {
      description: 'Book Fee',
      quantity: 3,
      unit_amount: 50.0,
      line_total: 150.0,
    },
  ],
  subtotal_amount: 2650.0,
  discount_amount: 100.0,
  total_amount: 2550.0,
  amount_paid: 1000.0,
  balance_amount: 1550.0,
  payment_allocations: [
    {
      payment_reference: 'PAY-202601-0001',
      allocated_amount: 1000.0,
      received_at: '2026-01-20',
    },
  ],
};

describe('renderInvoiceEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include invoice number and status', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('INV-202601-0001');
  });

  it('should include household billing information', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('Smith Family');
    expect(result).toContain('Robert Smith');
    expect(result).toContain('123 Main Street');
    expect(result).toContain('Dublin');
  });

  it('should render line items', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('Tuition Fee - Term 1');
    expect(result).toContain('Book Fee');
    expect(result).toContain('EUR 2500.00');
    expect(result).toContain('EUR 150.00');
  });

  it('should render financial totals', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('EUR 2650.00');
    expect(result).toContain('EUR 100.00');
    expect(result).toContain('EUR 2550.00');
    expect(result).toContain('EUR 1000.00');
    expect(result).toContain('EUR 1550.00');
  });

  it('should include dates', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('2026-01-15');
    expect(result).toContain('2026-02-15');
  });

  it('should render payment allocations', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('PAY-202601-0001');
  });

  it('should include school branding', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('Test Academy');
    expect(result).toContain('https://example.com/logo.png');
  });

  it('should handle null issue_date', () => {
    const data = { ...INVOICE_DATA, issue_date: null };
    const result = renderInvoiceEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle empty line items', () => {
    const data = { ...INVOICE_DATA, lines: [], payment_allocations: [] };
    const result = renderInvoiceEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  it('should handle null household address fields', () => {
    const data = {
      ...INVOICE_DATA,
      household: {
        household_name: 'Test Family',
        billing_parent_name: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        country: null,
        postal_code: null,
      },
    };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('Test Family');
  });
});
