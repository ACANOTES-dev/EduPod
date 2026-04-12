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

  it('should include dates formatted for display', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('15 Jan 2026');
    expect(result).toContain('15 Feb 2026');
  });

  it('should accept Date objects for issue_date and due_date without crashing (regression: FIN-001)', () => {
    const data = {
      ...INVOICE_DATA,
      issue_date: new Date('2026-01-15T00:00:00.000Z'),
      due_date: new Date('2026-02-15T00:00:00.000Z'),
    };
    const result = renderInvoiceEn(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toContain('15 Jan 2026');
    expect(result).toContain('15 Feb 2026');
  });

  it('should accept nested payment.payment_reference / payment.received_at shape (service include)', () => {
    const data = {
      ...INVOICE_DATA,
      payment_allocations: [
        {
          allocated_amount: 1000.0,
          payment: {
            payment_reference: 'PAY-202601-0001',
            received_at: new Date('2026-01-20T00:00:00.000Z'),
          },
        },
      ],
    };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('PAY-202601-0001');
    expect(result).toContain('20 Jan 2026');
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

  // ─── Status color branches ─────────────────────────────────────────────────

  it('should render green color for paid status', () => {
    const data = { ...INVOICE_DATA, status: 'paid' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#16a34a');
    expect(result).toContain('Paid');
  });

  it('should render red color for overdue status', () => {
    const data = { ...INVOICE_DATA, status: 'overdue' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#dc2626');
    expect(result).toContain('Overdue');
  });

  it('should render gray color for void status', () => {
    const data = { ...INVOICE_DATA, status: 'void' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#6b7280');
  });

  it('should render gray color for cancelled status', () => {
    const data = { ...INVOICE_DATA, status: 'cancelled' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#6b7280');
  });

  it('should render amber color for partially_paid status', () => {
    const data = { ...INVOICE_DATA, status: 'partially_paid' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#d97706');
    expect(result).toContain('Partially Paid');
  });

  it('should render blue color for default/unknown status', () => {
    const data = { ...INVOICE_DATA, status: 'draft' };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).toContain('#2563eb');
  });

  // ─── Conditional amount rendering branches ─────────────────────────────────

  it('should hide discount row when discount_amount is 0', () => {
    const data = { ...INVOICE_DATA, discount_amount: 0 };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).not.toContain('Discount');
  });

  it('should hide amount_paid row when amount_paid is 0', () => {
    const data = { ...INVOICE_DATA, amount_paid: 0 };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).not.toContain('Amount Paid');
  });

  it('should hide balance_amount row when balance_amount is 0', () => {
    const data = { ...INVOICE_DATA, balance_amount: 0 };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).not.toContain('Balance Due');
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo School' };
    const result = renderInvoiceEn(INVOICE_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color when none provided', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderInvoiceEn(INVOICE_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Payment section conditional rendering ─────────────────────────────────

  it('should render payment history section when allocations exist', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('Payment History');
    expect(result).toContain('PAY-202601-0001');
  });

  it('should omit payment history section when no allocations', () => {
    const data = { ...INVOICE_DATA, payment_allocations: [] };
    const result = renderInvoiceEn(data, BRANDING);

    expect(result).not.toContain('Payment History');
  });

  // ─── Address formatting branches ───────────────────────────────────────────

  it('should omit address section when all address fields are null', () => {
    const data = {
      ...INVOICE_DATA,
      household: {
        ...INVOICE_DATA.household,
        address_line_1: null,
        address_line_2: null,
        city: null,
        country: null,
        postal_code: null,
      },
    };
    const result = renderInvoiceEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  it('should join city and postal_code when both present', () => {
    const result = renderInvoiceEn(INVOICE_DATA, BRANDING);

    expect(result).toContain('Dublin');
    expect(result).toContain('D01 AB12');
  });
});
