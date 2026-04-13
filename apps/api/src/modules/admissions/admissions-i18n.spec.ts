import { ADMISSIONS_I18N, admissionsT } from './admissions-i18n';

describe('admissionsT', () => {
  it('returns English string for locale "en"', () => {
    const result = admissionsT('en', 'invoiceLineDescription', {
      feeName: 'Tuition Fee',
      studentName: 'Alice Smith',
    });
    expect(result).toBe('Tuition Fee — Alice Smith');
  });

  it('returns Arabic string for locale "ar"', () => {
    const result = admissionsT('ar', 'paymentReason', { source: 'cash' });
    expect(result).toBe('دفعة القبول (cash)');
  });

  it('returns Arabic payment reason with reference for locale "ar"', () => {
    const result = admissionsT('ar', 'paymentReasonWithRef', {
      source: 'bank_transfer',
      reference: 'TRX-123',
    });
    expect(result).toBe('دفعة القبول (bank_transfer) — المرجع: TRX-123');
  });

  it('returns English payment reason with reference for locale "en"', () => {
    const result = admissionsT('en', 'paymentReasonWithRef', {
      source: 'stripe',
      reference: 'REF-456',
    });
    expect(result).toBe('Admissions payment (stripe) — ref: REF-456');
  });

  it('falls back to English for unknown locale', () => {
    const result = admissionsT('fr', 'paymentReason', { source: 'cash' });
    expect(result).toBe('Admissions payment (cash)');
  });

  it('returns the raw template when no params are provided', () => {
    const result = admissionsT('en', 'paymentReason');
    expect(result).toBe('Admissions payment ({source})');
  });

  it('has identical keys in both locale maps', () => {
    const enKeys = Object.keys(ADMISSIONS_I18N.en).sort();
    const arKeys = Object.keys(ADMISSIONS_I18N.ar).sort();
    expect(enKeys).toEqual(arKeys);
  });

  it('uses the Arabic invoice line description template with tenant-managed data', () => {
    const result = admissionsT('ar', 'invoiceLineDescription', {
      feeName: 'رسوم التسجيل',
      studentName: 'أحمد محمد',
    });
    expect(result).toBe('رسوم التسجيل — أحمد محمد');
  });
});
