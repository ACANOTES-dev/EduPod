import * as Handlebars from 'handlebars';

import { registerI18nHelpers } from './handlebars-i18n';

describe('registerI18nHelpers', () => {
  beforeEach(() => {
    registerI18nHelpers(Handlebars, {
      messages: {
        en: { 'receipt.heading': 'Receipt' },
        ar: { 'receipt.heading': 'إيصال' },
      },
    });
  });

  it('t resolves a key for the requested locale', () => {
    const tpl = Handlebars.compile("{{t 'receipt.heading' locale}}");

    expect(tpl({ locale: 'en' })).toBe('Receipt');
    expect(tpl({ locale: 'ar' })).toBe('إيصال');
  });

  it('t throws on a missing key', () => {
    const tpl = Handlebars.compile("{{t 'missing.key' locale}}");

    expect(() => tpl({ locale: 'en' })).toThrow(/MISSING_PDF_MESSAGE/);
  });

  it('formatDate keeps Western numerals for Arabic', () => {
    const tpl = Handlebars.compile('{{formatDate value locale}}');
    const out = tpl({ value: '2026-04-25T12:00:00Z', locale: 'ar' });

    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/[٠-٩]/);
  });

  it('formatCurrency includes the requested currency symbol', () => {
    const tpl = Handlebars.compile('{{formatCurrency amount locale currency}}');

    expect(tpl({ amount: 1234.5, locale: 'en', currency: 'EUR' })).toContain('€');
  });

  it('formatNumber applies grouping', () => {
    const tpl = Handlebars.compile('{{formatNumber value locale}}');

    expect(tpl({ value: 1234567, locale: 'en' })).toBe('1,234,567');
  });

  it('getLocalizedSchoolName falls back to the canonical name', () => {
    const tpl = Handlebars.compile('{{getLocalizedSchoolName tenant locale}}');

    expect(
      tpl({ tenant: { name: 'Nurul Huda', school_name_ar: 'مدرسة نور الهدى' }, locale: 'ar' }),
    ).toBe('مدرسة نور الهدى');
    expect(tpl({ tenant: { name: 'Nurul Huda' }, locale: 'fr' })).toBe('Nurul Huda');
  });
});
