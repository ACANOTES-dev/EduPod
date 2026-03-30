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
  household: {
    household_name: 'عائلة أحمد',
    billing_parent_name: 'أحمد علي',
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
});
