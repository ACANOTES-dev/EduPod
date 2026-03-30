import type { PdfBranding } from '../pdf-rendering.service';

import { renderInvoiceAr } from './invoice-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const INVOICE_DATA = {
  invoice_number: 'INV-202601-0002',
  status: 'issued',
  issue_date: '2026-01-15',
  due_date: '2026-02-15',
  currency_code: 'LYD',
  household: {
    household_name: 'عائلة محمد',
    billing_parent_name: 'محمد أحمد',
    address_line_1: 'شارع الجمهورية',
    address_line_2: null,
    city: 'طرابلس',
    country: 'ليبيا',
    postal_code: null,
  },
  lines: [
    {
      description: 'رسوم دراسية - الفصل الأول',
      quantity: 1,
      unit_amount: 3000.0,
      line_total: 3000.0,
    },
  ],
  subtotal_amount: 3000.0,
  discount_amount: 0,
  total_amount: 3000.0,
  amount_paid: 0,
  balance_amount: 3000.0,
  payment_allocations: [],
};

describe('renderInvoiceAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should include invoice number', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('INV-202601-0002');
  });

  it('should render Arabic household info', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('عائلة محمد');
    expect(result).toContain('محمد أحمد');
    expect(result).toContain('طرابلس');
  });

  it('should render line items', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('رسوم دراسية - الفصل الأول');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  it('should handle empty payment allocations', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
