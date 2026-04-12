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

  // ─── Status color branches ─────────────────────────────────────────────────

  it('should render green color for paid status', () => {
    const data = { ...INVOICE_DATA, status: 'paid' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#16a34a');
    expect(result).toContain('\u0645\u062F\u0641\u0648\u0639\u0629');
  });

  it('should render red color for overdue status', () => {
    const data = { ...INVOICE_DATA, status: 'overdue' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#dc2626');
  });

  it('should render gray color for void status', () => {
    const data = { ...INVOICE_DATA, status: 'void' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#6b7280');
  });

  it('should render gray color for cancelled status', () => {
    const data = { ...INVOICE_DATA, status: 'cancelled' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#6b7280');
  });

  it('should render amber color for partially_paid status', () => {
    const data = { ...INVOICE_DATA, status: 'partially_paid' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#d97706');
  });

  it('should use default blue for unknown status', () => {
    const data = { ...INVOICE_DATA, status: 'unknown_status' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('#2563eb');
  });

  it('should fall back to raw status for unmapped formatStatusAr value', () => {
    const data = { ...INVOICE_DATA, status: 'custom_status' };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('custom_status');
  });

  // ─── Conditional amount rendering branches ─────────────────────────────────

  it('should show discount when discount_amount > 0', () => {
    const data = { ...INVOICE_DATA, discount_amount: 200 };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain('\u0627\u0644\u062E\u0635\u0645');
  });

  it('should hide discount when discount_amount is 0', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    // INVOICE_DATA has discount_amount: 0
    expect(result).not.toContain('\u0627\u0644\u062E\u0635\u0645');
  });

  it('should show amount_paid when > 0', () => {
    const data = { ...INVOICE_DATA, amount_paid: 500 };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain(
      '\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639',
    );
  });

  it('should show balance when balance_amount > 0', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain(
      '\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u0633\u062A\u062D\u0642',
    );
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderInvoiceAr(INVOICE_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should fall back to school_name when school_name_ar is not set', () => {
    const brandingNoAr: PdfBranding = { school_name: 'English Only School' };
    const result = renderInvoiceAr(INVOICE_DATA, brandingNoAr);

    expect(result).toContain('English Only School');
  });

  it('should use default primary color when none provided', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderInvoiceAr(INVOICE_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Null issue_date branch ───────────���────────────────────────────────────

  it('should handle null issue_date', () => {
    const data = { ...INVOICE_DATA, issue_date: null };
    const result = renderInvoiceAr(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  it('should show issue_date when present', () => {
    const data = { ...INVOICE_DATA, issue_date: '2026-01-15' };
    const result = renderInvoiceAr(data, BRANDING);

    // Formatted with Latin numerals (CLAUDE.md constraint); month name localized to Arabic
    expect(result).toMatch(/15[\s\u00a0]\S+[\s\u00a0]2026/);
  });

  it('should accept Date objects for issue_date and due_date without crashing (regression: FIN-001)', () => {
    const data = {
      ...INVOICE_DATA,
      issue_date: new Date('2026-01-15T00:00:00.000Z'),
      due_date: new Date('2026-02-15T00:00:00.000Z'),
    };
    const result = renderInvoiceAr(data, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toMatch(/15[\s\u00a0]\S+[\s\u00a0]2026/);
  });

  // ─── Billing parent name branch ────────────────────────────────────────────

  it('should show billing parent name when set', () => {
    const result = renderInvoiceAr(INVOICE_DATA, BRANDING);

    expect(result).toContain('محمد أحمد');
  });

  it('should omit billing parent line when null', () => {
    const data = {
      ...INVOICE_DATA,
      household: { ...INVOICE_DATA.household, billing_parent_name: null },
    };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).not.toContain('\u0639\u0646\u0627\u064A\u0629');
  });

  // ─── Payment section branch ───��────────────────────────────────────────────

  it('should render payment section when allocations exist', () => {
    const data = {
      ...INVOICE_DATA,
      payment_allocations: [
        { payment_reference: 'PAY-001', allocated_amount: 500, received_at: '2026-01-20' },
      ],
    };
    const result = renderInvoiceAr(data, BRANDING);

    expect(result).toContain(
      '\u0633\u062C\u0644 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A',
    );
  });
});
