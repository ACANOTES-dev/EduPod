import type { PdfBranding } from '../../pdf-rendering.service';

import {
  getPdfTemplateRenderer,
  PDF_TEMPLATE_BUNDLES,
  PDF_TEMPLATE_KEYS,
  renderPdfTemplate,
  SUPPORTED_PDF_LOCALES,
} from './index';

const BRANDING: PdfBranding = {
  school_name: 'North Harbour Quality School',
  school_name_ar: 'مدرسة نورث هاربر',
};

const INVOICE_DATA = {
  invoice_number: 'INV-202605-0001',
  status: 'partially_paid',
  issue_date: '2026-04-29T00:00:00.000Z',
  due_date: '2026-05-29T00:00:00.000Z',
  currency_code: 'EUR',
  household: {
    household_name: 'O Connor Household',
    billing_parent_name: 'Aisling O Connor',
    address_line_1: '1 Harbour Road',
    address_line_2: null,
    city: 'Dublin',
    country: 'Ireland',
    postal_code: 'D01',
  },
  lines: [
    {
      description: 'Tuition fee',
      quantity: 1,
      unit_amount: 100,
      line_total: 100,
    },
  ],
  subtotal_amount: 100,
  discount_amount: 0,
  total_amount: 100,
  amount_paid: 25,
  balance_amount: 75,
  payment_allocations: [],
};

describe('PDF template locale registry', () => {
  it('exposes every PDF template for every supported PDF locale', () => {
    const expectedKeys = [...PDF_TEMPLATE_KEYS].sort();

    for (const locale of SUPPORTED_PDF_LOCALES) {
      expect(Object.keys(PDF_TEMPLATE_BUNDLES[locale]).sort()).toEqual(expectedKeys);
    }
  });

  it('routes English and Arabic to their first-class template bundles', () => {
    expect(renderPdfTemplate('invoice', 'en', INVOICE_DATA, BRANDING)).toContain('INVOICE');

    const arabicHtml = renderPdfTemplate('invoice', 'ar', INVOICE_DATA, BRANDING);

    expect(arabicHtml).toContain('dir="rtl"');
    expect(arabicHtml).toContain('فاتورة');
  });

  it('routes LTR languages through explicit locale template bundles', () => {
    expect(renderPdfTemplate('invoice', 'fr', INVOICE_DATA, BRANDING)).toContain('FACTURE');
    expect(renderPdfTemplate('invoice', 'de', INVOICE_DATA, BRANDING)).toContain('RECHNUNG');
    expect(renderPdfTemplate('invoice', 'es', INVOICE_DATA, BRANDING)).toContain('FACTURA');
    expect(renderPdfTemplate('invoice', 'ga', INVOICE_DATA, BRANDING)).toContain('SONRASC');
    expect(renderPdfTemplate('invoice', 'it', INVOICE_DATA, BRANDING)).toContain('FATTURA');
    expect(renderPdfTemplate('invoice', 'ro', INVOICE_DATA, BRANDING)).toContain('FACTURĂ');
  });

  it('fails hard for missing PDF template locales and keys', () => {
    expect(() => getPdfTemplateRenderer('invoice', 'pl')).toThrow(/MISSING_PDF_TEMPLATE/);
    expect(() => getPdfTemplateRenderer('unknown-template', 'en')).toThrow(/MISSING_PDF_TEMPLATE/);
  });
});
