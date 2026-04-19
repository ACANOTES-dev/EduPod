import type { PdfBranding } from '../pdf-rendering.service';

import { renderReceiptAr } from './receipt-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const RECEIPT_DATA = {
  receipt_number: 'REC-202601-0002',
  issued_at: '2026-01-22',
  currency_code: 'LYD',
  outstanding_before: 500.0,
  remaining_after: 0,
  household: {
    household_name: 'عائلة أحمد',
    household_number: 'HH-00042',
    billing_parent_name: 'أحمد علي',
    billing_parent_phone: '+971501234567',
  },
  payment: {
    payment_reference: 'PAY-202601-0002',
    payment_method: 'cash',
    amount: 500.0,
    received_at: '2026-01-21',
  },
  allocations: [
    {
      invoice_number: 'INV-202601-0003',
      allocated_amount: 500.0,
    },
  ],
};

describe('renderReceiptAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should include receipt number', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('REC-202601-0002');
  });

  it('should render Arabic household info', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('عائلة أحمد');
    expect(result).toContain('أحمد علي');
  });

  it('should render payment reference', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('PAY-202601-0002');
  });

  it('should render allocations', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('INV-202601-0003');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });

  // ─── Payment method formatting branches ────────────────────────────────────

  it('should format stripe payment method in Arabic', () => {
    const data = {
      ...RECEIPT_DATA,
      payment: { ...RECEIPT_DATA.payment, payment_method: 'stripe' },
    };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).toContain('\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A (Stripe)');
  });

  it('should format bank_transfer payment method in Arabic', () => {
    const data = {
      ...RECEIPT_DATA,
      payment: { ...RECEIPT_DATA.payment, payment_method: 'bank_transfer' },
    };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).toContain('\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A');
  });

  it('should format card_manual payment method in Arabic', () => {
    const data = {
      ...RECEIPT_DATA,
      payment: { ...RECEIPT_DATA.payment, payment_method: 'card_manual' },
    };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).toContain('\u0628\u0637\u0627\u0642\u0629');
  });

  it('should pass through unknown payment method as-is', () => {
    const data = {
      ...RECEIPT_DATA,
      payment: { ...RECEIPT_DATA.payment, payment_method: 'cheque' },
    };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).toContain('cheque');
  });

  // ─── Conditional branches ──────────────────────────────────────────────────

  it('should omit billing parent when null', () => {
    const data = {
      ...RECEIPT_DATA,
      household: { ...RECEIPT_DATA.household, billing_parent_name: null },
    };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).toContain('عائلة أحمد');
  });

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderReceiptAr(RECEIPT_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should fall back to school_name when school_name_ar is not set', () => {
    const brandingNoAr: PdfBranding = { school_name: 'English Only' };
    const result = renderReceiptAr(RECEIPT_DATA, brandingNoAr);

    expect(result).toContain('English Only');
  });

  it('should render allocation section when allocations exist', () => {
    const result = renderReceiptAr(RECEIPT_DATA, BRANDING);

    expect(result).toContain(
      '\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0648\u0632\u064A\u0639',
    );
  });

  it('should hide allocation section when no allocations', () => {
    const data = { ...RECEIPT_DATA, allocations: [] };
    const result = renderReceiptAr(data, BRANDING);

    expect(result).not.toContain(
      '\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0648\u0632\u064A\u0639',
    );
  });
});
